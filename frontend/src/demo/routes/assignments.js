// Port of backend/src/modules/assignments.js (classAssignmentsRouter, assignmentsRouter, submissionRouter).
import {
  badRequest,
  byId,
  classAccess,
  classStudentIds,
  db,
  fileRef,
  fileText,
  findOr404,
  forbidden,
  insert,
  jsonField,
  notFound,
  notify,
  remove,
  requireRole,
  shortId,
  update,
  userSummary,
  awardXp,
  XP,
} from "../core.js";
import { route } from "../router.js";
import { think } from "../ai.js";

// ---- validation (mirrors the zod schemas; messages formatted "path: message") ----

const MAX_FILE_MB = 15;
const fail = (path, msg) => badRequest(path ? `${path}: ${msg}` : msg);

function str(v, path, { min = 0, max, minMsg = `String must contain at least ${min} character(s)` } = {}) {
  if (typeof v !== "string") throw fail(path, v === undefined ? "Required" : "Expected string");
  const s = v.trim();
  if (s.length < min) throw fail(path, minMsg);
  if (max && s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}
/** zOptText: "" -> undefined. */
const optStr = (v, path, max) => (v === undefined || v === null || (typeof v === "string" && !v.trim()) ? undefined : str(v, path, { max }));
/** zNullableText: "" or null -> null, undefined -> undefined. */
const nullStr = (v, path, max) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : str(v, path, { max }));
/** z.coerce.number() with optional bounds. */
function num(v, path, { min, max } = {}) {
  const n = Number(v);
  if (Number.isNaN(n)) throw fail(path, "Expected number, received nan");
  if (min != null && n < min) throw fail(path, `Number must be greater than or equal to ${min}`);
  if (max != null && n > max) throw fail(path, `Number must be less than or equal to ${max}`);
  return n;
}
/** zBool: accepts "true"/"false" strings as well as booleans. */
function bool(v, path) {
  if (v === undefined) return undefined;
  const b = v === "true" ? true : v === "false" ? false : v;
  if (typeof b !== "boolean") throw fail(path, "Expected boolean");
  return b;
}
/** dueAt: "" / "null" -> null, otherwise coerced to a Date. */
function dueDate(v) {
  if (v === undefined) return undefined;
  if (v === "" || v === "null" || v === null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw fail("dueAt", "Invalid date");
  return d;
}
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** assignmentFields; `partial` makes the title optional and instructions nullable (PATCH). */
function assignmentFields(body, { partial = false } = {}) {
  return strip({
    title: partial && body.title === undefined ? undefined : str(body.title, "title", { min: 2, max: 160, minMsg: "Give the assignment a title" }),
    instructions: partial ? nullStr(body.instructions, "instructions", 20_000) : optStr(body.instructions, "instructions", 20_000),
    dueAt: dueDate(body.dueAt),
    points: body.points === undefined ? undefined : num(body.points, "points", { min: 0, max: 1000 }),
    allowLate: bool(body.allowLate, "allowLate"),
    aiFeedback: bool(body.aiFeedback, "aiFeedback"),
  });
}

function normalizeRubric(raw) {
  const rows = raw ?? [];
  if (!Array.isArray(rows)) throw fail("", "Expected array, received " + typeof rows);
  if (rows.length > 12) throw fail("", "Array must contain at most 12 element(s)");
  return rows.map((r, i) => {
    if (!r || typeof r !== "object") throw fail(String(i), "Expected object");
    if (r.id !== undefined && (typeof r.id !== "string" || r.id.length > 40)) throw fail(`${i}.id`, "String must contain at most 40 character(s)");
    return {
      id: r.id || shortId(),
      title: str(r.title, `${i}.title`, { min: 1, max: 120, minMsg: "Each rubric row needs a title" }),
      description: optStr(r.description, `${i}.description`, 600) ?? null,
      points: num(r.points, `${i}.points`, { min: 0, max: 1000 }),
    };
  });
}

/** multer limits: count, size and accepted types. */
const DOC_TYPES = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-|json|zip)|text\/(plain|markdown|csv)|image\/(png|jpe?g|webp|gif|heic|heif))/;
const READABLE = /^(image\/|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml|text\/(plain|markdown|csv))/;
function uploads(req, max, kind = "any") {
  const files = req.files?.attachments ?? [];
  const extra = Object.keys(req.files ?? {}).find((k) => k !== "attachments");
  if (extra) throw badRequest("Unexpected file field.");
  if (files.length > max) throw badRequest("Too many files attached.");
  for (const f of files) {
    if ((f.size ?? 0) > MAX_FILE_MB * 1024 * 1024) throw badRequest(`File is too large (max ${MAX_FILE_MB} MB).`);
    let type = f.type || "";
    if (!type || type === "application/octet-stream") type = /\.md$/i.test(f.name) ? "text/markdown" : /\.txt$/i.test(f.name) ? "text/plain" : /\.pdf$/i.test(f.name) ? "application/pdf" : type;
    if (!(kind === "readable" ? READABLE : DOC_TYPES).test(type)) throw badRequest(`Unsupported file type: ${f.name}`);
  }
  return files;
}
const saveFiles = (files) => Promise.all(files.map(fileRef));

// ---- helpers ---------------------------------------------------------------

export function studentStatus(assignment, submission, now = new Date()) {
  if (submission?.status === "graded") return "graded";
  if (submission) return submission.late ? "late" : "submitted";
  if (assignment.dueAt && assignment.dueAt < now) return "missing";
  return "assigned";
}

function loadAssignment(id, user, { teacher = false } = {}) {
  const assignment = findOr404("assignments", id, "Assignment");
  const access = classAccess(assignment.classroomId, user, { teacher });
  return { assignment, ...access };
}

/** Submission row with aiDraft left out (what students see). */
const omitDraft = (s) => {
  if (!s) return null;
  const { aiDraft: _omit, ...rest } = s;
  return rest;
};
const findSubmission = (assignmentId, studentId) => db.submissions.find((s) => s.assignmentId === assignmentId && s.studentId === studentId) ?? null;

/** Mongo sorts null before any date in ascending order. */
const dueAsc = (a, b) => {
  if (a.dueAt == null && b.dueAt == null) return 0;
  if (a.dueAt == null) return -1;
  if (b.dueAt == null) return 1;
  return a.dueAt - b.dueAt;
};

// ---- simulated AI (shapes match the backend zod schemas) --------------------

const STOP = new Set(
  "the a an and or of to in on for with by is are was were be been this that these those it its as at from into than then their there which who what when where how why can could should would may might will not your you each least show work write answer answers explain explains describe describes give using use include clear clearly correct correctly identifies shows".split(" "),
);
const words = (s) => new Set(((s || "").toLowerCase().match(/[a-z0-9²³°]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
/** Share of `ref`'s key words that appear in `text` (0-1). */
function coverage(text, ref) {
  const r = words(ref);
  if (!r.size) return 0.6;
  const t = words(text);
  let hit = 0;
  for (const w of r) if (t.has(w) || [...t].some((x) => x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) hit += 1;
  return hit / r.size;
}
/** Deterministic jitter in [-1, 1] from a string. */
function jitter(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const halfStep = (x) => Math.round(x * 2) / 2;
const wordCount = (s) => (s || "").trim().split(/\s+/).filter(Boolean).length;
const firstSentence = (s, max = 70) => {
  const t = (s || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
};
const lower1 = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const noDot = (s) => (s || "").replace(/[.\s]+$/, "");

/** Rough 0-1 quality estimate for a piece of student work against the brief. */
function quality(text, assignment, seed, hasFiles) {
  const brief = `${assignment.title} ${assignment.instructions ?? ""} ${assignment.rubric.map((r) => `${r.title} ${r.description ?? ""}`).join(" ")}`;
  if (!text?.trim()) return clamp(0.72 + 0.08 * jitter(seed), 0.5, 0.9);
  const len = Math.min(1, wordCount(text) / 120);
  const cov = Math.min(1, coverage(text, brief) * 2.2);
  return clamp(0.42 + 0.22 * len + 0.3 * cov + (hasFiles ? 0.05 : 0) + 0.06 * jitter(seed), 0.35, 0.96);
}

const RUBRIC_TEMPLATES = [
  { test: /lab|experiment|practical|investigat|observ/i, rows: [["Method & data", "A clear, repeatable procedure with a complete, labelled data table.", 3], ["Analysis", "Results are processed correctly with the relevant equations and working shown.", 3], ["Conclusion", "The conclusion answers the aim and is supported by the data.", 2], ["Evaluation", "Identifies real sources of error and suggests specific improvements.", 2]] },
  { test: /essay|write|reflect|discuss|argument|report|explain|describe/i, rows: [["Understanding", "Shows accurate, detailed understanding of the key ideas.", 3], ["Use of examples", "Supports each point with relevant, specific examples.", 3], ["Structure", "Ideas are organised logically with clear paragraphs and transitions.", 2], ["Communication", "Writing is clear and precise, using correct subject vocabulary.", 2]] },
  { test: /problem|worksheet|set|exercise|question|calculat|solve|practice|graph/i, rows: [["Accuracy", "Final answers are correct with appropriate units.", 4], ["Working shown", "Every step of the method is shown and easy to follow.", 3], ["Method choice", "Chooses and justifies an appropriate method for each problem.", 2], ["Presentation", "Work is neat, labelled and in the order asked.", 1]] },
  { test: /project|present|poster|design|build|model/i, rows: [["Content", "Covers the required content accurately and in depth.", 4], ["Creativity", "Shows original thinking in how the ideas are presented.", 2], ["Organisation", "The project is well planned, structured and complete.", 2], ["Delivery", "Communicates clearly to the intended audience.", 2]] },
];
const DEFAULT_RUBRIC = [["Understanding", "Demonstrates a secure grasp of the core concepts.", 4], ["Application", "Applies ideas correctly to the task with clear reasoning.", 3], ["Communication", "Explains thinking clearly using correct terminology.", 2], ["Completeness", "Addresses every part of the task.", 1]];

function suggestCriteria(title, instructions) {
  const hay = `${title} ${instructions ?? ""}`;
  const rows = RUBRIC_TEMPLATES.find((t) => t.test.test(title))?.rows ?? RUBRIC_TEMPLATES.find((t) => t.test.test(hay))?.rows ?? DEFAULT_RUBRIC;
  return rows.map(([t, description, points]) => ({ title: t, description, points }));
}

/** draftGrade: the AiGradeDraft the backend stores on a submission. */
async function draftGrade(submission, assignment, { pause = true } = {}) {
  const text = submission.text ?? "";
  const files = submission.attachments ?? [];
  if (!text.trim() && !files.length) throw badRequest("This submission has no readable content for AI grading.");
  if (pause) await think(900, 1800);

  const q = quality(text, assignment, submission.id, files.length > 0);
  const quote = firstSentence(text);
  let rubricScores = [];
  let total;
  if (assignment.rubric.length) {
    rubricScores = assignment.rubric.map((r) => {
      const qi = clamp(q + 0.1 * jitter(submission.id + r.id) + (text ? 0.15 * (coverage(text, `${r.title} ${r.description ?? ""}`) - 0.3) : 0), 0.2, 1);
      const score = clamp(halfStep(r.points * qi), 0, r.points);
      const desc = noDot(r.description);
      const comment =
        score >= r.points * 0.85
          ? desc ? `Strong — ${lower1(desc)}.` : `Strong work on ${lower1(r.title)}.`
          : score >= r.points * 0.6
            ? desc ? `Mostly there. For full marks: ${lower1(desc)}.` : `Mostly there — add more depth on ${lower1(r.title)}.`
            : desc ? `Needs work: ${lower1(desc)}.` : `Needs work on ${lower1(r.title)}; develop it with specific detail.`;
      return { criterionId: r.id, score, comment, title: r.title, ratio: r.points ? score / r.points : 1 };
    });
    total = rubricScores.reduce((s, r) => s + r.score, 0);
  } else total = halfStep(assignment.points * q);

  const sorted = [...rubricScores].sort((a, b) => b.ratio - a.ratio);
  const descOf = (r) => noDot(assignment.rubric.find((x) => x.id === r.criterionId).description);
  const strengths = sorted.length
    ? sorted.filter((r) => r.ratio >= 0.8).slice(0, 3).map((r) => (descOf(r) ? `${r.title} — ${lower1(descOf(r))}` : `${r.title} is handled well`))
    : [];
  if (!strengths.length) strengths.push(q >= 0.6 ? "Engages directly with the task" : "Makes a start on the key ideas");
  if (text && wordCount(text) >= 40 && strengths.length < 3) strengths.push("Explains reasoning in full sentences");
  const improvements = sorted.length
    ? [...sorted].reverse().filter((r) => r.ratio < 0.8).slice(0, 3).map((r) => (descOf(r) ? `${r.title} — ${lower1(descOf(r))}` : `${r.title} — add more depth and specific detail`))
    : [];
  if (!improvements.length) improvements.push(q >= 0.8 ? "Push further with one extension idea or real-world link" : "Show each step of your reasoning explicitly");
  if (text && wordCount(text) < 40) improvements.push("Develop your answer — it is quite brief for the task");

  const pctScore = assignment.points ? total / assignment.points : q;
  const opener =
    pctScore >= 0.85 ? "This is a strong piece of work that meets the brief well." : pctScore >= 0.65 ? "A solid submission that covers most of what the task asks for." : "You've made a start, but several parts of the task still need attention.";
  const feedback = [
    opener,
    "",
    `**What worked:** ${strengths.slice(0, 2).map(lower1).join("; ")}.${quote ? ` Your point that "${quote}" is a good foundation.` : files.length ? " Your attached work shows clear effort." : ""}`,
    "",
    `**What to improve:** ${improvements.slice(0, 2).map(lower1).join("; ")}.`,
    "",
    `**How to get there:** Re-read the instructions${assignment.rubric.length ? " and rubric" : ""}, then add one specific example or calculation for each point you make and check every requirement is answered.`,
  ].join("\n");

  return {
    score: Math.round(clamp(total, 0, assignment.points) * 10) / 10,
    feedback,
    rubricScores: rubricScores.map(({ criterionId, score, comment }) => ({ criterionId, score, comment })),
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    confidence: !text.trim() ? "low" : wordCount(text) >= 60 && q >= 0.55 ? "high" : "medium",
    model: "demo",
    generatedAt: new Date(),
  };
}

/** Pre-submission coaching: { summary, checklist, strengths, nextSteps } — never a grade. */
function draftFeedback(assignment, text, fileNames) {
  let requirements = assignment.rubric.map((r) => ({ label: r.description ? `${r.title}: ${noDot(r.description)}` : r.title, ref: r.description || r.title, name: r.title }));
  if (!requirements.length) {
    const sents = (assignment.instructions ?? "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => noDot(s.trim()))
      .filter((s) => s.length > 8)
      .slice(0, 4);
    requirements = sents.map((s) => ({ label: s, ref: s, name: s }));
  }
  if (!requirements.length) requirements = [{ label: `Respond fully to "${assignment.title}"`, ref: assignment.title }, { label: "Show your reasoning", ref: "because therefore reason" }, { label: "Present your work clearly", ref: "" }].map((r) => ({ ...r, name: r.label }));

  const n = wordCount(text);
  const quote = firstSentence(text, 60);
  const checklist = requirements.map((r) => {
    const cov = text ? coverage(text, r.ref) : 0;
    let status = !text ? "partial" : cov >= 0.45 && n >= 25 ? "met" : cov >= 0.2 || n >= 60 ? "partial" : "missing";
    const kw = [...words(r.ref)].find((w) => !words(text).has(w) && w.length > 4);
    const tip =
      !text
        ? `I can only skim ${fileNames[0] ? `"${fileNames[0]}"` : "your file"} here — check it clearly addresses this and labels where.`
        : status === "met"
          ? `Covered${quote ? ` — e.g. "${quote}"` : ""}. Add one precise example or number to make it airtight.`
          : status === "partial"
            ? `You touch on this, but go further${kw ? ` — say explicitly how "${kw}" fits` : ""} and back it with evidence.`
            : `Not addressed yet. Add a short paragraph on this${kw ? `, using the term "${kw}"` : ""}.`;
    return { requirement: r.label, status, tip, name: r.name };
  });

  const met = checklist.filter((c) => c.status === "met").length;
  const strengths = [];
  if (met) strengths.push(`You already cover ${met} of ${checklist.length} requirements.`);
  if (n >= 80) strengths.push("Good length — you develop your ideas rather than just listing them.");
  if (/\d/.test(text)) strengths.push("You use specific numbers or data, which makes your points concrete.");
  if (/because|therefore|so that|this means|since/i.test(text)) strengths.push("You explain why, not just what — keep linking cause and effect.");
  if (!strengths.length) strengths.push(text ? "You've made a clear start on the task." : "You've got your work attached and ready to refine.");

  const nextSteps = checklist
    .filter((c) => c.status !== "met")
    .sort((a, b) => (a.status === "missing" ? 0 : 1) - (b.status === "missing" ? 0 : 1))
    .slice(0, 3)
    .map((c) => `${c.status === "missing" ? "Add a clear section on" : "Go deeper on"} ${lower1(noDot(c.name))}.`);
  if (nextSteps.length < 3 && n < 120) nextSteps.push("Expand your explanation with one worked example.");
  if (nextSteps.length < 3) nextSteps.push("Proofread once against the instructions before turning it in.");

  const summary =
    met === checklist.length
      ? "This draft already addresses every requirement — nice work. A final polish on detail and precision will make it even stronger."
      : met >= checklist.length / 2
        ? `A solid draft that covers most of the brief. Focus on the ${checklist.length - met} requirement${checklist.length - met === 1 ? "" : "s"} still marked below before you submit.`
        : `You've made a start, but several requirements aren't covered yet. Work through the checklist below — the first next step will make the biggest difference.`;
  return { summary, checklist: checklist.map(({ name: _n, ...c }) => c), strengths: strengths.slice(0, 3), nextSteps: nextSteps.slice(0, 3) };
}

// ---- per-class list & create -----------------------------------------------

route("GET", "/classes/:classId/assignments", (req) => {
  const { isTeacher } = classAccess(req.params.classId, req.user);
  const assignments = db.assignments
    .filter((a) => a.classroomId === req.params.classId)
    .sort((a, b) => dueAsc(a, b) || b.createdAt - a.createdAt);
  const ids = new Set(assignments.map((a) => a.id));

  if (isTeacher) {
    const students = db.memberships.filter((m) => m.classroomId === req.params.classId).length;
    const stats = {};
    for (const s of db.submissions) {
      if (!ids.has(s.assignmentId)) continue;
      stats[s.assignmentId] ??= { submitted: 0, graded: 0 };
      stats[s.assignmentId].submitted += 1;
      if (s.status === "graded") stats[s.assignmentId].graded += 1;
    }
    return { assignments: assignments.map((a) => ({ ...a, stats: { students, submitted: 0, graded: 0, ...stats[a.id] } })) };
  }

  const mine = new Map(
    db.submissions
      .filter((s) => ids.has(s.assignmentId) && s.studentId === req.user.id)
      .map((s) => [s.assignmentId, { assignmentId: s.assignmentId, status: s.status, late: s.late, score: s.score, submittedAt: s.submittedAt }]),
  );
  return {
    assignments: assignments.map((a) => {
      const s = mine.get(a.id) ?? null;
      return { ...a, mySubmission: s, myStatus: studentStatus(a, s) };
    }),
  };
});

route("POST", "/classes/:classId/assignments", async (req) => {
  requireRole(req.user, "TEACHER");
  const files = uploads(req, 6);
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const data = assignmentFields(req.body);
  const rubric = normalizeRubric(jsonField(req.body.rubric, []));
  const points = rubric.length ? rubric.reduce((s, r) => s + r.points, 0) : (data.points ?? 100);
  const attachments = await saveFiles(files);

  const assignment = insert("assignments", { ...data, points, rubric, attachments, classroomId: classroom.id, authorId: req.user.id });

  notify(classStudentIds(classroom.id), {
    type: "assignment.new",
    title: `New assignment: ${assignment.title}`,
    body: assignment.dueAt ? `${classroom.name} · due ${assignment.dueAt.toISOString()}` : classroom.name,
    link: `/app/assignments/${assignment.id}`,
  });
  return { assignment };
});

// ---- single assignment -----------------------------------------------------

route("POST", "/assignments/suggest-rubric", async (req) => {
  requireRole(req.user, "TEACHER");
  const input = {
    title: str(req.body.title, "title", { min: 2, max: 160 }),
    instructions: optStr(req.body.instructions, "instructions", 20_000),
    points: req.body.points === undefined ? 100 : num(req.body.points, "points", { min: 1, max: 1000 }),
  };
  await think();
  const raw = suggestCriteria(input.title, input.instructions);
  // Rescale to the requested total, as the backend does for model drift.
  const total = raw.reduce((s, c) => s + c.points, 0) || 1;
  const criteria = raw.map((c) => ({ id: shortId(), title: c.title, description: c.description, points: Math.round((c.points / total) * input.points) }));
  const diff = input.points - criteria.reduce((s, c) => s + c.points, 0);
  if (criteria.length && diff) criteria[criteria.length - 1].points += diff;
  return { rubric: criteria };
});

route("GET", "/assignments/:id", (req) => {
  const { assignment, isTeacher, classroom } = loadAssignment(req.params.id, req.user);
  const author = userSummary(byId("users", assignment.authorId));
  const base = { ...assignment, author, classroom: { id: classroom.id, name: classroom.name, theme: classroom.theme } };

  if (isTeacher) {
    const students = db.memberships.filter((m) => m.classroomId === classroom.id).length;
    const submissions = db.submissions.filter((s) => s.assignmentId === assignment.id);
    const graded = submissions.filter((s) => s.status === "graded" && s.score != null);
    return {
      assignment: base,
      isTeacher,
      stats: {
        students,
        submitted: submissions.length,
        graded: graded.length,
        late: submissions.filter((s) => s.late).length,
        averagePct: graded.length && assignment.points ? (graded.reduce((s, x) => s + x.score, 0) / graded.length / assignment.points) * 100 : null,
      },
    };
  }

  // Draft AI grades are for the teacher only.
  const submission = omitDraft(findSubmission(assignment.id, req.user.id));
  return { assignment: base, isTeacher, submission, myStatus: studentStatus(assignment, submission) };
});

route("PATCH", "/assignments/:id", async (req) => {
  requireRole(req.user, "TEACHER");
  const files = uploads(req, 6);
  const { assignment } = loadAssignment(req.params.id, req.user, { teacher: true });
  const patch = assignmentFields(req.body, { partial: true });

  if (req.body.rubric !== undefined) {
    patch.rubric = normalizeRubric(jsonField(req.body.rubric, []));
    if (patch.rubric.length) patch.points = patch.rubric.reduce((s, r) => s + r.points, 0);
  }

  // Attachments: keep the ones listed in keepAttachments (by key), add new uploads.
  if (req.body.keepAttachments !== undefined || files.length) {
    const keep = new Set(jsonField(req.body.keepAttachments, assignment.attachments.map((a) => a.key)));
    const kept = assignment.attachments.filter((a) => keep.has(a.key));
    patch.attachments = [...kept, ...(await saveFiles(files))];
  }

  return { assignment: update("assignments", assignment, patch) };
});

route("DELETE", "/assignments/:id", (req) => {
  requireRole(req.user, "TEACHER");
  const { assignment } = loadAssignment(req.params.id, req.user, { teacher: true });
  remove("submissions", (s) => s.assignmentId === assignment.id);
  remove("assignments", (a) => a.id === assignment.id);
  return { ok: true };
});

// ---- roster (teacher) ------------------------------------------------------

route("GET", "/assignments/:id/submissions", (req) => {
  requireRole(req.user, "TEACHER");
  const { assignment, classroom } = loadAssignment(req.params.id, req.user, { teacher: true });
  const byStudent = new Map(db.submissions.filter((s) => s.assignmentId === assignment.id).map((s) => [s.studentId, s]));
  const order = { submitted: 0, late: 1, graded: 2, missing: 3, assigned: 4 };
  const roster = db.memberships
    .filter((m) => m.classroomId === classroom.id)
    .map((m) => {
      const submission = byStudent.get(m.userId) ?? null;
      return { student: userSummary(byId("users", m.userId)), submission, status: studentStatus(assignment, submission) };
    })
    .sort((a, b) => order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name));
  return { roster };
});

// ---- student submission ----------------------------------------------------

route("PUT", "/assignments/:id/submission", async (req) => {
  requireRole(req.user, "STUDENT");
  const files = uploads(req, 6);
  const { assignment, classroom } = loadAssignment(req.params.id, req.user);
  const text = optStr(req.body.text, "text", 50_000);
  const now = new Date();
  const late = Boolean(assignment.dueAt && now > assignment.dueAt);
  if (late && !assignment.allowLate) throw badRequest("The deadline has passed and late submissions are closed.");

  const existing = findSubmission(assignment.id, req.user.id);
  if (existing?.status === "graded") throw badRequest("This work has already been graded.");

  const keep = new Set(jsonField(req.body.keepAttachments, existing?.attachments.map((a) => a.key) ?? []));
  const kept = existing?.attachments.filter((a) => keep.has(a.key)) ?? [];
  if (!text && !kept.length && !files.length) throw badRequest("Add some text or attach a file before submitting.");
  const attachments = [...kept, ...(await saveFiles(files))];

  const submission = existing
    ? update("submissions", existing, { text: text ?? null, attachments, late, submittedAt: now, aiDraft: null })
    : insert("submissions", { assignmentId: assignment.id, studentId: req.user.id, text: text ?? null, attachments, late, submittedAt: now });

  let reward = null;
  if (!existing) {
    reward = awardXp(req.user.id, "submit", XP.submit + (late ? 0 : XP.submitOnTimeBonus), {
      tz: req.tz,
      meta: { assignmentId: assignment.id, classroomId: classroom.id },
    });
  }
  return { submission: omitDraft(submission), status: studentStatus(assignment, submission), reward };
});

route("DELETE", "/assignments/:id/submission", (req) => {
  requireRole(req.user, "STUDENT");
  const { assignment } = loadAssignment(req.params.id, req.user);
  const existing = findSubmission(assignment.id, req.user.id);
  if (!existing) throw notFound("Submission");
  if (existing.status === "graded") throw badRequest("Graded work can't be unsubmitted.");
  remove("submissions", (s) => s.id === existing.id);
  return { ok: true };
});

route("POST", "/assignments/:id/draft-feedback", async (req) => {
  requireRole(req.user, "STUDENT");
  const files = uploads(req, 4, "readable");
  const { assignment } = loadAssignment(req.params.id, req.user);
  if (!assignment.aiFeedback) throw forbidden("Your teacher has turned off AI feedback for this assignment.");
  const text = optStr(req.body.text, "text", 50_000);
  if (!text && !files.length) throw badRequest("Paste your draft or attach it to get feedback.");

  // Text files are read; other files (PDFs, images) are only acknowledged in demo mode.
  const fileTexts = (await Promise.all(files.map(fileText))).filter(Boolean);
  const combined = [text, ...fileTexts].filter(Boolean).join("\n\n");
  await think(1000, 2000);
  return { feedback: draftFeedback(assignment, combined, files.map((f) => f.name)) };
});

// ---- grading (teacher) -----------------------------------------------------

function loadSubmissionForTeacher(id, user) {
  const submission = findOr404("submissions", id, "Submission");
  const assignment = byId("assignments", submission.assignmentId);
  classAccess(assignment.classroomId, user, { teacher: true });
  return { submission, assignment };
}

route("POST", "/submissions/:id/grade", (req) => {
  requireRole(req.user, "TEACHER");
  const { submission, assignment } = loadSubmissionForTeacher(req.params.id, req.user);
  const score = num(req.body.score, "score", { min: 0 });
  const feedback = optStr(req.body.feedback, "feedback", 20_000);
  const raw = req.body.rubricScores;
  if (raw !== undefined && !Array.isArray(raw)) throw fail("rubricScores", "Expected array");
  const input = (raw ?? []).map((r, i) => {
    if (!r || typeof r.criterionId !== "string") throw fail(`rubricScores.${i}.criterionId`, "Required");
    return { criterionId: r.criterionId, score: num(r.score, `rubricScores.${i}.score`, { min: 0 }), comment: optStr(r.comment, `rubricScores.${i}.comment`, 2000) };
  });
  if (score > assignment.points) throw badRequest(`Score can't exceed ${assignment.points}.`);

  const criteria = new Map(assignment.rubric.map((r) => [r.id, r]));
  const rubricScores = input
    .filter((r) => criteria.has(r.criterionId))
    .map((r) => ({ criterionId: r.criterionId, score: Math.min(r.score, criteria.get(r.criterionId).points), comment: r.comment ?? null }));

  const firstGrade = submission.status !== "graded";
  update("submissions", submission, { score, feedback: feedback ?? null, rubricScores, status: "graded", gradedAt: new Date(), gradedById: req.user.id });

  notify([submission.studentId], {
    type: "grade",
    title: firstGrade ? `Graded: ${assignment.title}` : `Grade updated: ${assignment.title}`,
    body: `${score}/${assignment.points}`,
    link: `/app/assignments/${assignment.id}`,
  });
  return { submission: { ...submission, student: userSummary(byId("users", submission.studentId)) } };
});

route("POST", "/submissions/:id/return", (req) => {
  // Reopen a graded submission so the student can resubmit.
  requireRole(req.user, "TEACHER");
  const { submission } = loadSubmissionForTeacher(req.params.id, req.user);
  return { submission: update("submissions", submission, { status: "submitted" }) };
});

route("POST", "/submissions/:id/ai-draft", async (req) => {
  requireRole(req.user, "TEACHER");
  const { submission, assignment } = loadSubmissionForTeacher(req.params.id, req.user);
  const aiDraft = await draftGrade(submission, assignment);
  return { submission: update("submissions", submission, { aiDraft }) };
});

route("POST", "/assignments/:id/ai-draft-all", async (req) => {
  requireRole(req.user, "TEACHER");
  const { assignment } = loadAssignment(req.params.id, req.user, { teacher: true });
  const BATCH = 6;
  const pending = db.submissions.filter((s) => s.assignmentId === assignment.id && s.status === "submitted" && s.aiDraft == null).slice(0, BATCH + 1);
  const batch = pending.slice(0, BATCH);
  let done = 0;
  const failed = [];
  if (batch.length) await think(1200, 2400);
  for (const s of batch) {
    try {
      const aiDraft = await draftGrade(s, assignment, { pause: false });
      update("submissions", s, { aiDraft });
      done += 1;
    } catch (err) {
      failed.push({ id: s.id, error: err.message });
    }
  }
  return { drafted: done, failed, hasMore: pending.length > BATCH };
});

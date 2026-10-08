import { Router } from "express";
import { z } from "zod";
import { prisma, userSummary } from "../lib/prisma.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { jsonField, parse, zBool, zNullableText, zOptText } from "../lib/http.js";
import { classAccess, classStudentIds, findOr404 } from "../lib/access.js";
import { shortId } from "../lib/ids.js";
import { notify } from "../lib/notify.js";
import { awardXp, XP } from "../lib/gamification.js";
import { deleteFiles, readFile, saveFiles } from "../lib/storage.js";
import { fileToParts } from "../lib/extract.js";
import { generateJSON } from "../lib/gemini.js";
import { studentOnly, teacherOnly } from "../middleware/auth.js";
import { uploader } from "../middleware/upload.js";
import { aiLimiter } from "../middleware/rateLimit.js";

// Mounted at /classes/:classId/assignments
export const classAssignmentsRouter = Router({ mergeParams: true });
// Mounted at /assignments
const router = Router();
// Mounted at /submissions
export const submissionRouter = Router();

// ---- helpers ---------------------------------------------------------------

export function studentStatus(assignment, submission, now = new Date()) {
  if (submission?.status === "graded") return "graded";
  if (submission) return submission.late ? "late" : "submitted";
  if (assignment.dueAt && assignment.dueAt < now) return "missing";
  return "assigned";
}

const rubricSchema = z
  .array(
    z.object({
      id: z.string().max(40).optional(),
      title: z.string().trim().min(1, "Each rubric row needs a title").max(120),
      description: zOptText(600),
      points: z.coerce.number().min(0).max(1000),
    }),
  )
  .max(12);

const assignmentFields = {
  title: z.string().trim().min(2, "Give the assignment a title").max(160),
  instructions: zOptText(20_000),
  dueAt: z.preprocess((v) => (v === "" || v === "null" ? null : v), z.coerce.date().nullable().optional()),
  points: z.coerce.number().min(0).max(1000).optional(),
  allowLate: zBool.optional(),
  aiFeedback: zBool.optional(),
};

function normalizeRubric(raw) {
  const rubric = parse(rubricSchema, raw ?? []);
  return rubric.map((r) => ({ id: r.id || shortId(), title: r.title, description: r.description ?? null, points: r.points }));
}

async function loadAssignment(id, user, { teacher = false } = {}) {
  const assignment = await findOr404(prisma.assignment, id, "Assignment");
  const access = await classAccess(assignment.classroomId, user, { teacher });
  return { assignment, ...access };
}

function assignmentBrief(a) {
  const rubric = a.rubric?.length
    ? `\nRUBRIC (criterionId: title — max points — description):\n${a.rubric.map((r) => `- ${r.id}: ${r.title} — ${r.points} — ${r.description ?? ""}`).join("\n")}`
    : "";
  return `ASSIGNMENT: ${a.title}\nTOTAL POINTS: ${a.points}\nINSTRUCTIONS:\n${a.instructions || "(none provided)"}${rubric}`;
}

/** Turn stored files into Gemini parts, skipping anything unreadable. */
async function filesToParts(files, label, limit = 5) {
  const parts = [];
  const skipped = [];
  for (const f of files.slice(0, limit)) {
    try {
      const p = await fileToParts(await readFile(f), f.mimeType, f.name);
      if (p.length) parts.push({ text: `${label}: ${f.name}` }, ...p);
      else skipped.push(f.name);
    } catch {
      skipped.push(f.name);
    }
  }
  return { parts, skipped };
}

const multerFilesToParts = async (files = []) => {
  const parts = [];
  for (const f of files) {
    const p = await fileToParts(f.buffer, f.mimetype, f.originalname);
    if (p.length) parts.push({ text: `STUDENT FILE: ${f.originalname}` }, ...p);
  }
  return parts;
};

// ---- per-class list & create -----------------------------------------------

classAssignmentsRouter.get("/", async (req, res) => {
  const { isTeacher } = await classAccess(req.params.classId, req.user);
  const assignments = await prisma.assignment.findMany({
    where: { classroomId: req.params.classId },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });
  const ids = assignments.map((a) => a.id);

  if (isTeacher) {
    const [counts, students] = await Promise.all([
      prisma.submission.groupBy({ by: ["assignmentId", "status"], where: { assignmentId: { in: ids } }, _count: { _all: true } }),
      prisma.membership.count({ where: { classroomId: req.params.classId } }),
    ]);
    const stats = {};
    for (const c of counts) {
      stats[c.assignmentId] ??= { submitted: 0, graded: 0 };
      stats[c.assignmentId].submitted += c._count._all;
      if (c.status === "graded") stats[c.assignmentId].graded += c._count._all;
    }
    return res.json({
      assignments: assignments.map((a) => ({ ...a, stats: { students, submitted: 0, graded: 0, ...stats[a.id] } })),
    });
  }

  const mine = await prisma.submission.findMany({
    where: { assignmentId: { in: ids }, studentId: req.user.id },
    select: { assignmentId: true, status: true, late: true, score: true, submittedAt: true },
  });
  const byId = new Map(mine.map((s) => [s.assignmentId, s]));
  res.json({
    assignments: assignments.map((a) => {
      const s = byId.get(a.id) ?? null;
      return { ...a, mySubmission: s, myStatus: studentStatus(a, s) };
    }),
  });
});

classAssignmentsRouter.post("/", teacherOnly, uploader("any", 6).array("attachments", 6), async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const data = parse(z.object(assignmentFields), req.body);
  const rubric = normalizeRubric(jsonField(req.body.rubric, []));
  const points = rubric.length ? rubric.reduce((s, r) => s + r.points, 0) : (data.points ?? 100);
  const attachments = await saveFiles(req.files, "assignments");

  const assignment = await prisma.assignment.create({
    data: { ...data, points, rubric, attachments, classroomId: classroom.id, authorId: req.user.id },
  });

  notify(await classStudentIds(classroom.id), {
    type: "assignment.new",
    title: `New assignment: ${assignment.title}`,
    body: assignment.dueAt ? `${classroom.name} · due ${assignment.dueAt.toISOString()}` : classroom.name,
    link: `/app/assignments/${assignment.id}`,
  });
  res.status(201).json({ assignment });
});

// ---- single assignment -----------------------------------------------------

router.post("/suggest-rubric", teacherOnly, aiLimiter, async (req, res) => {
  const input = parse(
    z.object({ title: z.string().trim().min(2).max(160), instructions: zOptText(20_000), points: z.coerce.number().min(1).max(1000).default(100) }),
    req.body,
  );
  const { data } = await generateJSON({
    system: "You are an experienced teacher who writes clear, fair, observable grading rubrics.",
    prompt: `Suggest 3-5 rubric criteria for this assignment. Points must sum to exactly ${input.points}. Descriptions state what full marks look like in one sentence.\n\nTitle: ${input.title}\nInstructions: ${input.instructions ?? "(none)"}`,
    schema: z.object({ criteria: z.array(z.object({ title: z.string(), description: z.string(), points: z.number() })) }),
    temperature: 0.4,
  });
  // Rescale if the model's points drift from the requested total.
  const total = data.criteria.reduce((s, c) => s + c.points, 0) || 1;
  let criteria = data.criteria.map((c) => ({ id: shortId(), title: c.title, description: c.description, points: Math.round((c.points / total) * input.points) }));
  const diff = input.points - criteria.reduce((s, c) => s + c.points, 0);
  if (criteria.length && diff) criteria[criteria.length - 1].points += diff;
  res.json({ rubric: criteria });
});

router.get("/:id", async (req, res) => {
  const { assignment, isTeacher, classroom } = await loadAssignment(req.params.id, req.user);
  const author = await prisma.user.findUnique({ where: { id: assignment.authorId }, ...userSummary });
  const base = { ...assignment, author, classroom: { id: classroom.id, name: classroom.name, theme: classroom.theme } };

  if (isTeacher) {
    const [students, submissions] = await Promise.all([
      prisma.membership.count({ where: { classroomId: classroom.id } }),
      prisma.submission.findMany({ where: { assignmentId: assignment.id }, select: { status: true, score: true, late: true } }),
    ]);
    const graded = submissions.filter((s) => s.status === "graded" && s.score != null);
    return res.json({
      assignment: base,
      isTeacher,
      stats: {
        students,
        submitted: submissions.length,
        graded: graded.length,
        late: submissions.filter((s) => s.late).length,
        averagePct: graded.length && assignment.points ? (graded.reduce((s, x) => s + x.score, 0) / graded.length / assignment.points) * 100 : null,
      },
    });
  }

  const submission = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: req.user.id } },
    // Draft AI grades are for the teacher only.
    omit: { aiDraft: true },
  });
  res.json({ assignment: base, isTeacher, submission, myStatus: studentStatus(assignment, submission) });
});

router.patch("/:id", teacherOnly, uploader("any", 6).array("attachments", 6), async (req, res) => {
  const { assignment } = await loadAssignment(req.params.id, req.user, { teacher: true });
  const data = parse(z.object({ ...assignmentFields, title: assignmentFields.title.optional(), instructions: zNullableText(20_000) }), req.body);

  const update = { ...data };
  if (req.body.rubric !== undefined) {
    update.rubric = { set: normalizeRubric(jsonField(req.body.rubric, [])) };
    if (update.rubric.set.length) update.points = update.rubric.set.reduce((s, r) => s + r.points, 0);
  }

  // Attachments: keep the ones listed in keepAttachments (by key), add new uploads.
  let removed = [];
  if (req.body.keepAttachments !== undefined || req.files?.length) {
    const keep = new Set(jsonField(req.body.keepAttachments, assignment.attachments.map((a) => a.key)));
    const kept = assignment.attachments.filter((a) => keep.has(a.key));
    removed = assignment.attachments.filter((a) => !keep.has(a.key));
    update.attachments = { set: [...kept, ...(await saveFiles(req.files, "assignments"))] };
  }

  const updated = await prisma.assignment.update({ where: { id: assignment.id }, data: update });
  deleteFiles(removed);
  res.json({ assignment: updated });
});

router.delete("/:id", teacherOnly, async (req, res) => {
  const { assignment } = await loadAssignment(req.params.id, req.user, { teacher: true });
  const subs = await prisma.submission.findMany({ where: { assignmentId: assignment.id }, select: { attachments: true } });
  await prisma.assignment.delete({ where: { id: assignment.id } });
  deleteFiles([...assignment.attachments, ...subs.flatMap((s) => s.attachments)]);
  res.json({ ok: true });
});

// ---- roster (teacher) ------------------------------------------------------

router.get("/:id/submissions", teacherOnly, async (req, res) => {
  const { assignment, classroom } = await loadAssignment(req.params.id, req.user, { teacher: true });
  const [memberships, submissions] = await Promise.all([
    prisma.membership.findMany({ where: { classroomId: classroom.id }, include: { user: userSummary } }),
    prisma.submission.findMany({ where: { assignmentId: assignment.id } }),
  ]);
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
  const order = { submitted: 0, late: 1, graded: 2, missing: 3, assigned: 4 };
  const roster = memberships
    .map((m) => {
      const submission = byStudent.get(m.userId) ?? null;
      return { student: m.user, submission, status: studentStatus(assignment, submission) };
    })
    .sort((a, b) => order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name));
  res.json({ roster });
});

// ---- student submission ----------------------------------------------------

router.put("/:id/submission", studentOnly, uploader("any", 6).array("attachments", 6), async (req, res) => {
  const { assignment, classroom } = await loadAssignment(req.params.id, req.user);
  const { text } = parse(z.object({ text: zOptText(50_000) }), req.body);
  const now = new Date();
  const late = Boolean(assignment.dueAt && now > assignment.dueAt);
  if (late && !assignment.allowLate) throw badRequest("The deadline has passed and late submissions are closed.");

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: req.user.id } },
  });
  if (existing?.status === "graded") throw badRequest("This work has already been graded.");

  const keep = new Set(jsonField(req.body.keepAttachments, existing?.attachments.map((a) => a.key) ?? []));
  const kept = existing?.attachments.filter((a) => keep.has(a.key)) ?? [];
  const removed = existing?.attachments.filter((a) => !keep.has(a.key)) ?? [];
  const attachments = [...kept, ...(await saveFiles(req.files, "submissions"))];
  if (!text && !attachments.length) throw badRequest("Add some text or attach a file before submitting.");

  const submission = existing
    ? await prisma.submission.update({
        where: { id: existing.id },
        data: { text: text ?? null, attachments: { set: attachments }, late, submittedAt: now, aiDraft: { unset: true } },
        omit: { aiDraft: true },
      })
    : await prisma.submission.create({
        data: { assignmentId: assignment.id, studentId: req.user.id, text, attachments, late, submittedAt: now },
        omit: { aiDraft: true },
      });
  deleteFiles(removed);

  let reward = null;
  if (!existing) {
    reward = await awardXp(req.user.id, "submit", XP.submit + (late ? 0 : XP.submitOnTimeBonus), {
      tz: req.tz,
      meta: { assignmentId: assignment.id, classroomId: classroom.id },
    });
  }
  res.status(existing ? 200 : 201).json({ submission, status: studentStatus(assignment, submission), reward });
});

router.delete("/:id/submission", studentOnly, async (req, res) => {
  const { assignment } = await loadAssignment(req.params.id, req.user);
  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: req.user.id } },
  });
  if (!existing) throw notFound("Submission");
  if (existing.status === "graded") throw badRequest("Graded work can't be unsubmitted.");
  await prisma.submission.delete({ where: { id: existing.id } });
  deleteFiles(existing.attachments);
  res.json({ ok: true });
});

// Pre-submission coaching: specific, actionable, and never a grade.
const draftFeedbackSchema = z.object({
  summary: z.string().describe("2-3 sentence overall impression, encouraging and honest."),
  checklist: z.array(
    z.object({
      requirement: z.string().describe("A requirement from the instructions or rubric."),
      status: z.enum(["met", "partial", "missing"]),
      tip: z.string().describe("Concrete, specific suggestion referencing the student's work."),
    }),
  ),
  strengths: z.array(z.string()),
  nextSteps: z.array(z.string()).describe("Top 3 highest-impact improvements, most important first."),
});

router.post("/:id/draft-feedback", studentOnly, aiLimiter, uploader("readable", 4).array("attachments", 4), async (req, res) => {
  const { assignment } = await loadAssignment(req.params.id, req.user);
  if (!assignment.aiFeedback) throw forbidden("Your teacher has turned off AI feedback for this assignment.");
  const { text } = parse(z.object({ text: zOptText(50_000) }), req.body);
  const fileParts = await multerFilesToParts(req.files);
  if (!text && !fileParts.length) throw badRequest("Paste your draft or attach it to get feedback.");

  const { data } = await generateJSON({
    system: [
      "You are a supportive writing and study coach reviewing a student's DRAFT before they submit it.",
      "Never assign a score, grade or percentage. Never rewrite the work or supply answers — point out what to improve and where.",
      "Be specific: quote or reference parts of their draft. Keep each tip under 40 words.",
    ].join("\n"),
    parts: [{ text: assignmentBrief(assignment) }, ...(text ? [{ text: `STUDENT DRAFT:\n${text}` }] : []), ...fileParts],
    prompt: "Review the draft against the assignment requirements and rubric.",
    schema: draftFeedbackSchema,
    temperature: 0.4,
  });
  res.json({ feedback: data });
});

// ---- grading (teacher) -----------------------------------------------------

async function loadSubmissionForTeacher(id, user) {
  const submission = await findOr404(prisma.submission, id, "Submission");
  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } });
  await classAccess(assignment.classroomId, user, { teacher: true });
  return { submission, assignment };
}

const gradeSchema = z.object({
  score: z.coerce.number().min(0),
  feedback: zOptText(20_000),
  rubricScores: z
    .array(z.object({ criterionId: z.string(), score: z.coerce.number().min(0), comment: zOptText(2000) }))
    .optional(),
});

submissionRouter.post("/:id/grade", teacherOnly, async (req, res) => {
  const { submission, assignment } = await loadSubmissionForTeacher(req.params.id, req.user);
  const data = parse(gradeSchema, req.body);
  if (data.score > assignment.points) throw badRequest(`Score can't exceed ${assignment.points}.`);

  const criteria = new Map(assignment.rubric.map((r) => [r.id, r]));
  const rubricScores = (data.rubricScores ?? [])
    .filter((r) => criteria.has(r.criterionId))
    .map((r) => ({ criterionId: r.criterionId, score: Math.min(r.score, criteria.get(r.criterionId).points), comment: r.comment ?? null }));

  const firstGrade = submission.status !== "graded";
  const graded = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      score: data.score,
      feedback: data.feedback ?? null,
      rubricScores: { set: rubricScores },
      status: "graded",
      gradedAt: new Date(),
      gradedById: req.user.id,
    },
    include: { student: userSummary },
  });

  notify([submission.studentId], {
    type: "grade",
    title: firstGrade ? `Graded: ${assignment.title}` : `Grade updated: ${assignment.title}`,
    body: `${data.score}/${assignment.points}`,
    link: `/app/assignments/${assignment.id}`,
  });
  res.json({ submission: graded });
});

submissionRouter.post("/:id/return", teacherOnly, async (req, res) => {
  // Reopen a graded submission so the student can resubmit.
  const { submission } = await loadSubmissionForTeacher(req.params.id, req.user);
  const updated = await prisma.submission.update({ where: { id: submission.id }, data: { status: "submitted" } });
  res.json({ submission: updated });
});

const aiDraftSchema = z.object({
  score: z.number().describe("Total score out of the assignment's total points."),
  feedback: z.string().describe("Feedback addressed to the student in markdown: what worked, what to fix, how. 80-200 words."),
  rubricScores: z.array(z.object({ criterionId: z.string(), score: z.number(), comment: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]).describe("Low if the work was hard to read or the task is subjective."),
});

async function draftGrade(submission, assignment) {
  const [work, brief] = await Promise.all([
    filesToParts(submission.attachments, "STUDENT FILE"),
    filesToParts(assignment.attachments, "ASSIGNMENT FILE", 2),
  ]);
  const parts = [
    { text: assignmentBrief(assignment) },
    ...brief.parts,
    ...(submission.text ? [{ text: `STUDENT TYPED RESPONSE:\n${submission.text}` }] : []),
    ...work.parts,
  ];
  if (!submission.text && !work.parts.length) throw badRequest("This submission has no readable content for AI grading.");

  const { data, model } = await generateJSON({
    system: [
      "You are a meticulous, fair teaching assistant drafting a grade for a teacher to review.",
      "Grade strictly against the instructions and rubric. Credit correct reasoning even if phrased differently.",
      "If there is a rubric, score every criterion by its criterionId and make the total equal the sum of criterion scores.",
      "Handwritten work may be included as images — read it carefully. If something is illegible, say so and lower confidence.",
    ].join("\n"),
    parts,
    prompt: `Draft a grade. Total points available: ${assignment.points}.`,
    schema: aiDraftSchema,
    temperature: 0.2,
  });

  const criteria = new Map(assignment.rubric.map((r) => [r.id, r]));
  const rubricScores = data.rubricScores
    .filter((r) => criteria.has(r.criterionId))
    .map((r) => ({ criterionId: r.criterionId, score: Math.max(0, Math.min(r.score, criteria.get(r.criterionId).points)), comment: r.comment }));
  const total = rubricScores.length ? rubricScores.reduce((s, r) => s + r.score, 0) : data.score;

  return {
    score: Math.round(Math.max(0, Math.min(total, assignment.points)) * 10) / 10,
    feedback: data.feedback,
    rubricScores,
    strengths: data.strengths,
    improvements: data.improvements,
    confidence: work.skipped.length ? "low" : data.confidence,
    model,
    generatedAt: new Date(),
  };
}

submissionRouter.post("/:id/ai-draft", teacherOnly, aiLimiter, async (req, res) => {
  const { submission, assignment } = await loadSubmissionForTeacher(req.params.id, req.user);
  const aiDraft = await draftGrade(submission, assignment);
  const updated = await prisma.submission.update({ where: { id: submission.id }, data: { aiDraft: { set: aiDraft } } });
  res.json({ submission: updated });
});

router.post("/:id/ai-draft-all", teacherOnly, aiLimiter, async (req, res) => {
  const { assignment } = await loadAssignment(req.params.id, req.user, { teacher: true });
  const BATCH = 6;
  const pending = await prisma.submission.findMany({
    where: { assignmentId: assignment.id, status: "submitted", aiDraft: { isSet: false } },
    take: BATCH + 1,
  });
  const batch = pending.slice(0, BATCH);
  let done = 0;
  const failed = [];
  // Two at a time keeps latency reasonable without tripping rate limits.
  for (let i = 0; i < batch.length; i += 2) {
    await Promise.all(
      batch.slice(i, i + 2).map(async (s) => {
        try {
          const aiDraft = await draftGrade(s, assignment);
          await prisma.submission.update({ where: { id: s.id }, data: { aiDraft: { set: aiDraft } } });
          done += 1;
        } catch (err) {
          failed.push({ id: s.id, error: err.message });
        }
      }),
    );
  }
  res.json({ drafted: done, failed, hasMore: pending.length > BATCH });
});

export default router;

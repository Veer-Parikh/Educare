// Port of backend/src/modules/quizzes.js.
import {
  awardXp,
  badRequest,
  by,
  byId,
  classAccess,
  classStudentIds,
  db,
  findOr404,
  forbidden,
  insert,
  isObjectId,
  jsonField,
  myClassIds,
  notFound,
  notify,
  nullableText,
  pickUser,
  remove,
  shortId,
  update,
  userSummary,
  XP,
} from "../core.js";
import { generateQuestions, gradeShortAnswer, resolveSource, think } from "../ai.js";
import { route } from "../router.js";

const QUESTION_TYPES = ["mcq", "truefalse", "short"];
const DIFFICULTIES = ["easy", "medium", "hard", "mixed"];

const conceptKey = (c) => c.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);

/** Drop undefined keys so insert()/update() keep Prisma defaults, like Prisma ignores undefined. */
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------------------
// Validation (mirrors the zod schemas; messages follow formatZodError: "path: message")
// ---------------------------------------------------------------------------

const fail = (path, message) => badRequest(path ? `${path}: ${message}` : message);

/** Integer field. `coerce` accepts numeric strings (z.coerce.number()); otherwise a real number is required. */
function int(v, path, { min, max, fallback, coerce = false, nullable = false } = {}) {
  if (v === undefined || (coerce && v === "")) return fallback;
  if (v === null) {
    if (nullable) return null;
    throw fail(path, "Expected number, received null");
  }
  const n = coerce ? Number(v) : v;
  if (typeof n !== "number" || Number.isNaN(n)) throw fail(path, coerce ? "Expected number, received nan" : `Expected number, received ${typeof v}`);
  if (!Number.isInteger(n)) throw fail(path, "Expected integer, received float");
  if (min != null && n < min) throw fail(path, `Number must be greater than or equal to ${min}`);
  if (max != null && n > max) throw fail(path, `Number must be less than or equal to ${max}`);
  return n;
}

function oneOf(v, values, path, fallback) {
  if (v === undefined) return fallback;
  if (!values.includes(v)) throw fail(path, `Invalid enum value. Expected ${values.map((x) => `'${x}'`).join(" | ")}, received '${v}'`);
  return v;
}

/** zOptText: "" means not provided; otherwise a trimmed string up to `max`. */
function optStr(v, path, max) {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    if (v === null) throw fail(path, "Expected string, received null");
    return undefined;
  }
  if (typeof v !== "string") throw fail(path, `Expected string, received ${typeof v}`);
  const s = v.trim();
  if (s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}

/** Required trimmed string between min and max characters. */
function str(v, path, max, min = 1) {
  if (typeof v !== "string") throw fail(path, v === undefined ? "Required" : `Expected string, received ${v === null ? "null" : typeof v}`);
  const s = v.trim();
  if (s.length < min) throw fail(path, `String must contain at least ${min} character(s)`);
  if (s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}

/** z.string().trim().max().nullable().optional() — "" stays "". */
function nullStr(v, path, max) {
  if (v === undefined || v === null) return v;
  return str(v, path, max, 0);
}

/** zNullableText: "" or null clears, undefined leaves alone. */
function clearable(v, path, max) {
  if (v !== undefined && v !== null && typeof v !== "string") throw fail(path, `Expected string, received ${typeof v}`);
  const s = nullableText(v);
  if (typeof s === "string" && s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}

function objectIdField(v, path, { nullable = false } = {}) {
  if (v === undefined) return undefined;
  if (v === null && nullable) return null;
  if (!isObjectId(v)) throw fail(path, "Invalid id");
  return v;
}

function arrayOf(v, path, { min = 0, max, fallback } = {}) {
  if (v === undefined && fallback !== undefined) return fallback;
  if (!Array.isArray(v)) throw fail(path, v === undefined ? "Required" : `Expected array, received ${v === null ? "null" : typeof v}`);
  if (v.length < min) throw fail(path, `Array must contain at least ${min} element(s)`);
  if (max != null && v.length > max) throw fail(path, `Array must contain at most ${max} element(s)`);
  return v;
}

function questionInput(q, path) {
  if (!q || typeof q !== "object") throw fail(path, "Expected object");
  const options = arrayOf(q.options, `${path}.options`, { max: 8, fallback: [] }).map((o, i) => str(o, `${path}.options.${i}`, 1000, 0));
  let points;
  if (q.points !== undefined) {
    if (typeof q.points !== "number" || Number.isNaN(q.points)) throw fail(`${path}.points`, `Expected number, received ${typeof q.points}`);
    if (q.points < 0) throw fail(`${path}.points`, "Number must be greater than or equal to 0");
    if (q.points > 100) throw fail(`${path}.points`, "Number must be less than or equal to 100");
    points = q.points;
  }
  return {
    id: q.id === undefined ? undefined : typeof q.id === "string" ? q.id : (() => { throw fail(`${path}.id`, "Expected string"); })(),
    type: oneOf(q.type, QUESTION_TYPES, `${path}.type`, undefined) ?? (() => { throw fail(`${path}.type`, "Required"); })(),
    prompt: str(q.prompt, `${path}.prompt`, 4000),
    options,
    answerIndex: int(q.answerIndex, `${path}.answerIndex`, { nullable: true }),
    answerText: nullStr(q.answerText, `${path}.answerText`, 4000),
    explanation: nullStr(q.explanation, `${path}.explanation`, 4000),
    concept: nullStr(q.concept, `${path}.concept`, 80),
    difficulty: q.difficulty === null ? null : oneOf(q.difficulty, ["easy", "medium", "hard"], `${path}.difficulty`, undefined),
    points,
  };
}

const questionList = (v, path) => arrayOf(v, path, { min: 1, max: 60 }).map((q, i) => questionInput(q, `${path}.${i}`));

/** Question view for someone taking the quiz: no answers, no explanations. */
const publicQuestion = ({ id, type, prompt, options, points, difficulty }) => ({ id, type, prompt, options, points, difficulty });

const classSummary = (id) => (id ? pickUser(byId("classrooms", id), "id", "name", "theme") : null);

function quizAccess(id, user) {
  const quiz = findOr404("quizzes", id, "Quiz");
  if (quiz.ownerId === user.id) return { quiz, isOwner: true };
  if (quiz.published && quiz.classroomId) {
    classAccess(quiz.classroomId, user);
    return { quiz, isOwner: false };
  }
  throw notFound("Quiz");
}

/** Demo AI output, normalised like backend normalizeQuestion (short answers are worth 2 points). */
function aiQuestions(opts) {
  const { title, questions } = generateQuestions(opts);
  return { title, questions: questions.map((q) => ({ ...q, points: q.type === "short" ? 2 : 1 })) };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

route("POST", "/quizzes/generate", async (req) => {
  const b = req.body ?? {};
  const types = arrayOf(jsonField(b.types, b.types), "types", { min: 1, fallback: ["mcq"] }).map((t, i) => oneOf(t, QUESTION_TYPES, `types.${i}`, undefined) ?? t);
  const input = {
    source: oneOf(b.source, ["topic", "text", "material", "file"], "source", "topic"),
    topic: optStr(b.topic, "topic", 200),
    text: optStr(b.text, "text", 200_000),
    materialId: objectIdField(b.materialId, "materialId"),
    count: int(b.count, "count", { min: 3, max: 30, fallback: 8, coerce: true }),
    difficulty: oneOf(b.difficulty, DIFFICULTIES, "difficulty", "mixed"),
    types,
    title: optStr(b.title, "title", 160),
    timeLimitMin: int(b.timeLimitMin, "timeLimitMin", { min: 1, max: 240, coerce: true }),
  };
  const src = await resolveSource(input, req.user, req.files?.file?.[0]);
  await think();
  const { title, questions } = aiQuestions({ label: src.label, text: src.sourceText, count: input.count, difficulty: input.difficulty, types: input.types });
  const quiz = insert(
    "quizzes",
    defined({
      ownerId: req.user.id,
      title: input.title || title,
      topic: src.label,
      difficulty: input.difficulty,
      source: input.source,
      questions,
      timeLimitMin: input.timeLimitMin,
    }),
  );
  return { quiz };
});

route("POST", "/quizzes/adaptive", async (req) => {
  const b = req.body ?? {};
  const count = int(b.count, "count", { min: 3, max: 20, fallback: 8, coerce: true });
  const concepts = b.concepts === undefined ? undefined : arrayOf(b.concepts, "concepts", { max: 8 }).map((c, i) => str(c, `concepts.${i}`, 80));

  let focus = concepts;
  if (!focus?.length) {
    focus = db.conceptMastery
      .filter((r) => r.userId === req.user.id)
      .sort(by("lastSeenAt", "desc"))
      .slice(0, 100)
      .map((r) => ({ ...r, acc: r.total ? r.correct / r.total : 1 }))
      .filter((r) => r.acc < 0.75)
      .sort((a, b) => a.acc - b.acc || b.total - a.total)
      .slice(0, 5)
      .map((r) => r.label);
  }
  if (!focus.length) throw badRequest("No weak spots yet — take a few quizzes first and we'll target what you miss.");

  // The demo generator has no "focus concepts" knob, so draw from each concept's topic
  // and prefer questions that test exactly the concepts being targeted.
  await think();
  const stems = (s) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).map((w) => w.slice(0, 5));
  const related = (concept, label) => {
    const want = new Set(stems(label));
    return Boolean(concept) && stems(concept).some((w) => want.has(w));
  };
  const pools = focus.map((label) => {
    const { questions } = aiQuestions({ label, count: 30, difficulty: "mixed", types: ["mcq", "truefalse"] });
    const seen = new Set();
    const unique = questions.filter((q) => !seen.has(q.prompt) && seen.add(q.prompt));
    return { on: unique.filter((q) => related(q.concept, label)), off: unique.filter((q) => !related(q.concept, label)) };
  });
  const questions = [];
  const used = new Set();
  // Round-robin across concepts: on-target questions first, then the rest of each topic.
  for (const kind of ["on", "off"]) {
    for (let round = 0; questions.length < count && pools.some((p) => p[kind].length > round); round++) {
      for (const p of pools) {
        const q = p[kind][round];
        if (!q || used.has(q.prompt) || questions.length >= count) continue;
        used.add(q.prompt);
        questions.push({ ...q, id: shortId() });
      }
    }
  }

  const quiz = insert("quizzes", {
    ownerId: req.user.id,
    title: `Weak spots: ${focus.slice(0, 3).join(", ")}${focus.length > 3 ? "…" : ""}`,
    topic: focus.join(", "),
    source: "adaptive",
    questions,
  });
  return { quiz, concepts: focus };
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

route("GET", "/quizzes", (req) => {
  const scope = req.query.scope === "assigned" ? "assigned" : "mine";
  let match;
  if (scope === "mine") match = (q) => q.ownerId === req.user.id;
  else {
    const classIds = new Set(myClassIds(req.user));
    match = (q) => q.published && classIds.has(q.classroomId) && q.ownerId !== req.user.id;
  }
  const quizzes = db.quizzes.filter(match).sort(by("createdAt", "desc")).slice(0, 100);

  const ids = new Set(quizzes.map((q) => q.id));
  const best = {};
  for (const a of db.quizAttempts) {
    if (a.userId !== req.user.id || !ids.has(a.quizId)) continue;
    const pct = a.maxScore ? a.score / a.maxScore : 0;
    if (!best[a.quizId] || pct > best[a.quizId].pct) best[a.quizId] = { pct, completedAt: a.completedAt, count: best[a.quizId]?.count };
    best[a.quizId].count = (best[a.quizId].count ?? 0) + 1;
  }

  return {
    quizzes: quizzes.map(({ questions, ...q }) => ({
      ...q,
      classroom: classSummary(q.classroomId),
      _count: { attempts: db.quizAttempts.filter((a) => a.quizId === q.id).length },
      questionCount: questions.length,
      myBest: best[q.id] ?? null,
    })),
  };
});

route("GET", "/quizzes/:id", (req) => {
  const { quiz, isOwner } = quizAccess(req.params.id, req.user);
  const attempts = db.quizAttempts
    .filter((a) => a.quizId === quiz.id && a.userId === req.user.id)
    .sort(by("completedAt", "desc"))
    .map(({ id, score, maxScore, completedAt, durationSec }) => ({ id, score, maxScore, completedAt, durationSec }));
  return {
    quiz: { ...quiz, classroom: classSummary(quiz.classroomId), questions: isOwner ? quiz.questions : quiz.questions.map(publicQuestion) },
    isOwner,
    attempts,
  };
});

/** Normalise a hand-authored/edited question; throws a 400 if it's incomplete. */
function editedQuestion(q) {
  const edited = {
    id: q.id || shortId(),
    type: q.type,
    prompt: q.prompt,
    options: q.type === "truefalse" ? ["True", "False"] : q.type === "short" ? [] : q.options.filter(Boolean),
    answerIndex: q.type === "short" ? null : (q.answerIndex ?? null),
    answerText: q.answerText ?? null,
    explanation: q.explanation ?? null,
    concept: q.concept ?? null,
    difficulty: q.difficulty ?? "medium",
    points: q.points ?? (q.type === "short" ? 2 : 1),
  };
  const label = q.prompt.slice(0, 40);
  if (edited.type === "mcq" && edited.options.length < 2) throw badRequest(`Question "${label}" needs at least two options.`);
  if (edited.type !== "short" && (edited.answerIndex == null || edited.answerIndex < 0 || edited.answerIndex >= edited.options.length)) {
    throw badRequest(`Question "${label}" needs a correct option.`);
  }
  if (edited.type === "short" && !edited.answerText) throw badRequest(`Question "${label}" needs a model answer.`);
  return edited;
}

route("POST", "/quizzes", (req) => {
  const b = req.body ?? {};
  const data = {
    title: str(b.title, "title", 160),
    topic: optStr(b.topic, "topic", 200),
    description: optStr(b.description, "description", 2000),
    timeLimitMin: int(b.timeLimitMin, "timeLimitMin", { min: 1, max: 240 }),
    questions: questionList(b.questions, "questions"),
  };
  const quiz = insert("quizzes", defined({ ...data, ownerId: req.user.id, source: "manual", questions: data.questions.map(editedQuestion) }));
  return { quiz };
});

route("PATCH", "/quizzes/:id", (req) => {
  const quiz = findOr404("quizzes", req.params.id, "Quiz");
  if (quiz.ownerId !== req.user.id) throw forbidden();
  const b = req.body ?? {};
  let dueAt;
  if (b.dueAt !== undefined) {
    dueAt = b.dueAt === null ? null : new Date(b.dueAt);
    if (dueAt && Number.isNaN(dueAt.getTime())) throw fail("dueAt", "Invalid date");
  }
  if (b.published !== undefined && typeof b.published !== "boolean") throw fail("published", `Expected boolean, received ${typeof b.published}`);
  const data = defined({
    title: b.title === undefined ? undefined : str(b.title, "title", 160),
    description: clearable(b.description, "description", 2000),
    classroomId: objectIdField(b.classroomId, "classroomId", { nullable: true }),
    published: b.published,
    dueAt,
    timeLimitMin: int(b.timeLimitMin, "timeLimitMin", { min: 1, max: 240, nullable: true }),
    questions: b.questions === undefined ? undefined : questionList(b.questions, "questions"),
  });

  const classroomId = data.classroomId === undefined ? quiz.classroomId : data.classroomId;
  const published = data.published ?? quiz.published;
  if (published) {
    if (!classroomId) throw badRequest("Choose a class to publish to.");
    classAccess(classroomId, req.user, { teacher: true });
  }

  const patch = { ...data, classroomId, published };
  if (data.questions) patch.questions = data.questions.map(editedQuestion);

  const wasPublished = quiz.published;
  const prevClassroomId = quiz.classroomId;
  const updated = update("quizzes", quiz, patch);
  if (published && (!wasPublished || prevClassroomId !== classroomId)) {
    notify(classStudentIds(classroomId), {
      type: "quiz",
      title: `New quiz: ${updated.title}`,
      body: byId("classrooms", classroomId)?.name,
      link: `/app/quizzes/${updated.id}`,
    });
  }
  return { quiz: updated };
});

route("DELETE", "/quizzes/:id", (req) => {
  const quiz = findOr404("quizzes", req.params.id, "Quiz");
  if (quiz.ownerId !== req.user.id) throw forbidden();
  remove("quizAttempts", (a) => a.quizId === quiz.id);
  remove("quizzes", (q) => q.id === quiz.id);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

/** Share of model-answer keywords present (backend's no-AI fallback), used for partial credit. */
function keywordScore(answer = "", model = "") {
  const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  const expected = words(model);
  if (!expected.size) return 0;
  const got = words(answer);
  let hit = 0;
  for (const w of expected) if (got.has(w)) hit += 1;
  return hit / expected.size >= 0.5 ? 1 : hit / expected.size >= 0.25 ? 0.5 : 0;
}

/** Demo stand-in for gradeShortAnswers: Map(id -> { score 0..1, feedback }). */
function gradeShortAnswers(items) {
  const out = new Map();
  for (const i of items) {
    const g = gradeShortAnswer({ answerText: i.answerText }, i.text);
    const partial = g.correct ? 1 : Math.min(0.5, keywordScore(i.text, i.answerText ?? ""));
    out.set(i.id, {
      score: partial,
      feedback: g.correct ? g.feedback : partial ? `Partly there. A complete answer would also mention: ${i.answerText}.` : g.feedback,
    });
  }
  return out;
}

route("POST", "/quizzes/:id/attempts", async (req) => {
  const { quiz, isOwner } = quizAccess(req.params.id, req.user);
  const b = req.body ?? {};
  const answersIn = arrayOf(b.answers, "answers", { max: 100 }).map((a, i) => {
    const path = `answers.${i}`;
    if (!a || typeof a !== "object") throw fail(path, "Expected object");
    if (typeof a.questionId !== "string") throw fail(`${path}.questionId`, "Required");
    if (a.text != null && typeof a.text !== "string") throw fail(`${path}.text`, "Expected string");
    if (typeof a.text === "string" && a.text.length > 5000) throw fail(`${path}.text`, "String must contain at most 5000 character(s)");
    return { questionId: a.questionId, choiceIndex: int(a.choiceIndex, `${path}.choiceIndex`, { nullable: true }), text: a.text };
  });
  const durationSec = int(b.durationSec, "durationSec", { min: 0, max: 24 * 3600 });
  const given = new Map(answersIn.map((a) => [a.questionId, a]));

  const shortItems = quiz.questions
    .filter((q) => q.type === "short")
    .map((q) => ({ id: q.id, prompt: q.prompt, answerText: q.answerText, text: given.get(q.id)?.text?.trim() ?? "" }));
  const toGrade = shortItems.filter((i) => i.text);
  if (toGrade.length) await think(500, 1100);
  const shortGrades = gradeShortAnswers(toGrade);

  let score = 0;
  let maxScore = 0;
  const answers = quiz.questions.map((q) => {
    const a = given.get(q.id);
    maxScore += q.points;
    if (q.type === "short") {
      const text = a?.text?.trim() ?? "";
      const g = text ? (shortGrades.get(q.id) ?? { score: 0, feedback: null }) : { score: 0, feedback: "No answer given." };
      const pts = Math.round(q.points * g.score * 100) / 100;
      score += pts;
      return { questionId: q.id, text, choiceIndex: null, correct: g.score >= 0.7, points: pts, feedback: g.feedback };
    }
    const choice = Number.isInteger(a?.choiceIndex) ? a.choiceIndex : null;
    const correct = choice !== null && choice === q.answerIndex;
    if (correct) score += q.points;
    return { questionId: q.id, choiceIndex: choice, text: null, correct, points: correct ? q.points : 0, feedback: null };
  });

  const previous = db.quizAttempts.filter((a) => a.quizId === quiz.id && a.userId === req.user.id).length;
  const attempt = insert("quizAttempts", { quizId: quiz.id, userId: req.user.id, answers, score, maxScore, durationSec: durationSec ?? null });

  // Concept mastery — the signal behind adaptive practice and class insights.
  const byConcept = new Map();
  quiz.questions.forEach((q, i) => {
    if (!q.concept) return;
    const key = conceptKey(q.concept);
    const agg = byConcept.get(key) ?? { label: q.concept.trim(), correct: 0, total: 0 };
    agg.total += 1;
    if (answers[i].correct) agg.correct += 1;
    byConcept.set(key, agg);
  });
  for (const [concept, agg] of byConcept) {
    const row = db.conceptMastery.find((r) => r.userId === req.user.id && r.concept === concept);
    if (row) update("conceptMastery", row, { correct: row.correct + agg.correct, total: row.total + agg.total, lastSeenAt: new Date() });
    else insert("conceptMastery", { userId: req.user.id, concept, label: agg.label, subject: quiz.topic, correct: agg.correct, total: agg.total });
  }

  const correctCount = answers.filter((a) => a.correct).length;
  const reward = awardXp(req.user.id, "quiz", previous ? 5 : XP.quizBase + XP.quizPerCorrect * correctCount, {
    tz: req.tz,
    meta: { quizId: quiz.id, score, maxScore },
  });

  return {
    attempt,
    // Full answers are revealed once an attempt is in.
    questions: quiz.questions,
    reward,
    isOwner,
  };
});

route("GET", "/quizzes/:id/attempts/:attemptId", (req) => {
  const { quiz, isOwner } = quizAccess(req.params.id, req.user);
  const attempt = findOr404("quizAttempts", req.params.attemptId, "Attempt");
  if (attempt.quizId !== quiz.id || (attempt.userId !== req.user.id && !isOwner)) throw notFound("Attempt");
  return { attempt, questions: quiz.questions, quiz: { id: quiz.id, title: quiz.title, topic: quiz.topic } };
});

route("GET", "/quizzes/:id/results", (req) => {
  const quiz = findOr404("quizzes", req.params.id, "Quiz");
  if (quiz.ownerId !== req.user.id) throw forbidden();
  const attempts = db.quizAttempts
    .filter((a) => a.quizId === quiz.id)
    .sort(by("completedAt", "desc"))
    .map((a) => ({ ...a, user: userSummary(byId("users", a.userId)) }));

  // Best attempt per learner.
  const bestByUser = new Map();
  for (const a of attempts) {
    const cur = bestByUser.get(a.userId);
    if (!cur || a.score / a.maxScore > cur.score / cur.maxScore) bestByUser.set(a.userId, a);
  }
  const best = [...bestByUser.values()];

  const perQuestion = quiz.questions.map((q, i) => {
    const rows = best.map((a) => a.answers[i]).filter(Boolean);
    const wrongChoices = {};
    for (const r of rows) if (!r.correct && r.choiceIndex != null) wrongChoices[r.choiceIndex] = (wrongChoices[r.choiceIndex] ?? 0) + 1;
    const common = Object.entries(wrongChoices).sort((a, b) => b[1] - a[1])[0];
    return {
      id: q.id,
      prompt: q.prompt,
      concept: q.concept,
      answered: rows.length,
      correctRate: rows.length ? rows.filter((r) => r.correct).length / rows.length : null,
      commonWrong: common ? { option: q.options[Number(common[0])], count: common[1] } : null,
    };
  });

  let notAttempted = [];
  if (quiz.classroomId) {
    notAttempted = db.memberships
      .filter((m) => m.classroomId === quiz.classroomId && !bestByUser.has(m.userId))
      .map((m) => userSummary(byId("users", m.userId)));
  }

  return {
    quiz,
    summary: {
      learners: best.length,
      attempts: attempts.length,
      averagePct: best.length ? (best.reduce((s, a) => s + a.score / a.maxScore, 0) / best.length) * 100 : null,
    },
    best: best.map((a) => ({ id: a.id, user: a.user, score: a.score, maxScore: a.maxScore, completedAt: a.completedAt, durationSec: a.durationSec })),
    perQuestion,
    notAttempted,
  };
});

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

route("GET", "/mastery", (req) => {
  const rows = db.conceptMastery
    .filter((r) => r.userId === req.user.id)
    .sort(by("lastSeenAt", "desc"))
    .slice(0, 200);
  const concepts = rows.map((r) => ({
    concept: r.label,
    subject: r.subject,
    correct: r.correct,
    total: r.total,
    accuracy: r.total ? r.correct / r.total : 0,
    lastSeenAt: r.lastSeenAt,
  }));
  const weak = concepts.filter((c) => c.accuracy < 0.75).sort((a, b) => a.accuracy - b.accuracy).slice(0, 8);
  const strong = concepts.filter((c) => c.accuracy >= 0.85 && c.total >= 2).sort((a, b) => b.total - a.total).slice(0, 8);
  return { concepts, weak, strong };
});

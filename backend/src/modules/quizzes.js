import { Router } from "express";
import { z } from "zod";
import { prisma, userSummary } from "../lib/prisma.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { jsonField, parse, zNullableText, zObjectId, zOptText } from "../lib/http.js";
import { classAccess, classStudentIds, findOr404, myClassIds } from "../lib/access.js";
import { notify } from "../lib/notify.js";
import { awardXp, XP } from "../lib/gamification.js";
import { resolveSource } from "../ai/sources.js";
import { DIFFICULTIES, QUESTION_TYPES, generateQuestions, gradeShortAnswers } from "../ai/quiz.js";
import { shortId } from "../lib/ids.js";
import { uploader } from "../middleware/upload.js";
import { aiLimiter } from "../middleware/rateLimit.js";

const router = Router();
export const masteryRouter = Router();

const conceptKey = (c) => c.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);

/** Question view for someone taking the quiz: no answers, no explanations. */
const publicQuestion = ({ id, type, prompt, options, points, difficulty }) => ({ id, type, prompt, options, points, difficulty });

async function quizAccess(id, user) {
  const quiz = await findOr404(prisma.quiz, id, "Quiz");
  if (quiz.ownerId === user.id) return { quiz, isOwner: true };
  if (quiz.published && quiz.classroomId) {
    await classAccess(quiz.classroomId, user);
    return { quiz, isOwner: false };
  }
  throw notFound("Quiz");
}

const generateSchema = z.object({
  source: z.enum(["topic", "text", "material", "file"]).default("topic"),
  topic: zOptText(200),
  text: zOptText(200_000),
  materialId: zObjectId.optional(),
  count: z.coerce.number().int().min(3).max(30).default(8),
  difficulty: z.enum(DIFFICULTIES).default("mixed"),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).default(["mcq"]),
  title: zOptText(160),
  timeLimitMin: z.coerce.number().int().min(1).max(240).optional(),
});

router.post("/generate", aiLimiter, uploader("readable", 1).single("file"), async (req, res) => {
  const input = parse(generateSchema, { ...req.body, types: jsonField(req.body.types, req.body.types) });
  const src = await resolveSource(input, req.user, req.file);
  const { title, questions } = await generateQuestions({
    label: src.label,
    parts: src.parts,
    count: input.count,
    difficulty: input.difficulty,
    types: input.types,
  });
  const quiz = await prisma.quiz.create({
    data: {
      ownerId: req.user.id,
      title: input.title || title,
      topic: src.label,
      difficulty: input.difficulty,
      source: input.source,
      questions,
      timeLimitMin: input.timeLimitMin,
    },
  });
  res.status(201).json({ quiz });
});

router.post("/adaptive", aiLimiter, async (req, res) => {
  const input = parse(
    z.object({ count: z.coerce.number().int().min(3).max(20).default(8), concepts: z.array(z.string().trim().min(1).max(80)).max(8).optional() }),
    req.body,
  );
  let focus = input.concepts;
  if (!focus?.length) {
    const rows = await prisma.conceptMastery.findMany({ where: { userId: req.user.id }, orderBy: { lastSeenAt: "desc" }, take: 100 });
    focus = rows
      .map((r) => ({ ...r, acc: r.total ? r.correct / r.total : 1 }))
      .filter((r) => r.acc < 0.75)
      .sort((a, b) => a.acc - b.acc || b.total - a.total)
      .slice(0, 5)
      .map((r) => r.label);
  }
  if (!focus.length) throw badRequest("No weak spots yet — take a few quizzes first and we'll target what you miss.");

  const { questions } = await generateQuestions({ label: "Weak spots review", count: input.count, difficulty: "mixed", types: ["mcq", "truefalse"], focusConcepts: focus });
  const quiz = await prisma.quiz.create({
    data: {
      ownerId: req.user.id,
      title: `Weak spots: ${focus.slice(0, 3).join(", ")}${focus.length > 3 ? "…" : ""}`,
      topic: focus.join(", "),
      source: "adaptive",
      questions,
    },
  });
  res.status(201).json({ quiz, concepts: focus });
});

router.get("/", async (req, res) => {
  const scope = req.query.scope === "assigned" ? "assigned" : "mine";
  const where =
    scope === "mine"
      ? { ownerId: req.user.id }
      : { published: true, classroomId: { in: await myClassIds(req.user) }, NOT: { ownerId: req.user.id } };

  const quizzes = await prisma.quiz.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { classroom: { select: { id: true, name: true, theme: true } }, _count: { select: { attempts: true } } },
  });
  const mine = await prisma.quizAttempt.findMany({
    where: { userId: req.user.id, quizId: { in: quizzes.map((q) => q.id) } },
    select: { quizId: true, score: true, maxScore: true, completedAt: true },
  });
  const best = {};
  for (const a of mine) {
    const pct = a.maxScore ? a.score / a.maxScore : 0;
    if (!best[a.quizId] || pct > best[a.quizId].pct) best[a.quizId] = { pct, completedAt: a.completedAt };
    best[a.quizId].count = (best[a.quizId].count ?? 0) + 1;
  }
  res.json({
    quizzes: quizzes.map(({ questions, ...q }) => ({ ...q, questionCount: questions.length, myBest: best[q.id] ?? null })),
  });
});

router.get("/:id", async (req, res) => {
  const { quiz, isOwner } = await quizAccess(req.params.id, req.user);
  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: quiz.id, userId: req.user.id },
    orderBy: { completedAt: "desc" },
    select: { id: true, score: true, maxScore: true, completedAt: true, durationSec: true },
  });
  const classroom = quiz.classroomId ? await prisma.classroom.findUnique({ where: { id: quiz.classroomId }, select: { id: true, name: true, theme: true } }) : null;
  res.json({
    quiz: { ...quiz, classroom, questions: isOwner ? quiz.questions : quiz.questions.map(publicQuestion) },
    isOwner,
    attempts,
  });
});

const questionEditSchema = z.object({
  id: z.string().optional(),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().trim().min(1).max(4000),
  options: z.array(z.string().trim().max(1000)).max(8).default([]),
  answerIndex: z.number().int().nullable().optional(),
  answerText: z.string().trim().max(4000).nullable().optional(),
  explanation: z.string().trim().max(4000).nullable().optional(),
  concept: z.string().trim().max(80).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  points: z.number().min(0).max(100).optional(),
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

router.post("/", async (req, res) => {
  const data = parse(
    z.object({
      title: z.string().trim().min(1).max(160),
      topic: zOptText(200),
      description: zOptText(2000),
      timeLimitMin: z.number().int().min(1).max(240).optional(),
      questions: z.array(questionEditSchema).min(1).max(60),
    }),
    req.body,
  );
  const quiz = await prisma.quiz.create({
    data: { ...data, ownerId: req.user.id, source: "manual", questions: data.questions.map(editedQuestion) },
  });
  res.status(201).json({ quiz });
});

router.patch("/:id", async (req, res) => {
  const quiz = await findOr404(prisma.quiz, req.params.id, "Quiz");
  if (quiz.ownerId !== req.user.id) throw forbidden();
  const data = parse(
    z.object({
      title: z.string().trim().min(1).max(160).optional(),
      description: zNullableText(2000),
      classroomId: zObjectId.nullable().optional(),
      published: z.boolean().optional(),
      dueAt: z.coerce.date().nullable().optional(),
      timeLimitMin: z.number().int().min(1).max(240).nullable().optional(),
      questions: z.array(questionEditSchema).min(1).max(60).optional(),
    }),
    req.body,
  );

  const classroomId = data.classroomId === undefined ? quiz.classroomId : data.classroomId;
  const published = data.published ?? quiz.published;
  if (published) {
    if (!classroomId) throw badRequest("Choose a class to publish to.");
    await classAccess(classroomId, req.user, { teacher: true });
  }

  const update = { ...data, classroomId, published };
  if (data.questions) update.questions = { set: data.questions.map(editedQuestion) };

  const updated = await prisma.quiz.update({ where: { id: quiz.id }, data: update });
  if (published && (!quiz.published || quiz.classroomId !== classroomId)) {
    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { name: true } });
    notify(await classStudentIds(classroomId), {
      type: "quiz",
      title: `New quiz: ${updated.title}`,
      body: classroom?.name,
      link: `/app/quizzes/${updated.id}`,
    });
  }
  res.json({ quiz: updated });
});

router.delete("/:id", async (req, res) => {
  const quiz = await findOr404(prisma.quiz, req.params.id, "Quiz", { select: { id: true, ownerId: true } });
  if (quiz.ownerId !== req.user.id) throw forbidden();
  await prisma.quiz.delete({ where: { id: quiz.id } });
  res.json({ ok: true });
});

// ---- attempts ----------------------------------------------------------------

/** Fallback when AI grading is unavailable: share of model-answer keywords present. */
function keywordScore(answer = "", model = "") {
  const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  const expected = words(model);
  if (!expected.size) return 0;
  const got = words(answer);
  let hit = 0;
  for (const w of expected) if (got.has(w)) hit += 1;
  return hit / expected.size >= 0.5 ? 1 : hit / expected.size >= 0.25 ? 0.5 : 0;
}

router.post("/:id/attempts", async (req, res) => {
  const { quiz, isOwner } = await quizAccess(req.params.id, req.user);
  const input = parse(
    z.object({
      answers: z
        .array(z.object({ questionId: z.string(), choiceIndex: z.number().int().nullable().optional(), text: z.string().max(5000).nullable().optional() }))
        .max(100),
      durationSec: z.number().int().min(0).max(24 * 3600).optional(),
    }),
    req.body,
  );
  const given = new Map(input.answers.map((a) => [a.questionId, a]));

  const shortItems = quiz.questions
    .filter((q) => q.type === "short")
    .map((q) => ({ id: q.id, prompt: q.prompt, answerText: q.answerText, text: given.get(q.id)?.text?.trim() ?? "" }));

  let shortGrades = new Map();
  try {
    shortGrades = await gradeShortAnswers(shortItems.filter((i) => i.text));
  } catch (err) {
    console.warn("[quizzes] short-answer AI grading failed, using keyword fallback:", err.message);
    shortGrades = new Map(
      shortItems.map((i) => [i.id, { score: keywordScore(i.text, i.answerText), feedback: "Auto-checked against the model answer — compare them to see what you missed." }]),
    );
  }

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

  const previous = await prisma.quizAttempt.count({ where: { quizId: quiz.id, userId: req.user.id } });
  const attempt = await prisma.quizAttempt.create({
    data: { quizId: quiz.id, userId: req.user.id, answers, score, maxScore, durationSec: input.durationSec },
  });

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
  await Promise.all(
    [...byConcept].map(([concept, agg]) =>
      prisma.conceptMastery.upsert({
        where: { userId_concept: { userId: req.user.id, concept } },
        create: { userId: req.user.id, concept, label: agg.label, subject: quiz.topic, correct: agg.correct, total: agg.total },
        update: { correct: { increment: agg.correct }, total: { increment: agg.total }, lastSeenAt: new Date() },
      }),
    ),
  );

  const correctCount = answers.filter((a) => a.correct).length;
  const reward = await awardXp(req.user.id, "quiz", previous ? 5 : XP.quizBase + XP.quizPerCorrect * correctCount, {
    tz: req.tz,
    meta: { quizId: quiz.id, score, maxScore },
  });

  res.status(201).json({
    attempt,
    // Full answers are revealed once an attempt is in.
    questions: quiz.questions,
    reward,
    isOwner,
  });
});

router.get("/:id/attempts/:attemptId", async (req, res) => {
  const { quiz, isOwner } = await quizAccess(req.params.id, req.user);
  const attempt = await findOr404(prisma.quizAttempt, req.params.attemptId, "Attempt");
  if (attempt.quizId !== quiz.id || (attempt.userId !== req.user.id && !isOwner)) throw notFound("Attempt");
  res.json({ attempt, questions: quiz.questions, quiz: { id: quiz.id, title: quiz.title, topic: quiz.topic } });
});

router.get("/:id/results", async (req, res) => {
  const quiz = await findOr404(prisma.quiz, req.params.id, "Quiz");
  if (quiz.ownerId !== req.user.id) throw forbidden();
  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: quiz.id },
    include: { user: userSummary },
    orderBy: { completedAt: "desc" },
  });

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
    const members = await prisma.membership.findMany({ where: { classroomId: quiz.classroomId }, include: { user: userSummary } });
    notAttempted = members.filter((m) => !bestByUser.has(m.userId)).map((m) => m.user);
  }

  res.json({
    quiz,
    summary: {
      learners: best.length,
      attempts: attempts.length,
      averagePct: best.length ? (best.reduce((s, a) => s + a.score / a.maxScore, 0) / best.length) * 100 : null,
    },
    best: best.map((a) => ({ id: a.id, user: a.user, score: a.score, maxScore: a.maxScore, completedAt: a.completedAt, durationSec: a.durationSec })),
    perQuestion,
    notAttempted,
  });
});

// ---- mastery -----------------------------------------------------------------

masteryRouter.get("/", async (req, res) => {
  const rows = await prisma.conceptMastery.findMany({ where: { userId: req.user.id }, orderBy: { lastSeenAt: "desc" }, take: 200 });
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
  res.json({ concepts, weak, strong });
});

export default router;

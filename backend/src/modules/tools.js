import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { jsonField, parse, zObjectId, zOptText } from "../lib/http.js";
import { findOr404 } from "../lib/access.js";
import { generateJSON } from "../lib/gemini.js";
import { extractLocalText, fileToParts } from "../lib/extract.js";
import { shortId } from "../lib/ids.js";
import { resolveSource } from "../ai/sources.js";
import { teacherOnly } from "../middleware/auth.js";
import { uploader } from "../middleware/upload.js";
import { aiLimiter } from "../middleware/rateLimit.js";

const router = Router();
export const artifactRouter = Router();

const BLOOM = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

async function saveArtifact(userId, type, title, data) {
  return prisma.artifact.create({ data: { userId, type, title: title.slice(0, 160), data } });
}

// ---- lesson planner ----------------------------------------------------------

const lessonSchema = z.object({
  title: z.string(),
  overview: z.string().describe("2-3 sentences: what students learn and how."),
  objectives: z.array(z.string()).describe("3-5 measurable objectives starting with an action verb (Students will be able to...)."),
  prerequisites: z.array(z.string()),
  materials: z.array(z.string()),
  agenda: z
    .array(
      z.object({
        minutes: z.number().int(),
        title: z.string(),
        description: z.string(),
        teacher: z.string().describe("What the teacher does."),
        students: z.string().describe("What students do."),
      }),
    )
    .describe("Timed segments whose minutes sum exactly to the lesson duration."),
  checksForUnderstanding: z.array(z.string()),
  differentiation: z.object({ support: z.array(z.string()), challenge: z.array(z.string()) }),
  homework: z.string(),
  exitTicket: z.array(z.string()).describe("2-3 quick exit-ticket questions."),
});

router.post("/lesson-plan", teacherOnly, aiLimiter, async (req, res) => {
  const input = parse(
    z.object({
      topic: z.string().trim().min(2).max(200),
      subject: zOptText(80),
      grade: zOptText(60),
      durationMin: z.coerce.number().int().min(10).max(240).default(45),
      style: z.enum(["interactive", "lecture", "flipped", "project", "inquiry"]).default("interactive"),
      objectives: zOptText(1500),
      notes: zOptText(2000),
    }),
    req.body,
  );
  const { data } = await generateJSON({
    system:
      "You are a master teacher and instructional coach. You design practical, engaging lessons using active learning, clear success criteria and formative assessment. Plans must be realistic to run in a normal classroom.",
    prompt: [
      `Plan a ${input.durationMin}-minute ${input.style} lesson on "${input.topic}".`,
      input.subject ? `Subject: ${input.subject}` : "",
      input.grade ? `Grade / level: ${input.grade}` : "",
      input.objectives ? `Teacher's intended objectives: ${input.objectives}` : "",
      input.notes ? `Constraints / notes: ${input.notes}` : "",
      `Agenda minutes must sum to exactly ${input.durationMin}.`,
    ]
      .filter(Boolean)
      .join("\n"),
    schema: lessonSchema,
    temperature: 0.6,
  });
  const artifact = await saveArtifact(req.user.id, "lesson_plan", data.title, { input, plan: data });
  res.status(201).json({ artifact });
});

// ---- question paper -----------------------------------------------------------

const SECTION_TYPES = ["mcq", "truefalse", "fill", "short", "long"];
const SECTION_LABEL = { mcq: "Multiple choice", truefalse: "True or false", fill: "Fill in the blanks", short: "Short answer", long: "Long answer" };

const paperSchema = z.object({
  title: z.string(),
  instructions: z.array(z.string()).describe("General instructions for candidates."),
  sections: z.array(
    z.object({
      type: z.enum(SECTION_TYPES),
      questions: z.array(
        z.object({
          text: z.string().describe("Question text. Use $...$ for math."),
          options: z.array(z.string()).optional().describe("4 options for mcq only."),
          answer: z.string().describe("Correct answer for objective items; marking scheme with key points for subjective items."),
          bloom: z.enum(BLOOM),
          difficulty: z.enum(["easy", "medium", "hard"]),
        }),
      ),
    }),
  ),
});

router.post("/question-paper", teacherOnly, aiLimiter, uploader("readable", 1).single("file"), async (req, res) => {
  const input = parse(
    z.object({
      source: z.enum(["topic", "text", "material", "file"]).default("topic"),
      topic: zOptText(300),
      text: zOptText(200_000),
      materialId: zObjectId.optional(),
      subject: zOptText(80),
      grade: zOptText(60),
      durationMin: z.coerce.number().int().min(10).max(360).default(60),
      difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
      sections: z
        .array(z.object({ type: z.enum(SECTION_TYPES), count: z.coerce.number().int().min(1).max(40), marksEach: z.coerce.number().min(0.5).max(50) }))
        .min(1)
        .max(6),
      notes: zOptText(2000),
    }),
    { ...req.body, sections: jsonField(req.body.sections, req.body.sections) },
  );
  const src = await resolveSource(input, req.user, req.file);
  const totalMarks = input.sections.reduce((s, x) => s + x.count * x.marksEach, 0);

  const { data } = await generateJSON({
    system: [
      "You are a chief examiner who sets balanced, unambiguous, syllabus-aligned question papers.",
      "Spread questions across Bloom's levels; long-answer questions should target apply/analyze/evaluate.",
      "Never repeat a question or test the same fact twice. Every objective item has exactly one correct answer.",
      src.parts.length ? "Base questions strictly on the provided source material." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    parts: src.parts,
    prompt: [
      `Set a question paper on "${src.label}"${input.subject ? ` (${input.subject})` : ""}${input.grade ? ` for ${input.grade}` : ""}.`,
      `Duration ${input.durationMin} minutes, total ${totalMarks} marks, overall difficulty: ${input.difficulty}.`,
      "Sections, in this order:",
      ...input.sections.map((s, i) => `${i + 1}. ${SECTION_LABEL[s.type]} (type "${s.type}"): exactly ${s.count} questions, ${s.marksEach} marks each.`),
      input.notes ? `Examiner notes: ${input.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: paperSchema,
    temperature: 0.5,
    thinking: "high",
    timeoutMs: 180_000,
  });

  // Enforce the requested structure regardless of what the model returned.
  let number = 0;
  const sections = input.sections.map((cfg, i) => {
    const generated =
      (data.sections[i]?.type === cfg.type ? data.sections[i] : data.sections.find((s) => s.type === cfg.type)) ?? data.sections[i] ?? { questions: [] };
    return {
      id: shortId(),
      title: `Section ${String.fromCharCode(65 + i)} — ${SECTION_LABEL[cfg.type]}`,
      type: cfg.type,
      marksEach: cfg.marksEach,
      questions: generated.questions.slice(0, cfg.count).map((q) => ({
        id: shortId(),
        number: ++number,
        text: q.text,
        options: cfg.type === "mcq" ? (q.options ?? []).slice(0, 4) : cfg.type === "truefalse" ? ["True", "False"] : [],
        answer: q.answer,
        marks: cfg.marksEach,
        bloom: q.bloom,
        difficulty: q.difficulty,
      })),
    };
  });
  const paper = {
    title: data.title,
    subject: input.subject ?? null,
    grade: input.grade ?? null,
    durationMin: input.durationMin,
    totalMarks: sections.reduce((s, sec) => s + sec.questions.length * sec.marksEach, 0),
    instructions: data.instructions,
    sections,
  };
  const artifact = await saveArtifact(req.user.id, "question_paper", paper.title, { input: { ...input, text: undefined }, paper });
  res.status(201).json({ artifact });
});

/** Convert the objective questions of a saved paper into an interactive quiz. */
router.post("/question-paper/:id/to-quiz", teacherOnly, async (req, res) => {
  const artifact = await findOr404(prisma.artifact, req.params.id, "Question paper");
  if (artifact.userId !== req.user.id || artifact.type !== "question_paper") throw forbidden();
  const { paper } = artifact.data;

  const questions = [];
  for (const section of paper.sections) {
    for (const q of section.questions) {
      if (section.type === "mcq" || section.type === "truefalse") {
        const options = section.type === "truefalse" ? ["True", "False"] : q.options;
        const ans = String(q.answer).trim();
        const letter = ans.match(/^\(?([A-D])[).:\s]/i) || ans.match(/^([A-D])$/i);
        let idx = letter ? letter[1].toUpperCase().charCodeAt(0) - 65 : options.findIndex((o) => o.trim().toLowerCase() === ans.toLowerCase());
        if (idx < 0) idx = options.findIndex((o) => ans.toLowerCase().includes(o.trim().toLowerCase()));
        if (idx < 0 || idx >= options.length) continue;
        questions.push({ id: shortId(), type: section.type, prompt: q.text, options, answerIndex: idx, answerText: null, explanation: null, concept: null, difficulty: q.difficulty, points: q.marks });
      } else if (section.type === "short" || section.type === "fill") {
        questions.push({ id: shortId(), type: "short", prompt: q.text, options: [], answerIndex: null, answerText: q.answer, explanation: null, concept: null, difficulty: q.difficulty, points: q.marks });
      }
    }
  }
  if (!questions.length) throw badRequest("This paper has no objective or short-answer questions to convert.");
  const quiz = await prisma.quiz.create({
    data: { ownerId: req.user.id, title: paper.title, topic: paper.subject, source: "paper", questions, timeLimitMin: paper.durationMin },
  });
  res.status(201).json({ quiz });
});

// ---- answer sheet checker -----------------------------------------------------------

const checkSchema = z.object({
  studentName: z.string().optional().describe("If written on the sheet."),
  questions: z.array(
    z.object({
      number: z.string(),
      question: z.string().describe("Short restatement of the question."),
      expected: z.string().describe("Key points expected, from the answer key."),
      studentAnswer: z.string().describe("Faithful transcription of what the student wrote (summarize if long)."),
      score: z.number(),
      maxScore: z.number(),
      verdict: z.enum(["correct", "partial", "incorrect", "unanswered"]),
      feedback: z.string().describe("Specific, constructive feedback for the student."),
    }),
  ),
  overallFeedback: z.string(),
  strengths: z.array(z.string()),
  focusAreas: z.array(z.string()).describe("Concepts to revise, most important first."),
  legibility: z.enum(["clear", "mostly_clear", "hard_to_read"]),
});

router.post(
  "/answer-check",
  aiLimiter,
  uploader("readable", 8).fields([
    { name: "answerKey", maxCount: 2 },
    { name: "answerSheet", maxCount: 6 },
  ]),
  async (req, res) => {
    const input = parse(
      z.object({
        answerKeyText: zOptText(100_000),
        defaultMarks: z.coerce.number().min(0.5).max(100).default(5),
        strictness: z.enum(["lenient", "balanced", "strict"]).default("balanced"),
        title: zOptText(160),
      }),
      req.body,
    );
    const keyFiles = req.files?.answerKey ?? [];
    const sheetFiles = req.files?.answerSheet ?? [];
    if (!sheetFiles.length) throw badRequest("Upload the answer sheet (photos or PDF).");
    if (!keyFiles.length && !input.answerKeyText) throw badRequest("Provide an answer key (file or text).");

    const keyParts = [];
    if (input.answerKeyText) keyParts.push({ text: input.answerKeyText });
    for (const f of keyFiles) {
      const text = await extractLocalText(f.buffer, f.mimetype);
      keyParts.push(...(text.length > 100 ? [{ text }] : await fileToParts(f.buffer, f.mimetype, f.originalname)));
    }
    const sheetParts = [];
    for (const f of sheetFiles) sheetParts.push({ text: `Answer sheet page: ${f.originalname}` }, ...(await fileToParts(f.buffer, f.mimetype, f.originalname)));

    const { data } = await generateJSON({
      system: [
        "You are an experienced examiner evaluating a student's answer sheet against an answer key. The sheet may be handwritten — read carefully.",
        `Grading strictness: ${input.strictness}. Award credit for correct concepts even when wording differs; give partial credit where deserved.`,
        `If the key doesn't specify marks for a question, it is worth ${input.defaultMarks} marks.`,
        "Match answers to questions by their numbers. Mark questions in the key that the student skipped as unanswered with score 0.",
      ].join("\n"),
      parts: [{ text: "=== ANSWER KEY ===" }, ...keyParts, { text: "=== STUDENT ANSWER SHEET ===" }, ...sheetParts],
      prompt: "Evaluate every question in the answer key.",
      schema: checkSchema,
      temperature: 0.1,
      thinking: "low",
      timeoutMs: 180_000,
    });

    const questions = data.questions.map((q) => ({ ...q, score: Math.max(0, Math.min(q.score, q.maxScore)) }));
    const result = {
      ...data,
      questions,
      totalScore: Math.round(questions.reduce((s, q) => s + q.score, 0) * 10) / 10,
      maxScore: questions.reduce((s, q) => s + q.maxScore, 0),
    };
    const title = input.title || `Answer check${data.studentName ? ` — ${data.studentName}` : ""}`;
    const artifact = await saveArtifact(req.user.id, "answer_check", title, { input: { strictness: input.strictness, files: sheetFiles.map((f) => f.originalname) }, result });
    res.status(201).json({ artifact });
  },
);

// ---- library -------------------------------------------------------------------

artifactRouter.get("/", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const artifacts = await prisma.artifact.findMany({
    where: { userId: req.user.id, ...(type ? { type } : {}) },
    select: { id: true, type: true, title: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ artifacts });
});

async function ownArtifact(id, user) {
  const a = await findOr404(prisma.artifact, id, "Item");
  if (a.userId !== user.id) throw forbidden();
  return a;
}

artifactRouter.get("/:id", async (req, res) => {
  res.json({ artifact: await ownArtifact(req.params.id, req.user) });
});

artifactRouter.patch("/:id", async (req, res) => {
  const a = await ownArtifact(req.params.id, req.user);
  const data = parse(z.object({ title: z.string().trim().min(1).max(160).optional(), data: z.record(z.string(), z.any()).optional() }), req.body);
  const artifact = await prisma.artifact.update({ where: { id: a.id }, data: { title: data.title, data: data.data ? { ...a.data, ...data.data } : undefined } });
  res.json({ artifact });
});

artifactRouter.delete("/:id", async (req, res) => {
  await ownArtifact(req.params.id, req.user);
  await prisma.artifact.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;

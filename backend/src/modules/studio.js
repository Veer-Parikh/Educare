import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { forbidden } from "../lib/errors.js";
import { parse, zBool, zObjectId, zOptText } from "../lib/http.js";
import { findOr404 } from "../lib/access.js";
import { generateJSON } from "../lib/gemini.js";
import { awardXp, XP } from "../lib/gamification.js";
import { resolveSource } from "../ai/sources.js";
import { generateQuestions } from "../ai/quiz.js";
import { generateCards } from "./flashcards.js";
import { uploader } from "../middleware/upload.js";
import { aiLimiter } from "../middleware/rateLimit.js";

const router = Router();

const packSchema = z.object({
  title: z.string().describe("Specific title for this study pack."),
  // Structured sections rather than one markdown string: models sometimes flatten
  // newlines inside JSON strings, which collapses headings into the paragraph.
  summarySections: z
    .array(
      z.object({
        heading: z.string().describe("Short section heading, 2-6 words."),
        body: z.string().describe("One focused paragraph (40-90 words). Bold the most important terms with **double asterisks**."),
      }),
    )
    .describe("2-4 sections that together form a 180-350 word study summary, in a logical teaching order."),
  keyPoints: z.array(z.string()).describe("6-10 most important takeaways, each one sentence."),
  concepts: z.array(z.object({ term: z.string(), definition: z.string() })).describe("8-15 key terms with plain-language definitions."),
  questionsToPonder: z.array(z.string()).describe("3-5 open questions that push deeper thinking or connect ideas."),
});

const createSchema = z.object({
  source: z.enum(["topic", "text", "material", "file"]),
  topic: zOptText(200),
  text: zOptText(200_000),
  materialId: zObjectId.optional(),
  level: zOptText(60),
  makeDeck: zBool.default(true),
  makeQuiz: zBool.default(true),
  cardCount: z.coerce.number().int().min(4).max(40).default(12),
  quizCount: z.coerce.number().int().min(3).max(20).default(6),
});

const listSelect = { id: true, title: true, sourceType: true, sourceName: true, deckId: true, quizId: true, createdAt: true };

router.post("/", aiLimiter, uploader("readable", 1).single("file"), async (req, res) => {
  const input = parse(createSchema, req.body);
  const src = await resolveSource(input, req.user, req.file);
  const audience = input.level ? `Write for a ${input.level} learner.` : "Write for a motivated high-school or early university learner.";

  const [pack, cards, quiz] = await Promise.allSettled([
    generateJSON({
      system: [
        "You are an expert study coach creating a study pack.",
        audience,
        src.parts.length ? "Stay faithful to the source; do not add facts it doesn't support." : "Use accurate, widely accepted knowledge.",
        "Use $...$ for math.",
      ].join("\n"),
      parts: src.parts,
      prompt: src.parts.length ? `Create a study pack for the source above (topic: "${src.label}").` : `Create a study pack about "${src.label}".`,
      schema: packSchema,
      temperature: 0.4,
    }),
    input.makeDeck ? generateCards({ label: src.label, parts: src.parts, count: input.cardCount }) : Promise.resolve(null),
    input.makeQuiz ? generateQuestions({ label: src.label, parts: src.parts, count: input.quizCount, types: ["mcq", "truefalse"] }) : Promise.resolve(null),
  ]);

  if (pack.status === "rejected") throw pack.reason;
  const data = pack.value.data;
  const warnings = [];

  let deckId = null;
  if (cards.status === "fulfilled" && cards.value?.cards.length) {
    const deck = await prisma.deck.create({ data: { ownerId: req.user.id, title: data.title, subject: src.label.slice(0, 80) } });
    await prisma.card.createMany({
      data: cards.value.cards.map((c) => ({ deckId: deck.id, ownerId: req.user.id, front: c.front, back: c.back, hint: c.hint || null })),
    });
    deckId = deck.id;
  } else if (input.makeDeck) warnings.push("Flashcards couldn't be generated this time.");

  let quizId = null;
  if (quiz.status === "fulfilled" && quiz.value?.questions.length) {
    const created = await prisma.quiz.create({
      data: { ownerId: req.user.id, title: `${data.title} — check-up`, topic: src.label, source: "studio", questions: quiz.value.questions },
    });
    quizId = created.id;
  } else if (input.makeQuiz) warnings.push("The quiz couldn't be generated this time.");

  const studySet = await prisma.studySet.create({
    data: {
      userId: req.user.id,
      title: data.title,
      sourceType: input.source,
      sourceName: req.file?.originalname ?? src.material?.title ?? (input.source === "topic" ? src.label : null),
      sourceText: src.sourceText?.slice(0, 200_000) ?? null,
      summary: data.summarySections.map((sec) => `### ${sec.heading.trim()}\n\n${sec.body.trim()}`).join("\n\n"),
      keyPoints: data.keyPoints,
      concepts: data.concepts,
      questionsToPonder: data.questionsToPonder,
      deckId,
      quizId,
    },
  });

  const reward = await awardXp(req.user.id, "studio", XP.studio, { tz: req.tz, meta: { studySetId: studySet.id } });
  const { sourceText, ...rest } = studySet;
  res.status(201).json({ studySet: { ...rest, hasSource: Boolean(sourceText) }, warnings, reward });
});

router.get("/", async (req, res) => {
  const studySets = await prisma.studySet.findMany({
    where: { userId: req.user.id },
    select: listSelect,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ studySets });
});

router.get("/:id", async (req, res) => {
  const set = await findOr404(prisma.studySet, req.params.id, "Study set");
  if (set.userId !== req.user.id) throw forbidden();
  const [deck, quiz] = await Promise.all([
    set.deckId ? prisma.deck.findUnique({ where: { id: set.deckId }, include: { _count: { select: { cards: true } } } }) : null,
    set.quizId ? prisma.quiz.findUnique({ where: { id: set.quizId }, select: { id: true, title: true, questions: true } }) : null,
  ]);
  const { sourceText, ...rest } = set;
  res.json({
    studySet: { ...rest, hasSource: Boolean(sourceText) },
    deck,
    quiz: quiz ? { id: quiz.id, title: quiz.title, questionCount: quiz.questions.length } : null,
  });
});

router.delete("/:id", async (req, res) => {
  const set = await findOr404(prisma.studySet, req.params.id, "Study set", { select: { id: true, userId: true } });
  if (set.userId !== req.user.id) throw forbidden();
  await prisma.studySet.delete({ where: { id: set.id } });
  res.json({ ok: true });
});

export default router;

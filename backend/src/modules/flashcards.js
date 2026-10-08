import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { forbidden } from "../lib/errors.js";
import { parse, zNullableText, zObjectId, zOptText } from "../lib/http.js";
import { findOr404 } from "../lib/access.js";
import { generateJSON } from "../lib/gemini.js";
import { previewIntervals, reviewCard } from "../lib/srs.js";
import { awardXp, XP } from "../lib/gamification.js";
import { resolveSource } from "../ai/sources.js";
import { uploader } from "../middleware/upload.js";
import { aiLimiter } from "../middleware/rateLimit.js";

export const deckRouter = Router();
export const cardRouter = Router();
export const reviewRouter = Router();

const cardInput = z.object({
  front: z.string().trim().min(1, "Card front is empty").max(2000),
  back: z.string().trim().min(1, "Card back is empty").max(4000),
  hint: zOptText(500),
});

async function ownDeck(id, user) {
  const deck = await findOr404(prisma.deck, id, "Deck");
  if (deck.ownerId !== user.id) throw forbidden();
  return deck;
}

async function ownCard(id, user) {
  const card = await findOr404(prisma.card, id, "Card");
  if (card.ownerId !== user.id) throw forbidden();
  return card;
}

// ---- AI generation -----------------------------------------------------------

const cardsSchema = z.object({
  title: z.string().describe("Short deck title."),
  cards: z.array(
    z.object({
      front: z.string().describe("A focused question or prompt. One idea per card."),
      back: z.string().describe("Concise answer, ideally under 40 words."),
      hint: z.string().optional().describe("Optional nudge that doesn't give the answer away."),
    }),
  ),
});

export async function generateCards({ label, parts, count }) {
  const { data } = await generateJSON({
    system: [
      "You write excellent spaced-repetition flashcards following the minimum-information principle.",
      "- One atomic fact or idea per card; prefer 'why/how' prompts over pure definitions where useful.",
      "- Fronts must be answerable without seeing other cards. No yes/no questions.",
      "- Backs are short and precise. Use $...$ for math.",
      parts.length ? "- Use only information supported by the provided source." : "- Use accurate, widely accepted knowledge.",
    ].join("\n"),
    parts,
    prompt: `Create ${count} flashcards ${parts.length ? `from the source above (topic: "${label}")` : `about "${label}"`}, covering the most important ideas first.`,
    schema: cardsSchema,
    temperature: 0.5,
  });
  return { title: data.title, cards: data.cards.slice(0, count).filter((c) => c.front?.trim() && c.back?.trim()) };
}

deckRouter.post("/generate", aiLimiter, uploader("readable", 1).single("file"), async (req, res) => {
  const input = parse(
    z.object({
      source: z.enum(["topic", "text", "material", "file"]).default("topic"),
      topic: zOptText(200),
      text: zOptText(200_000),
      materialId: zObjectId.optional(),
      count: z.coerce.number().int().min(4).max(60).default(15),
      title: zOptText(120),
      deckId: zObjectId.optional(),
    }),
    req.body,
  );
  const src = await resolveSource(input, req.user, req.file);
  const { title, cards } = await generateCards({ label: src.label, parts: src.parts, count: input.count });

  const deck = input.deckId
    ? await ownDeck(input.deckId, req.user)
    : await prisma.deck.create({ data: { ownerId: req.user.id, title: input.title || title, subject: src.label.slice(0, 80) } });

  await prisma.card.createMany({
    data: cards.map((c) => ({ deckId: deck.id, ownerId: req.user.id, front: c.front, back: c.back, hint: c.hint || null })),
  });
  res.status(201).json({ deck, added: cards.length });
});

// ---- decks ------------------------------------------------------------------

deckRouter.get("/", async (req, res) => {
  const decks = await prisma.deck.findMany({
    where: { ownerId: req.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });
  const due = await prisma.card.groupBy({
    by: ["deckId"],
    where: { ownerId: req.user.id, due: { lte: new Date() } },
    _count: { _all: true },
  });
  const dueBy = new Map(due.map((d) => [d.deckId, d._count._all]));
  res.json({ decks: decks.map((d) => ({ ...d, due: dueBy.get(d.id) ?? 0 })) });
});

deckRouter.post("/", async (req, res) => {
  const data = parse(z.object({ title: z.string().trim().min(1).max(120), description: zOptText(1000), subject: zOptText(80) }), req.body);
  const deck = await prisma.deck.create({ data: { ...data, ownerId: req.user.id } });
  res.status(201).json({ deck });
});

deckRouter.get("/:id", async (req, res) => {
  const deck = await ownDeck(req.params.id, req.user);
  const cards = await prisma.card.findMany({ where: { deckId: deck.id }, orderBy: { createdAt: "asc" }, take: 1000 });
  const now = new Date();
  res.json({
    deck,
    cards,
    stats: {
      total: cards.length,
      due: cards.filter((c) => c.due <= now).length,
      new: cards.filter((c) => c.state === 0).length,
      mature: cards.filter((c) => c.state === 2 && c.scheduledDays >= 21).length,
    },
  });
});

deckRouter.patch("/:id", async (req, res) => {
  await ownDeck(req.params.id, req.user);
  const data = parse(z.object({ title: z.string().trim().min(1).max(120).optional(), description: zNullableText(1000), subject: zNullableText(80) }), req.body);
  const deck = await prisma.deck.update({ where: { id: req.params.id }, data });
  res.json({ deck });
});

deckRouter.delete("/:id", async (req, res) => {
  await ownDeck(req.params.id, req.user);
  await prisma.deck.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

deckRouter.post("/:id/cards", async (req, res) => {
  const deck = await ownDeck(req.params.id, req.user);
  const { cards } = parse(z.object({ cards: z.array(cardInput).min(1).max(200) }), req.body);
  await prisma.card.createMany({ data: cards.map((c) => ({ ...c, deckId: deck.id, ownerId: req.user.id })) });
  await prisma.deck.update({ where: { id: deck.id }, data: { updatedAt: new Date() } });
  res.status(201).json({ added: cards.length });
});

// ---- cards ------------------------------------------------------------------

cardRouter.patch("/:id", async (req, res) => {
  await ownCard(req.params.id, req.user);
  const data = parse(cardInput.partial().extend({ hint: zNullableText(500) }), req.body);
  const card = await prisma.card.update({ where: { id: req.params.id }, data });
  res.json({ card });
});

cardRouter.delete("/:id", async (req, res) => {
  await ownCard(req.params.id, req.user);
  await prisma.card.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

cardRouter.post("/:id/review", async (req, res) => {
  const card = await ownCard(req.params.id, req.user);
  const { rating } = parse(z.object({ rating: z.number().int().min(1).max(4) }), req.body);
  const next = reviewCard(card, rating);
  const updated = await prisma.card.update({ where: { id: card.id }, data: next });
  const reward = await awardXp(req.user.id, "review", XP.review, { tz: req.tz, aggregate: true });
  res.json({ card: updated, reward });
});

cardRouter.post("/:id/reset", async (req, res) => {
  await ownCard(req.params.id, req.user);
  const card = await prisma.card.update({
    where: { id: req.params.id },
    data: { due: new Date(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null },
  });
  res.json({ card });
});

// ---- review queue -------------------------------------------------------------

reviewRouter.get("/queue", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const now = new Date();
  const where = { ownerId: req.user.id, due: { lte: now }, ...(req.query.deckId ? { deckId: String(req.query.deckId) } : {}) };
  const [cards, total] = await Promise.all([
    prisma.card.findMany({ where, orderBy: { due: "asc" }, take: limit, include: { deck: { select: { id: true, title: true } } } }),
    prisma.card.count({ where }),
  ]);
  res.json({
    total,
    cards: cards.map((c) => ({ ...c, intervals: previewIntervals(c, now) })),
  });
});

reviewRouter.get("/forecast", async (req, res) => {
  // Cards coming due over the next 14 days, for planning.
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);
  const cards = await prisma.card.findMany({
    where: { ownerId: req.user.id, due: { lte: horizon } },
    select: { due: true },
  });
  const buckets = Array.from({ length: 15 }, (_, i) => ({ inDays: i, count: 0 }));
  for (const c of cards) {
    const d = Math.max(0, Math.ceil((c.due.getTime() - now.getTime()) / 86_400_000));
    buckets[Math.min(d, 14)].count += 1;
  }
  res.json({ forecast: buckets });
});

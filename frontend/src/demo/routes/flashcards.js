// Port of backend/src/modules/flashcards.js (deckRouter /decks, cardRouter /cards, reviewRouter /review).
import { awardXp, badRequest, by, byId, DAY, db, findOr404, forbidden, insert, isObjectId, nullableText, remove, update, XP } from "../core.js";
import { generateCards, resolveSource, think } from "../ai.js";
import { previewIntervals, reviewCard } from "../srs.js";
import { route } from "../router.js";

// ---------------------------------------------------------------------------
// Validation (mirrors the zod schemas; messages follow formatZodError: "path: message")
// ---------------------------------------------------------------------------

const fail = (path, message) => badRequest(path ? `${path}: ${message}` : message);

/** Required trimmed string; `emptyMsg` replaces zod's min(1) message when the schema sets one. */
function str(v, path, max, emptyMsg = "String must contain at least 1 character(s)") {
  if (typeof v !== "string") throw fail(path, v === undefined ? "Required" : `Expected string, received ${v === null ? "null" : typeof v}`);
  const s = v.trim();
  if (!s) throw fail(path, emptyMsg);
  if (s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}

/** zOptText: "" means not provided. */
function optStr(v, path, max) {
  if (v === undefined || (typeof v === "string" && !v.trim())) return undefined;
  if (typeof v !== "string") throw fail(path, `Expected string, received ${v === null ? "null" : typeof v}`);
  const s = v.trim();
  if (s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}

/** zNullableText: "" or null clears, undefined leaves alone. */
function clearable(v, path, max) {
  if (v !== undefined && v !== null && typeof v !== "string") throw fail(path, `Expected string, received ${typeof v}`);
  const s = nullableText(v);
  if (typeof s === "string" && s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}

function int(v, path, { min, max, fallback, coerce = false }) {
  if (v === undefined || (coerce && v === "")) return fallback;
  const n = coerce ? Number(v) : v;
  if (typeof n !== "number" || Number.isNaN(n)) throw fail(path, `Expected number, received ${v === null ? "null" : typeof v}`);
  if (!Number.isInteger(n)) throw fail(path, "Expected integer, received float");
  if (n < min) throw fail(path, `Number must be greater than or equal to ${min}`);
  if (n > max) throw fail(path, `Number must be less than or equal to ${max}`);
  return n;
}

/** Drop undefined keys so insert()/update() behave like Prisma (undefined = leave alone / use default). */
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const cardInput = (c, path) => {
  if (!c || typeof c !== "object") throw fail(path, "Expected object");
  return defined({
    front: str(c.front, `${path}.front`, 2000, "Card front is empty"),
    back: str(c.back, `${path}.back`, 4000, "Card back is empty"),
    hint: optStr(c.hint, `${path}.hint`, 500),
  });
};

function ownDeck(id, user) {
  const deck = findOr404("decks", id, "Deck");
  if (deck.ownerId !== user.id) throw forbidden();
  return deck;
}

function ownCard(id, user) {
  const card = findOr404("cards", id, "Card");
  if (card.ownerId !== user.id) throw forbidden();
  return card;
}

const isDue = (c, now) => new Date(c.due).getTime() <= now.getTime();

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

route("POST", "/decks/generate", async (req) => {
  const b = req.body ?? {};
  const source = b.source === undefined ? "topic" : b.source;
  if (!["topic", "text", "material", "file"].includes(source)) throw fail("source", `Invalid enum value. Expected 'topic' | 'text' | 'material' | 'file', received '${source}'`);
  if (b.materialId !== undefined && !isObjectId(b.materialId)) throw fail("materialId", "Invalid id");
  if (b.deckId !== undefined && !isObjectId(b.deckId)) throw fail("deckId", "Invalid id");
  const input = {
    source,
    topic: optStr(b.topic, "topic", 200),
    text: optStr(b.text, "text", 200_000),
    materialId: b.materialId,
    count: int(b.count, "count", { min: 4, max: 60, fallback: 15, coerce: true }),
    title: optStr(b.title, "title", 120),
    deckId: b.deckId,
  };
  const src = await resolveSource(input, req.user, req.files?.file?.[0]);
  await think();
  const { title, cards } = generateCards({ label: src.label, text: src.sourceText, count: input.count });
  const usable = cards.slice(0, input.count).filter((c) => c.front?.trim() && c.back?.trim());

  const deck = input.deckId ? ownDeck(input.deckId, req.user) : insert("decks", { ownerId: req.user.id, title: input.title || title, subject: src.label.slice(0, 80) });
  for (const c of usable) insert("cards", { deckId: deck.id, ownerId: req.user.id, front: c.front, back: c.back, hint: c.hint || null });
  return { deck, added: usable.length };
});

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

route("GET", "/decks", (req) => {
  const now = new Date();
  const decks = db.decks.filter((d) => d.ownerId === req.user.id).sort(by("updatedAt", "desc"));
  const dueBy = new Map();
  const countBy = new Map();
  for (const c of db.cards) {
    countBy.set(c.deckId, (countBy.get(c.deckId) ?? 0) + 1);
    if (c.ownerId === req.user.id && isDue(c, now)) dueBy.set(c.deckId, (dueBy.get(c.deckId) ?? 0) + 1);
  }
  return { decks: decks.map((d) => ({ ...d, _count: { cards: countBy.get(d.id) ?? 0 }, due: dueBy.get(d.id) ?? 0 })) };
});

route("POST", "/decks", (req) => {
  const b = req.body ?? {};
  const data = defined({ title: str(b.title, "title", 120), description: optStr(b.description, "description", 1000), subject: optStr(b.subject, "subject", 80) });
  const deck = insert("decks", { ...data, ownerId: req.user.id });
  return { deck };
});

route("GET", "/decks/:id", (req) => {
  const deck = ownDeck(req.params.id, req.user);
  const cards = db.cards.filter((c) => c.deckId === deck.id).sort(by("createdAt")).slice(0, 1000);
  const now = new Date();
  return {
    deck,
    cards,
    stats: {
      total: cards.length,
      due: cards.filter((c) => isDue(c, now)).length,
      new: cards.filter((c) => c.state === 0).length,
      mature: cards.filter((c) => c.state === 2 && c.scheduledDays >= 21).length,
    },
  };
});

route("PATCH", "/decks/:id", (req) => {
  const deck = ownDeck(req.params.id, req.user);
  const b = req.body ?? {};
  const data = defined({
    title: b.title === undefined ? undefined : str(b.title, "title", 120),
    description: clearable(b.description, "description", 1000),
    subject: clearable(b.subject, "subject", 80),
  });
  return { deck: update("decks", deck, data) };
});

route("DELETE", "/decks/:id", (req) => {
  const deck = ownDeck(req.params.id, req.user);
  remove("cards", (c) => c.deckId === deck.id);
  remove("decks", (d) => d.id === deck.id);
  return { ok: true };
});

route("POST", "/decks/:id/cards", (req) => {
  const deck = ownDeck(req.params.id, req.user);
  const list = req.body?.cards;
  if (!Array.isArray(list)) throw fail("cards", list === undefined ? "Required" : "Expected array");
  if (list.length < 1) throw fail("cards", "Array must contain at least 1 element(s)");
  if (list.length > 200) throw fail("cards", "Array must contain at most 200 element(s)");
  const cards = list.map((c, i) => cardInput(c, `cards.${i}`));
  for (const c of cards) insert("cards", { ...c, deckId: deck.id, ownerId: req.user.id });
  update("decks", deck, {});
  return { added: cards.length };
});

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

route("PATCH", "/cards/:id", (req) => {
  const card = ownCard(req.params.id, req.user);
  const b = req.body ?? {};
  const data = defined({
    front: b.front === undefined ? undefined : str(b.front, "front", 2000, "Card front is empty"),
    back: b.back === undefined ? undefined : str(b.back, "back", 4000, "Card back is empty"),
    hint: clearable(b.hint, "hint", 500),
  });
  return { card: update("cards", card, data) };
});

route("DELETE", "/cards/:id", (req) => {
  const card = ownCard(req.params.id, req.user);
  remove("cards", (c) => c.id === card.id);
  return { ok: true };
});

route("POST", "/cards/:id/review", (req) => {
  const card = ownCard(req.params.id, req.user);
  const rating = int(req.body?.rating, "rating", { min: 1, max: 4 });
  if (rating === undefined) throw fail("rating", "Required");
  const updated = update("cards", card, reviewCard(card, rating));
  const reward = awardXp(req.user.id, "review", XP.review, { tz: req.tz, aggregate: true });
  return { card: updated, reward };
});

route("POST", "/cards/:id/reset", (req) => {
  const card = ownCard(req.params.id, req.user);
  update("cards", card, { due: new Date(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null });
  return { card };
});

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

route("GET", "/review/queue", (req) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const now = new Date();
  const deckId = req.query.deckId ? String(req.query.deckId) : null;
  const matching = db.cards.filter((c) => c.ownerId === req.user.id && isDue(c, now) && (!deckId || c.deckId === deckId)).sort(by((c) => new Date(c.due).getTime()));
  return {
    total: matching.length,
    cards: matching.slice(0, limit).map((c) => {
      const deck = byId("decks", c.deckId);
      return { ...c, deck: deck ? { id: deck.id, title: deck.title } : null, intervals: previewIntervals(c, now) };
    }),
  };
});

route("GET", "/review/forecast", (req) => {
  // Cards coming due over the next 14 days, for planning.
  const now = new Date();
  const horizon = now.getTime() + 14 * DAY;
  const buckets = Array.from({ length: 15 }, (_, i) => ({ inDays: i, count: 0 }));
  for (const c of db.cards) {
    if (c.ownerId !== req.user.id) continue;
    const due = new Date(c.due).getTime();
    if (due > horizon) continue;
    const d = Math.max(0, Math.ceil((due - now.getTime()) / DAY));
    buckets[Math.min(d, 14)].count += 1;
  }
  return { forecast: buckets };
});

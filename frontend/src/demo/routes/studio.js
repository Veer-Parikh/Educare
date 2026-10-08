// Port of backend/src/modules/studio.js.
import { awardXp, badRequest, by, db, findOr404, forbidden, insert, isObjectId, remove, XP } from "../core.js";
import { route } from "../router.js";
import { generateCards, generateQuestions, generateStudyGuide, resolveSource, think } from "../ai.js";

const SOURCES = ["topic", "text", "material", "file"];

// ---- validation (mirrors createSchema) -------------------------------------------

const fail = (path, message) => badRequest(`${path}: ${message}`, [{ path, message }]);

function optText(v, path, max) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw fail(path, "Invalid input: expected string");
  const s = v.trim();
  if (!s) return undefined;
  if (s.length > max) throw fail(path, `Too big: expected string to have <=${max} characters`);
  return s;
}

function boolField(v, path, fallback) {
  if (v === undefined) return fallback;
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  throw fail(path, "Invalid input: expected boolean");
}

function intField(v, path, min, max, fallback) {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw fail(path, "Invalid input: expected number, received NaN");
  if (!Number.isInteger(n)) throw fail(path, "Invalid input: expected int, received number");
  if (n < min) throw fail(path, `Too small: expected number to be >=${min}`);
  if (n > max) throw fail(path, `Too big: expected number to be <=${max}`);
  return n;
}

function parseCreate(b = {}) {
  if (!SOURCES.includes(b.source)) throw fail("source", `Invalid option: expected one of ${SOURCES.map((s) => `"${s}"`).join("|")}`);
  if (b.materialId !== undefined && !isObjectId(b.materialId)) throw fail("materialId", "Invalid id");
  return {
    source: b.source,
    topic: optText(b.topic, "topic", 200),
    text: optText(b.text, "text", 200_000),
    materialId: b.materialId,
    level: optText(b.level, "level", 60),
    makeDeck: boolField(b.makeDeck, "makeDeck", true),
    makeQuiz: boolField(b.makeQuiz, "makeQuiz", true),
    cardCount: intField(b.cardCount, "cardCount", 4, 40, 12),
    quizCount: intField(b.quizCount, "quizCount", 3, 20, 6),
  };
}

// ---- pack generation --------------------------------------------------------------

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const stripDot = (s) => s.replace(/[.\s]+$/, "");
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);

/** A short, specific pack title from a topic, file name or the first line of pasted notes. */
export function packTitle(label) {
  let t = label.replace(/[_]+/g, " ").replace(/(\w)-(\w)/g, "$1 $2").trim();
  t = t.split(/[.,;:!?(]|\s(?:says|is|are|was|were|means|describes)\s/i)[0].trim() || t;
  const words = t.split(/\s+/).slice(0, 7);
  return words
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Study pack in the backend packSchema shape ({ title, summarySections, keyPoints,
 * concepts, questionsToPonder }), built from the simulated study guide.
 */
export function buildPack({ label, text, level }) {
  const guide = generateStudyGuide({ label, text });
  const title = packTitle(label);
  const concepts = guide.concepts;
  const paras = guide.summary.split(/\n\n+/).filter(Boolean);
  const sections = paras[1]
    ? [
        { heading: "What the source says", body: paras[0] },
        { heading: "The wider context", body: paras[1] },
      ]
    : [{ heading: "The big picture", body: paras[0] }];
  if (concepts.length) {
    sections.push({
      heading: "Key ideas",
      body: concepts
        .slice(0, 3)
        .map((c) => `**${c.term}** — ${lowerFirst(stripDot(c.definition))}.`)
        .join(" "),
    });
  }
  if (concepts.length > 3) {
    const [a, b, ...rest] = concepts.slice(3);
    sections.push({
      heading: "Putting it together",
      body: [
        `Once those are secure, add **${a.term.toLowerCase()}** (${lowerFirst(stripDot(a.definition))})`,
        b ? ` and **${b.term.toLowerCase()}** (${lowerFirst(stripDot(b.definition))}).` : ".",
        rest.length ? ` Finally, connect everything to ${rest.map((c) => `**${c.term.toLowerCase()}**`).join(" and ")}.` : "",
        ` Test yourself by explaining each idea${level ? ` at a ${level} level` : ""} without looking at your notes, then check the glossary below.`,
      ].join(""),
    });
  }
  const keyPoints = [...guide.keyPoints];
  if (keyPoints.length < 6) {
    keyPoints.push(
      `Learn the key vocabulary of ${title} first — every later idea builds on it.`,
      `Retrieval practice (quizzing yourself) beats re-reading for remembering ${title}.`,
    );
  }
  return {
    title,
    summarySections: sections.slice(0, 4),
    keyPoints: keyPoints.slice(0, 10),
    concepts,
    questionsToPonder: guide.questionsToPonder,
  };
}

const summaryMarkdown = (sections) => sections.map((sec) => `### ${sec.heading.trim()}\n\n${sec.body.trim()}`).join("\n\n");

/** Create the deck + cards rows the backend makes for a pack. Returns the deck id or null. */
export function createPackDeck(userId, title, label, cards) {
  if (!cards?.length) return null;
  const deck = insert("decks", { ownerId: userId, title, subject: label.slice(0, 80) });
  for (const c of cards) insert("cards", { deckId: deck.id, ownerId: userId, front: c.front, back: c.back, hint: c.hint || null });
  return deck.id;
}

/** Create the check-up quiz row the backend makes for a pack. Returns the quiz id or null. */
export function createPackQuiz(userId, title, label, questions) {
  if (!questions?.length) return null;
  return insert("quizzes", { ownerId: userId, title: `${title} — check-up`, topic: label, source: "studio", questions }).id;
}

const presentSet = (set) => {
  const { sourceText, ...rest } = set;
  return { ...rest, hasSource: Boolean(sourceText) };
};

// ---- routes ---------------------------------------------------------------------------

route("POST", "/studio", async (req) => {
  const input = parseCreate(req.body);
  const file = req.files?.file?.[0];
  const src = await resolveSource(input, req.user, file);
  const text = src.sourceText ?? undefined;

  await think(1200, 2200);
  const data = buildPack({ label: src.label, text, level: input.level });
  const cards = input.makeDeck ? generateCards({ label: src.label, text, count: input.cardCount }) : null;
  const quiz = input.makeQuiz ? generateQuestions({ label: src.label, text, count: input.quizCount, types: ["mcq", "truefalse"] }) : null;

  const warnings = [];
  const deckId = cards ? createPackDeck(req.user.id, data.title, src.label, cards.cards) : null;
  if (input.makeDeck && !deckId) warnings.push("Flashcards couldn't be generated this time.");
  const quizId = quiz ? createPackQuiz(req.user.id, data.title, src.label, quiz.questions) : null;
  if (input.makeQuiz && !quizId) warnings.push("The quiz couldn't be generated this time.");

  const studySet = insert("studySets", {
    userId: req.user.id,
    title: data.title,
    sourceType: input.source,
    sourceName: file?.name ?? src.material?.title ?? (input.source === "topic" ? src.label : null),
    sourceText: src.sourceText?.slice(0, 200_000) ?? null,
    summary: summaryMarkdown(data.summarySections),
    keyPoints: data.keyPoints,
    concepts: data.concepts,
    questionsToPonder: data.questionsToPonder,
    deckId,
    quizId,
  });

  const reward = awardXp(req.user.id, "studio", XP.studio, { tz: req.tz, meta: { studySetId: studySet.id } });
  return { studySet: presentSet(studySet), warnings, reward };
});

route("GET", "/studio", (req) => {
  const studySets = db.studySets
    .filter((s) => s.userId === req.user.id)
    .sort(by("createdAt", "desc"))
    .slice(0, 100)
    .map((s) => ({ id: s.id, title: s.title, sourceType: s.sourceType, sourceName: s.sourceName ?? null, deckId: s.deckId ?? null, quizId: s.quizId ?? null, createdAt: s.createdAt }));
  return { studySets };
});

route("GET", "/studio/:id", (req) => {
  const set = findOr404("studySets", req.params.id, "Study set");
  if (set.userId !== req.user.id) throw forbidden();
  const deckRow = set.deckId ? db.decks.find((d) => d.id === set.deckId) : null;
  const quizRow = set.quizId ? db.quizzes.find((q) => q.id === set.quizId) : null;
  const deck = deckRow ? { ...deckRow, _count: { cards: db.cards.filter((c) => c.deckId === deckRow.id).length } } : null;
  return {
    studySet: presentSet(set),
    deck,
    quiz: quizRow ? { id: quizRow.id, title: quizRow.title, questionCount: quizRow.questions.length } : null,
  };
});

route("DELETE", "/studio/:id", (req) => {
  const set = findOr404("studySets", req.params.id, "Study set");
  if (set.userId !== req.user.id) throw forbidden();
  remove("studySets", (s) => s.id === set.id);
  return { ok: true };
});

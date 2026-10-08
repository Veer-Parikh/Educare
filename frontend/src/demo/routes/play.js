// Port of backend/src/modules/play.js.
//
// The backend asks the model for a quick quiz built from a world's key facts and
// for one-line lines from "Nova", the space guide. Demo mode builds both from the
// facts the game sends plus a small built-in fact bank.
import { badRequest, shortId } from "../core.js";
import { generateQuestions, think } from "../ai.js";
import { route } from "../router.js";

const fail = (path, message) => badRequest(`${path}: ${message}`);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const withPeriod = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One signature trait per world (true for that world only), used for "which world" and "which is true" questions.
const SIGNATURES = {
  Sun: "makes up about 99.86% of the Solar System's mass",
  Mercury: "is the smallest planet in the Solar System",
  Venus: "is the hottest planet in the Solar System",
  Earth: "is the only known world with liquid water on its surface",
  Mars: "is called the Red Planet because of iron oxide dust",
  Jupiter: "is the largest planet in the Solar System",
  Saturn: "has the most spectacular ring system and would float in water",
  Uranus: "rotates on its side, tilted about 98 degrees",
  Neptune: "has the fastest winds in the Solar System",
};
const WORLDS = Object.keys(SIGNATURES);
const PLANETS = WORLDS.filter((w) => w !== "Sun");

// Extra facts for Nova's guide lines (short, accurate, under 200 characters).
const NOVA_FACTS = {
  Sun: ["Sunlight leaving the Sun right now will reach Earth in about 8 minutes and 20 seconds.", "The Sun's core reaches about 15 million °C — hot enough to fuse hydrogen into helium."],
  Mercury: ["Mercury swings from about 430 °C by day to −180 °C at night, because it has almost no air to hold heat.", "Mercury has ice hiding in permanently shadowed craters near its poles."],
  Venus: ["Venus spins backwards, so on Venus the Sun rises in the west.", "Venus is hotter than Mercury because its thick CO₂ atmosphere traps heat."],
  Earth: ["Earth is the densest planet in the Solar System.", "Earth's magnetic field deflects the solar wind and creates the auroras."],
  Mars: ["Olympus Mons on Mars is about 22 km tall — nearly three times the height of Everest.", "A sunset on Mars glows blue, because fine dust scatters red light away."],
  Jupiter: ["Jupiter's Great Red Spot is a storm wider than Earth that has raged for centuries.", "Jupiter spins once every 10 hours, the shortest day of any planet."],
  Saturn: ["Saturn's rings are hundreds of thousands of km wide but mostly only about 10 m thick.", "Saturn is less dense than water — in a big enough bathtub it would float."],
  Uranus: ["Uranus is tipped on its side, so each pole gets about 42 years of sunlight, then 42 years of darkness.", "Methane in Uranus's atmosphere absorbs red light, giving it a blue-green glow."],
  Neptune: ["Neptune's winds reach about 2,100 km/h — the fastest in the Solar System.", "Neptune was found by maths: its position was predicted before anyone saw it."],
};

function mcq(prompt, correct, wrong, explanation, concept) {
  const options = shuffle([correct, ...wrong.slice(0, 3)]);
  return { id: shortId(), type: "mcq", prompt, options, answerIndex: options.indexOf(correct), answerText: null, explanation, concept, difficulty: "medium", points: 1 };
}

/** "It has at least 79 moons" -> numeric variants for distractors. */
function numberVariants(value, percent = false) {
  const n = Number(value.replace(/,/g, ""));
  const decimals = (value.split(".")[1] ?? "").length;
  const fmt = (x) => (decimals ? x.toFixed(decimals) : Math.round(x).toLocaleString("en-US"));
  const raw = [n * 2, n / 2, n * 10, n / 10, n + Math.max(1, Math.round(n * 0.3)), n * 3];
  return [...new Set(raw.filter((x) => x > 0 && (!percent || x < 100)).map(fmt))].filter((v) => v !== value && v !== fmt(n));
}

/** Questions built from the facts the game sent, in the backend QuizQuestion shape. */
function factQuestions(topic, facts, count) {
  const name = WORLDS.find((w) => w.toLowerCase() === topic.trim().toLowerCase()) ?? topic.trim();
  const others = shuffle((name === "Sun" ? PLANETS : PLANETS.filter((p) => p !== name)));
  const subject = name === "Sun" ? "The Sun" : name;
  const nameRe = name === "Sun" ? /\b(The |the )?Sun('s)?\b/g : new RegExp(`\\b${escapeRe(name)}('s)?\\b`, "g");
  const qs = [];

  // 1) "Which world is this?" from a fact that names it.
  const named = shuffle(facts.filter((f) => new RegExp(nameRe.source).test(f) && !/moons/i.test(f)));
  if (named.length && name !== "Sun") {
    const fact = named[0];
    const masked = fact.replace(nameRe, (m) => (m.endsWith("'s") ? "___'s" : "___"));
    qs.push(mcq(`Which world is this? “${withPeriod(masked)}”`, name, others, `It's ${name}: ${withPeriod(fact)}`, name));
  }

  // 2) Fill in a number from a numeric fact.
  for (const fact of shuffle(facts).map((f) => f.replace(/^It\b/, subject))) {
    const m = fact.match(/\d[\d,]*(\.\d+)?/);
    if (!m) continue;
    const wrong = shuffle(numberVariants(m[0], fact[m.index + m[0].length] === "%")).slice(0, 3);
    if (wrong.length < 3) continue;
    qs.push(mcq(`Fill in the blank about ${name === "Sun" ? "the Sun" : name}: “${withPeriod(fact.replace(m[0], "___"))}”`, m[0], wrong, withPeriod(fact), name));
    break;
  }

  // 3) "Which is true?" — the true fact vs other worlds' signature traits.
  if (facts.length) {
    const truth = withPeriod(pick(facts).replace(/^It\b/, subject));
    const wrong = shuffle(WORLDS.filter((w) => w !== name)).slice(0, 3).map((w) => `${subject} ${SIGNATURES[w]}.`);
    qs.push(mcq(`Which statement about ${name === "Sun" ? "the Sun" : name} is true?`, truth, wrong, `${truth} The other statements describe different worlds.`, name));
  }

  // 4) Signature trait -> world.
  if (SIGNATURES[name]) {
    const wrong = shuffle(WORLDS.filter((w) => w !== name)).slice(0, 3);
    qs.push(mcq(`Which world ${SIGNATURES[name]}?`, name, wrong, `${subject} ${SIGNATURES[name]}.`, name));
  }

  return shuffle(qs).slice(0, count);
}

route("POST", "/play/quick-quiz", async (req) => {
  const b = req.body ?? {};
  if (typeof b.topic !== "string") throw fail("topic", b.topic === undefined ? "Required" : "Expected string");
  const topic = b.topic.trim();
  if (topic.length < 2) throw fail("topic", "String must contain at least 2 character(s)");
  if (topic.length > 120) throw fail("topic", "String must contain at most 120 character(s)");
  let facts;
  if (b.facts !== undefined) {
    if (!Array.isArray(b.facts)) throw fail("facts", "Expected array");
    if (b.facts.length > 12) throw fail("facts", "Array must contain at most 12 element(s)");
    b.facts.forEach((f, i) => {
      if (typeof f !== "string") throw fail(`facts.${i}`, "Expected string");
      if (f.length > 400) throw fail(`facts.${i}`, "String must contain at most 400 character(s)");
    });
    facts = b.facts;
  }
  const count = b.count === undefined || b.count === "" ? 3 : Number(b.count);
  if (!Number.isInteger(count)) throw fail("count", Number.isNaN(count) ? "Expected number, received nan" : "Expected integer, received float");
  if (count < 2) throw fail("count", "Number must be greater than or equal to 2");
  if (count > 6) throw fail("count", "Number must be less than or equal to 6");

  await think(500, 1100);
  let questions = facts?.length || SIGNATURES[topic] ? factQuestions(topic, facts ?? [], count) : [];
  if (questions.length < count) {
    const extra = generateQuestions({ label: topic, text: facts?.join(". "), count: count - questions.length, difficulty: "mixed", types: ["mcq"] }).questions;
    questions = [...questions, ...extra.map((q) => ({ ...q, points: 1 }))];
  }
  return { questions: questions.slice(0, count) };
});

const GUIDE = {
  intro: () =>
    pick([
      "Welcome aboard, explorer! Eight planets and one star await — tap any world to fly there and uncover its secrets.",
      "Engines warm, explorer! Our Sun and its planets are ready for you. Pick a world and let's go see it up close.",
      "Hello, explorer — I'm Nova, your guide. The Solar System is 4.6 billion years old; let's discover it together.",
    ]),
  planet: (t) => {
    const facts = NOVA_FACTS[t];
    return facts ? `Did you know? ${pick(facts)}` : `${t || "This world"} has secrets of its own — read its facts, then test yourself with a quick quiz.`;
  },
  mission: (t) =>
    pick([
      `Mission briefing: head to ${t}. ${SIGNATURES[t] ? `Look closely — this world ${SIGNATURES[t]}.` : "Study its key facts on the way."}`,
      `New mission: explore ${t}! Read its facts carefully — the quiz at the end will check what you spotted.`,
      `Course set for ${t}. ${NOVA_FACTS[t] ? `Watch for this: ${NOVA_FACTS[t][1]}` : "Keep your eyes open for anything surprising."}`,
    ]),
  complete: (t) =>
    pick([
      `Mission to ${t || "that planet"} complete — brilliant flying! Ready to chart a course to another world?`,
      `Well done, explorer! ${t || "That world"} is in your log. Which planet will you visit next?`,
      `Superb work at ${t || "your target"}! Your explorer log is growing — pick another world to keep going.`,
    ]),
};

route("POST", "/play/guide", async (req) => {
  const b = req.body ?? {};
  const kinds = Object.keys(GUIDE);
  if (!kinds.includes(b.kind)) throw fail("kind", b.kind === undefined ? "Required" : `Invalid enum value. Expected ${kinds.map((k) => `'${k}'`).join(" | ")}, received '${b.kind}'`);
  let target;
  if (b.target !== undefined) {
    if (typeof b.target !== "string") throw fail("target", "Expected string");
    target = b.target.trim();
    if (target.length > 60) throw fail("target", "String must contain at most 60 character(s)");
  }
  await think(300, 700);
  return { text: GUIDE[b.kind](target).slice(0, 220) };
});

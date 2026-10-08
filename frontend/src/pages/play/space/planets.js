// Solar System Explorer — bodies, facts and offline fallbacks.
// Sizes/orbits are game units (not to scale); facts and stats are real.

export const BODIES = [
  {
    id: "sun",
    name: "Sun",
    kind: "Star",
    radius: 5,
    orbitRadius: 0,
    rotationSpeed: 0.001,
    color: "#FDB813",
    surface: "sun",
    seed: 11,
    view: 24,
    facts: [
      "The Sun is a star at the center of our Solar System",
      "It is about 4.6 billion years old",
      "The Sun's diameter is about 1.39 million kilometers",
      "It makes up 99.86% of the Solar System's mass",
    ],
    stats: [
      { label: "Age", value: "4.6 billion years" },
      { label: "Diameter", value: "1.39 million km" },
      { label: "Surface", value: "≈ 5,500 °C" },
      { label: "Light to Earth", value: "≈ 8.3 minutes" },
    ],
  },
  {
    id: "mercury",
    name: "Mercury",
    kind: "Rocky planet",
    radius: 0.8,
    orbitRadius: 10,
    orbitSpeed: 0.008,
    rotationSpeed: 0.004,
    color: "#A5A5A5",
    surface: "rocky",
    palette: ["#8f8b86", "#a5a5a5", "#6e6a66", "#bdb8b1", "#7c7772"],
    craters: 90,
    seed: 23,
    view: 4.4,
    facts: [
      "Mercury is the smallest planet in our Solar System",
      "It has no atmosphere to retain heat",
      "A day on Mercury lasts 59 Earth days",
      "Mercury has a highly elliptical orbit",
    ],
    au: "0.39 AU",
    km: "58 million km",
    day: "59 Earth days",
    year: "88 Earth days",
    diameter: "4,879 km",
  },
  {
    id: "venus",
    name: "Venus",
    kind: "Rocky planet",
    radius: 1.2,
    orbitRadius: 15,
    orbitSpeed: 0.006,
    rotationSpeed: -0.002, // retrograde
    color: "#E6C229",
    surface: "bands",
    palette: ["#e8c77a", "#d9b25c", "#f1dca0", "#c89d4a", "#e3bf6a"],
    blur: 4,
    atmosphere: "#ffe2a0",
    seed: 37,
    view: 6,
    facts: [
      "Venus is the hottest planet in our Solar System",
      "It rotates in the opposite direction to most planets",
      "Venus has a thick atmosphere of carbon dioxide",
      "A day on Venus is longer than its year",
    ],
    au: "0.72 AU",
    km: "108 million km",
    day: "243 Earth days",
    year: "225 Earth days",
    diameter: "12,104 km",
  },
  {
    id: "earth",
    name: "Earth",
    kind: "Rocky planet",
    radius: 1.3,
    orbitRadius: 20,
    orbitSpeed: 0.005,
    rotationSpeed: 0.005,
    tilt: 0.41,
    color: "#4F97A3",
    surface: "earth",
    atmosphere: "#7cc4ff",
    seed: 41,
    view: 7,
    facts: [
      "Earth is the only known planet with liquid water on its surface",
      "It has one natural satellite - the Moon",
      "Earth's atmosphere is rich in nitrogen and oxygen",
      "It has a strong magnetic field that protects us from solar radiation",
    ],
    au: "1 AU",
    km: "150 million km",
    day: "24 hours",
    year: "365 days",
    diameter: "12,742 km",
  },
  {
    id: "mars",
    name: "Mars",
    kind: "Rocky planet",
    radius: 1.1,
    orbitRadius: 25,
    orbitSpeed: 0.004,
    rotationSpeed: 0.005,
    tilt: 0.44,
    color: "#E27B58",
    surface: "rocky",
    palette: ["#c1562f", "#e27b58", "#9c3f1f", "#d98e6c", "#b0492a"],
    craters: 30,
    polarCaps: true,
    seed: 53,
    view: 5.6,
    facts: [
      "Mars is known as the Red Planet due to iron oxide on its surface",
      "It has the largest volcano in the Solar System - Olympus Mons",
      "Mars has two small moons: Phobos and Deimos",
      "It experiences dust storms that can cover the entire planet",
    ],
    au: "1.52 AU",
    km: "228 million km",
    day: "24.6 hours",
    year: "687 Earth days",
    diameter: "6,779 km",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "Gas giant",
    radius: 3,
    orbitRadius: 35,
    orbitSpeed: 0.002,
    rotationSpeed: 0.01,
    color: "#C88B3A",
    surface: "bands",
    palette: ["#c88b3a", "#e6cfa6", "#a8703a", "#f2e4c8", "#b98a5a", "#d9b27c"],
    blur: 1.5,
    spot: { x: 0.32, y: 0.64, rx: 30, ry: 13, color: "#b4533a" },
    seed: 67,
    view: 13,
    facts: [
      "Jupiter is the largest planet in our Solar System",
      "It has a Great Red Spot - a giant storm that has lasted for centuries",
      "Jupiter has at least 79 moons",
      "It is primarily composed of hydrogen and helium",
    ],
    au: "5.2 AU",
    km: "778 million km",
    day: "9.9 hours",
    year: "11.9 Earth years",
    diameter: "139,820 km",
  },
  {
    id: "saturn",
    name: "Saturn",
    kind: "Gas giant",
    radius: 2.5,
    orbitRadius: 45,
    orbitSpeed: 0.0015,
    rotationSpeed: 0.009,
    tilt: 0.47,
    color: "#E4CD9E",
    surface: "bands",
    palette: ["#e4cd9e", "#d4b57a", "#f2e5c2", "#c7a468", "#dcc28e"],
    blur: 2,
    hasRings: true,
    seed: 79,
    view: 14,
    facts: [
      "Saturn is known for its spectacular ring system",
      "It has the lowest density of all planets - it would float in water",
      "Saturn has at least 82 moons",
      "Its rings are made mostly of ice particles with some rocky debris",
    ],
    au: "9.5 AU",
    km: "1.43 billion km",
    day: "10.7 hours",
    year: "29.4 Earth years",
    diameter: "116,460 km",
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "Ice giant",
    radius: 1.8,
    orbitRadius: 55,
    orbitSpeed: 0.001,
    rotationSpeed: 0.007,
    tilt: 1.71, // ~98°, it rolls on its side
    color: "#93C1C9",
    surface: "bands",
    palette: ["#93c1c9", "#a4ced5", "#88b7bf", "#9dc8cf"],
    blur: 3,
    atmosphere: "#b8f0ff",
    seed: 83,
    view: 8.5,
    facts: [
      "Uranus rotates on its side - its axis is tilted at about 98 degrees",
      "It appears blue-green due to methane in its atmosphere",
      "Uranus has at least 27 known moons",
      "It is the coldest planetary atmosphere in the Solar System",
    ],
    au: "19.2 AU",
    km: "2.87 billion km",
    day: "17.2 hours",
    year: "84 Earth years",
    diameter: "50,724 km",
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "Ice giant",
    radius: 1.7,
    orbitRadius: 65,
    orbitSpeed: 0.0008,
    rotationSpeed: 0.008,
    tilt: 0.49,
    color: "#3E66F9",
    surface: "bands",
    palette: ["#3e66f9", "#3657d8", "#5b7dfa", "#2f4cc0", "#4a70f5"],
    blur: 2.5,
    spot: { x: 0.6, y: 0.4, rx: 18, ry: 9, color: "#1f2f8a" },
    atmosphere: "#6f9bff",
    seed: 97,
    view: 8,
    facts: [
      "Neptune is the windiest planet with speeds up to 2,100 km/h",
      "It has at least 14 known moons",
      "Neptune takes 165 Earth years to orbit the Sun",
      "It has a Great Dark Spot similar to Jupiter's Great Red Spot",
    ],
    au: "30.1 AU",
    km: "4.5 billion km",
    day: "16.1 hours",
    year: "165 Earth years",
    diameter: "49,244 km",
  },
];

for (const b of BODIES) {
  if (b.id !== "sun") {
    b.stats = [
      { label: "Distance from Sun", value: `${b.km} · ${b.au}` },
      { label: "Diameter", value: b.diameter },
      { label: "One spin (day)", value: b.day },
      { label: "One orbit (year)", value: b.year },
    ];
  }
}

export const BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]));
export const PLANETS = BODIES.filter((b) => b.id !== "sun");

/** Deterministic spread of starting angles so planets don't line up. */
export const START_ANGLE = Object.fromEntries(BODIES.map((b, i) => [b.id, (i * 2.399963) % (Math.PI * 2)]));

/** A quiz is "passed" (for missions) at this share of correct answers. */
export const PASS_RATIO = 0.6;

// ---- helpers ----------------------------------------------------------------

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const withPeriod = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);

function mcq(id, prompt, correct, distractors, explanation) {
  const options = shuffle([correct, ...distractors.slice(0, 3)]);
  return { id, prompt, options, answerIndex: options.indexOf(correct), explanation };
}

/** Mask a body's name in one of its facts: "Mercury is the smallest…" -> "___ is the smallest…". */
function maskedFact(body) {
  const re = body.id === "sun" ? /\b(The |the )?Sun('s)?\b/ : new RegExp(`\\b${body.name}('s)?\\b`);
  const candidates = body.facts.filter((f) => re.test(f) && !/moons/i.test(f));
  if (!candidates.length) return null;
  const fact = pickOne(candidates);
  const masked = fact.replace(new RegExp(re.source, "g"), (match) => (match.endsWith("'s") ? "___'s" : "___"));
  return { fact, masked };
}

/**
 * Offline quiz built from the facts and stats, used when the AI call fails.
 * Every question has one unambiguous answer.
 */
export function localQuestions(body) {
  const others = shuffle(BODIES.filter((b) => b.id !== body.id));
  const qs = [];

  const m = maskedFact(body);
  if (m) {
    qs.push(
      mcq(
        "l-fact",
        `Which world is this? “${withPeriod(m.masked)}”`,
        body.name,
        others.filter((o) => o.id !== "sun").map((o) => o.name),
        `It's ${body.name}: ${withPeriod(m.fact)}`,
      ),
    );
  }

  if (body.id === "sun") {
    qs.push(
      mcq("l-age", "About how old is the Sun?", "4.6 billion years", ["46 million years", "460 billion years", "4,600 years"], "The Sun formed about 4.6 billion years ago from a collapsing cloud of gas and dust."),
      mcq("l-light", "How long does sunlight take to reach Earth?", "About 8 minutes", ["About 8 seconds", "About 8 hours", "About 8 days"], "Light crosses the ~150 million km to Earth in about 8 minutes and 20 seconds."),
    );
    return qs.slice(0, 3);
  }

  const planets = others.filter((o) => o.id !== "sun");
  qs.push(
    mcq(
      "l-year",
      `How long is one year on ${body.name}?`,
      body.year,
      planets.map((o) => o.year),
      `${body.name} takes ${body.year} to travel once around the Sun.`,
    ),
  );
  qs.push(
    Math.random() < 0.5
      ? mcq(
          "l-dist",
          `On average, how far is ${body.name} from the Sun?`,
          body.km,
          planets.map((o) => o.km),
          `${body.name} orbits about ${body.km} from the Sun (${body.au}; 1 AU is Earth's distance).`,
        )
      : mcq(
          "l-day",
          `How long does ${body.name} take to spin once on its axis?`,
          body.day,
          planets.map((o) => o.day),
          `One full spin of ${body.name} takes about ${body.day}.`,
        ),
  );
  return qs.slice(0, 3);
}

/** Nova's lines when the AI guide is unreachable. */
export function localGuide(kind, target) {
  const body = target ? BODIES.find((b) => b.name === target) : null;
  switch (kind) {
    case "planet":
      return body ? `Did you know? ${withPeriod(pickOne(body.facts))}` : "Pick any world to learn its secrets.";
    case "mission":
      return `Mission briefing: fly to ${target} and ace its quiz to earn your explorer badge. Tap Locate if you get lost!`;
    case "complete":
      return `Mission accomplished at ${target || "your target"}! Your explorer log is growing — ready for the next destination?`;
    default:
      return "Welcome aboard, explorer! Tap any planet to learn its secrets, then take a quick quiz to earn XP.";
  }
}

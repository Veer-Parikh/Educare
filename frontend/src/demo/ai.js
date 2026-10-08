// Simulated AI for demo mode. There is no model in the browser, so these helpers
// build plausible output from a small built-in topic bank, or straight from the
// learner's own text (cloze questions, key sentences). Shapes match backend/src/ai.

import { badRequest, byId, classAccess, fileText, isObjectId, notFound, shortId, sleep } from "./core.js";

/** Pause like a model call would (ms range). */
export const think = (min = 700, max = 1500) => sleep(min + Math.random() * (max - min));

const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const shuffleWithAnswer = (correct, wrong) => {
  const options = pick([correct, ...wrong.slice(0, 3)], 4);
  return { options, answerIndex: options.indexOf(correct) };
};

// ---------------------------------------------------------------------------
// Topic bank
// ---------------------------------------------------------------------------

const mcq = (prompt, correct, wrong, concept, explanation) => ({ type: "mcq", prompt, correct, wrong, concept, explanation });
const tf = (prompt, answer, concept, explanation) => ({ type: "truefalse", prompt, answer, concept, explanation });
const short = (prompt, answerText, concept, explanation) => ({ type: "short", prompt, answerText, concept, explanation });

const BANK = [
  {
    keys: ["kinematic", "motion", "projectile", "velocity", "accelerat", "physics", "newton", "force", "free fall", "mechanic"],
    subject: "Physics",
    title: "Kinematics",
    summary:
      "Kinematics describes how objects move without asking why. Position, displacement, velocity and acceleration are linked by a small set of equations that hold whenever acceleration is constant. Projectile motion is two independent motions at once: constant velocity horizontally and constant acceleration (gravity) vertically.",
    concepts: [
      ["Displacement", "Change in position, a vector with magnitude and direction."],
      ["Velocity", "Rate of change of displacement, v = Δx/Δt."],
      ["Acceleration", "Rate of change of velocity, a = Δv/Δt."],
      ["Free fall", "Motion under gravity alone; a ≈ 9.8 m/s² downward near Earth."],
      ["Projectile motion", "Horizontal motion at constant velocity combined with vertical free fall."],
      ["Range", "Horizontal distance a projectile travels: R = u² sin 2θ / g on level ground."],
    ],
    questions: [
      mcq("Which quantity is a vector?", "Displacement", ["Speed", "Distance", "Time"], "Vectors vs scalars", "Displacement has both magnitude and direction."),
      mcq("A ball is dropped from rest. Its speed after 2 s is about:", "19.6 m/s", ["9.8 m/s", "4.9 m/s", "39.2 m/s"], "Free fall", "v = gt = 9.8 × 2 ≈ 19.6 m/s."),
      mcq("Maximum range on level ground occurs at a launch angle of:", "45°", ["30°", "60°", "90°"], "Projectile motion", "sin 2θ is largest when θ = 45°."),
      mcq("Which equation does not involve time?", "v² = u² + 2as", ["v = u + at", "s = ut + ½at²", "s = vt − ½at²"], "Equations of motion", "v² = u² + 2as links velocities and displacement directly."),
      mcq("The slope of a velocity–time graph gives:", "Acceleration", ["Displacement", "Speed", "Jerk"], "Motion graphs", "a = Δv/Δt, which is the gradient of a v–t graph."),
      mcq("The area under a velocity–time graph gives:", "Displacement", ["Acceleration", "Force", "Average speed"], "Motion graphs", "Area = velocity × time = displacement."),
      mcq("A car goes from 10 m/s to 30 m/s in 4 s. Its acceleration is:", "5 m/s²", ["2.5 m/s²", "10 m/s²", "20 m/s²"], "Acceleration", "a = (30 − 10) / 4 = 5 m/s²."),
      mcq("In projectile motion (no air resistance), the horizontal velocity:", "Stays constant", ["Increases steadily", "Decreases to zero at the top", "Equals the vertical velocity"], "Projectile motion", "No horizontal force acts, so horizontal velocity doesn't change."),
      tf("At the top of its flight, a projectile's acceleration is zero.", false, "Projectile motion", "Gravity still acts: acceleration is g downward throughout."),
      tf("Two objects dropped together from the same height land together if air resistance is ignored.", true, "Free fall", "All objects fall with the same acceleration g."),
      tf("Speed and velocity are always equal in magnitude for any journey.", false, "Vectors vs scalars", "Average speed uses distance; average velocity uses displacement."),
      short("State the equation linking final velocity, initial velocity, acceleration and time.", "v = u + at", "Equations of motion", "From the definition of acceleration, a = (v − u)/t."),
      short("What is the acceleration of an object in free fall near Earth's surface?", "About 9.8 m/s² downward", "Free fall", "Denoted g; it points towards Earth's centre."),
    ],
  },
  {
    keys: ["chem", "atom", "periodic", "bond", "molecule", "reaction", "acid", "base", "electron", "mole", "stoichiometr"],
    subject: "Chemistry",
    title: "Atoms and bonding",
    summary:
      "Matter is built from atoms: a dense nucleus of protons and neutrons surrounded by electrons. The arrangement of outer (valence) electrons decides how elements bond. Ionic bonds transfer electrons between metals and non-metals; covalent bonds share electrons between non-metals. The periodic table orders elements by atomic number so that families with similar valence electrons line up in groups.",
    concepts: [
      ["Atomic number", "Number of protons in the nucleus; defines the element."],
      ["Isotope", "Atoms of the same element with different numbers of neutrons."],
      ["Valence electrons", "Outer-shell electrons that take part in bonding."],
      ["Ionic bond", "Electrostatic attraction between oppositely charged ions formed by electron transfer."],
      ["Covalent bond", "A shared pair of electrons between two atoms."],
      ["Mole", "6.022 × 10²³ particles of a substance (Avogadro's number)."],
    ],
    questions: [
      mcq("What determines which element an atom is?", "Number of protons", ["Number of neutrons", "Number of electrons", "Mass number"], "Atomic number", "The proton count (atomic number) defines the element."),
      mcq("Sodium chloride is held together by:", "Ionic bonds", ["Covalent bonds", "Metallic bonds", "Hydrogen bonds"], "Ionic bond", "Na gives an electron to Cl, forming Na⁺ and Cl⁻."),
      mcq("How many particles are in one mole?", "6.022 × 10²³", ["6.022 × 10²²", "3.14 × 10²³", "1 × 10²⁴"], "Mole", "That's Avogadro's number."),
      mcq("Elements in the same group of the periodic table share the same:", "Number of valence electrons", ["Atomic mass", "Number of neutrons", "Number of shells"], "Periodic table", "Similar outer electrons give similar chemistry."),
      mcq("A water molecule contains which type of bond?", "Polar covalent", ["Ionic", "Metallic", "Non-polar covalent"], "Covalent bond", "O and H share electrons unequally."),
      mcq("pH 3 is:", "Acidic", ["Neutral", "Basic", "Impossible"], "Acids and bases", "pH below 7 is acidic."),
      mcq("Isotopes of an element differ in their number of:", "Neutrons", ["Protons", "Electrons", "Valence shells"], "Isotope", "Same protons, different neutrons."),
      mcq("The noble gases are unreactive because they:", "Have full outer electron shells", ["Are very heavy", "Have no electrons", "Are always liquids"], "Valence electrons", "A full valence shell is stable."),
      tf("A covalent bond forms when electrons are transferred from one atom to another.", false, "Covalent bond", "Transfer forms ions; sharing forms covalent bonds."),
      tf("Mass is conserved in a chemical reaction.", true, "Conservation of mass", "Atoms are rearranged, not created or destroyed."),
      tf("Metals tend to lose electrons to form positive ions.", true, "Ionic bond", "Metals have few valence electrons and lose them easily."),
      short("What is the charge on a proton?", "+1 (positive)", "Atomic structure", "Protons carry one unit of positive charge."),
      short("Name the bond formed by sharing a pair of electrons.", "Covalent bond", "Covalent bond", "Shared pairs of electrons make covalent bonds."),
    ],
  },
  {
    keys: ["photosynth", "cell", "biolog", "plant", "dna", "gene", "mitochondri", "respiration", "enzyme", "evolution"],
    subject: "Biology",
    title: "Cells and photosynthesis",
    summary:
      "Cells are the basic unit of life. Plant cells capture light energy in chloroplasts and use it to turn carbon dioxide and water into glucose and oxygen (photosynthesis). Every living cell then releases that stored energy through respiration in its mitochondria. Enzymes speed up these reactions and are sensitive to temperature and pH.",
    concepts: [
      ["Photosynthesis", "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂, powered by light energy."],
      ["Chloroplast", "Organelle containing chlorophyll where photosynthesis happens."],
      ["Mitochondrion", "Organelle where aerobic respiration releases energy as ATP."],
      ["Enzyme", "A biological catalyst, usually a protein, with an active site."],
      ["Diffusion", "Net movement of particles from high to low concentration."],
      ["DNA", "Double-helix molecule that stores genetic information."],
    ],
    questions: [
      mcq("Where does photosynthesis take place?", "Chloroplasts", ["Mitochondria", "Nucleus", "Ribosomes"], "Chloroplast", "Chlorophyll in chloroplasts absorbs light."),
      mcq("Which gas is released by photosynthesis?", "Oxygen", ["Carbon dioxide", "Nitrogen", "Hydrogen"], "Photosynthesis", "Water is split, releasing O₂."),
      mcq("The 'powerhouse of the cell' is the:", "Mitochondrion", ["Golgi body", "Vacuole", "Cell wall"], "Mitochondrion", "Aerobic respiration happens there."),
      mcq("Enzymes are mostly made of:", "Proteins", ["Lipids", "Carbohydrates", "Nucleic acids"], "Enzyme", "Their folded shape forms the active site."),
      mcq("Which factor does NOT directly limit the rate of photosynthesis?", "Oxygen concentration", ["Light intensity", "CO₂ concentration", "Temperature"], "Limiting factors", "Light, CO₂ and temperature are the classic limiting factors."),
      mcq("A structure found in plant cells but not animal cells is the:", "Cell wall", ["Cell membrane", "Nucleus", "Cytoplasm"], "Cell structure", "Plant cells have a cellulose cell wall."),
      mcq("High temperatures stop enzymes working because they:", "Change the shape of the active site", ["Run out of energy", "Become too small", "Turn into fats"], "Enzyme", "The enzyme denatures."),
      mcq("DNA is shaped like a:", "Double helix", ["Single strand", "Sphere", "Flat sheet"], "DNA", "Two strands wind around each other."),
      tf("Plants respire only at night.", false, "Respiration", "Plants respire all the time; photosynthesis needs light."),
      tf("Diffusion requires energy from the cell.", false, "Diffusion", "It's passive: particles move down a concentration gradient."),
      tf("Chlorophyll absorbs mostly green light.", false, "Chloroplast", "It reflects green and absorbs red and blue."),
      short("Write the word equation for photosynthesis.", "Carbon dioxide + water → glucose + oxygen", "Photosynthesis", "Light energy drives it, absorbed by chlorophyll."),
      short("What is an enzyme?", "A biological catalyst (usually a protein)", "Enzyme", "It speeds up reactions without being used up."),
    ],
  },
  {
    keys: ["algebra", "quadratic", "equation", "math", "calculus", "derivative", "function", "polynomial", "trigonometr", "geometry", "linear"],
    subject: "Mathematics",
    title: "Algebra essentials",
    summary:
      "Algebra uses symbols to describe relationships. Linear equations have a constant rate of change and graph as straight lines (y = mx + c). Quadratics graph as parabolas and can be solved by factorising, completing the square or the quadratic formula. The discriminant b² − 4ac tells you how many real roots to expect.",
    concepts: [
      ["Gradient", "Rate of change of a line: rise over run, the m in y = mx + c."],
      ["Quadratic formula", "x = (−b ± √(b² − 4ac)) / 2a."],
      ["Discriminant", "b² − 4ac; positive → two roots, zero → one, negative → none (real)."],
      ["Factorising", "Writing an expression as a product, e.g. x² − 9 = (x − 3)(x + 3)."],
      ["Function", "A rule that maps each input to exactly one output."],
      ["Derivative", "Instantaneous rate of change; the gradient of a curve."],
    ],
    questions: [
      mcq("Solve 2x + 6 = 14.", "x = 4", ["x = 10", "x = 3", "x = 8"], "Linear equations", "2x = 8, so x = 4."),
      mcq("What is the gradient of y = 3x − 5?", "3", ["−5", "5", "−3"], "Gradient", "In y = mx + c, m is the gradient."),
      mcq("Factorise x² − 9.", "(x − 3)(x + 3)", ["(x − 9)(x + 1)", "(x − 3)²", "(x + 9)(x − 1)"], "Factorising", "Difference of two squares."),
      mcq("The roots of x² − 5x + 6 = 0 are:", "2 and 3", ["−2 and −3", "1 and 6", "−1 and 6"], "Quadratics", "(x − 2)(x − 3) = 0."),
      mcq("If b² − 4ac < 0, a quadratic has:", "No real roots", ["Two real roots", "One repeated root", "Infinitely many roots"], "Discriminant", "The square root of a negative isn't real."),
      mcq("The derivative of x³ is:", "3x²", ["x²", "3x³", "x⁴/4"], "Derivative", "Power rule: d/dx xⁿ = nxⁿ⁻¹."),
      mcq("Expand (x + 2)².", "x² + 4x + 4", ["x² + 4", "x² + 2x + 4", "2x + 4"], "Expanding brackets", "(x + 2)(x + 2) = x² + 4x + 4."),
      mcq("A line parallel to y = 2x + 1 has gradient:", "2", ["1", "−½", "−2"], "Gradient", "Parallel lines share a gradient."),
      tf("Every quadratic equation has two distinct real roots.", false, "Discriminant", "It depends on the discriminant."),
      tf("The graph of y = x² is symmetric about the y-axis.", true, "Functions", "x² gives the same output for x and −x."),
      tf("(a + b)² = a² + b² for all numbers a and b.", false, "Expanding brackets", "You're missing the 2ab term."),
      short("State the quadratic formula.", "x = (−b ± √(b² − 4ac)) / 2a", "Quadratic formula", "It solves ax² + bx + c = 0."),
      short("What is the y-intercept of y = 4x + 7?", "7", "Linear equations", "Set x = 0."),
    ],
  },
  {
    keys: ["python", "program", "code", "coding", "javascript", "algorithm", "data structure", "loop", "recursion", "software", "computer", "web", "react"],
    subject: "Computer Science",
    title: "Programming fundamentals",
    summary:
      "Programs are built from a few ideas: variables hold values, conditionals choose a path, loops repeat work and functions package reusable steps. Data structures such as lists and dictionaries organise data so algorithms can work on it efficiently. Big-O notation describes how an algorithm's cost grows with input size.",
    concepts: [
      ["Variable", "A named reference to a value in memory."],
      ["Loop", "Repeats a block of code, e.g. for or while."],
      ["Function", "A named, reusable block of code that can take inputs and return output."],
      ["Recursion", "A function that calls itself on a smaller version of the problem."],
      ["Big-O", "How running time or memory grows with input size, e.g. O(n), O(log n)."],
      ["Dictionary", "Key–value mapping with fast lookup by key."],
    ],
    questions: [
      mcq("What does `len([1, 2, 3])` return in Python?", "3", ["2", "6", "[1, 2, 3]"], "Lists", "len counts the elements."),
      mcq("Binary search on a sorted list runs in:", "O(log n)", ["O(n)", "O(n²)", "O(1)"], "Big-O", "Each step halves the search space."),
      mcq("Which structure gives fast lookup by key?", "Dictionary / hash map", ["Linked list", "Stack", "Queue"], "Dictionary", "Hashing gives average O(1) lookup."),
      mcq("A recursive function must have:", "A base case", ["A global variable", "A loop", "Two parameters"], "Recursion", "Without one it never stops."),
      mcq("Which keyword defines a function in Python?", "def", ["func", "function", "lambda only"], "Functions", "def name(params): ..."),
      mcq("A stack follows which order?", "Last in, first out", ["First in, first out", "Sorted order", "Random order"], "Data structures", "Think of a stack of plates."),
      mcq("What is the output of `print(7 // 2)` in Python?", "3", ["3.5", "4", "2"], "Operators", "// is floor division."),
      mcq("Which loop is best when you don't know the number of iterations in advance?", "while", ["for over a range", "do-nothing", "switch"], "Loop", "while repeats until a condition is false."),
      tf("Python lists are immutable.", false, "Lists", "Lists are mutable; tuples are immutable."),
      tf("An O(n²) algorithm always runs slower than an O(n) one, for every input size.", false, "Big-O", "Big-O is about growth; constants matter for small n."),
      tf("A function can return another function in Python.", true, "Functions", "Functions are first-class values."),
      short("What does DRY stand for in programming?", "Don't Repeat Yourself", "Good practice", "Factor repeated logic into functions."),
      short("Name the data structure that processes items first-in, first-out.", "Queue", "Data structures", "Like a line at a counter."),
    ],
  },
];

function findTopic(...texts) {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const t of BANK) {
    // Match at word starts so "revolution" isn't "evolution" and "stomata" isn't "atom".
    const score = t.keys.reduce((s, k) => s + (new RegExp(`\\b${k}`).test(hay) ? 1 : 0), 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

const titleCase = (s) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase());

/** A generic topic pack for subjects the bank doesn't know: study-skills questions phrased around the topic. */
function genericTopic(label) {
  const L = label.trim() || "this topic";
  return {
    subject: null,
    title: titleCase(L),
    summary: `${titleCase(L)} is best learned by breaking it into a few core ideas, connecting each to an example, and testing yourself regularly. Start with the key vocabulary, then work through worked examples, and finish by explaining the ideas in your own words. (Demo mode: this content is simulated. Connect a Gemini API key on the real backend for genuine AI output.)`,
    concepts: [
      ["Core definition", `What ${L} is, stated in one or two sentences.`],
      ["Key vocabulary", `The handful of terms you need to talk about ${L} precisely.`],
      ["Worked example", `A concrete case of ${L} that you can explain step by step.`],
      ["Common misconception", `The mistake learners most often make with ${L}.`],
      ["Real-world application", `Where ${L} shows up outside the classroom.`],
    ],
    questions: [
      mcq(`What's the most effective first step when starting to study ${L}?`, "Learn the core definitions and vocabulary", ["Memorise every detail at once", "Skip straight to past papers", "Re-read the textbook passively"], "Study strategy", "Foundations make every later idea easier to attach."),
      mcq(`Which technique best checks your understanding of ${L}?`, "Explaining it in your own words", ["Highlighting the notes", "Re-reading the chapter", "Copying the summary"], "Self-explanation", "If you can teach it, you understand it."),
      mcq(`Spaced repetition helps you remember ${L} because it:`, "Reviews ideas just before you'd forget them", ["Crams everything in one night", "Avoids testing yourself", "Only uses new material"], "Spaced repetition", "Retrieval at the edge of forgetting strengthens memory."),
      mcq(`When a worked example about ${L} confuses you, you should:`, "Break it into steps and find the first one you can't justify", ["Skip it", "Memorise the answer", "Assume the book is wrong"], "Worked examples", "Locating the exact gap makes it fixable."),
      mcq(`Practice questions on ${L} work best when they are:`, "Mixed and spaced over time", ["All the same type in one block", "Done only once", "Answered with notes open"], "Interleaving", "Interleaving builds the skill of choosing a method."),
      tf(`Testing yourself on ${L} is more effective than re-reading your notes.`, true, "Retrieval practice", "Retrieval strengthens memory more than review."),
      tf(`Once you understand ${L}, you never need to review it again.`, false, "Forgetting curve", "Memories fade without spaced review."),
      short(`In one sentence, what is ${L}?`, `A clear definition of ${L} in your own words.`, "Core definition", "Any accurate, concise definition is fine."),
    ],
  };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Demo version of backend/src/ai/sources.js resolveSource.
 * @returns {Promise<{ label: string, sourceText: string|null, material?: object }>}
 */
export async function resolveSource(input, user, file) {
  switch (input.source ?? "topic") {
    case "topic": {
      const topic = input.topic?.trim();
      if (!topic) throw badRequest("Enter a topic.");
      return { label: topic, sourceText: null };
    }
    case "text": {
      const text = input.text?.trim() ?? "";
      if (text.length < 40) throw badRequest("Paste at least a few sentences of text.");
      return { label: input.topic?.trim() || text.split("\n")[0].slice(0, 60), sourceText: text };
    }
    case "material": {
      const material = isObjectId(input.materialId) ? byId("materials", input.materialId) : null;
      if (!material) throw notFound("Material");
      classAccess(material.classroomId, user);
      return { label: material.title, sourceText: material.text || `${material.title}. ${material.description ?? ""}`, material };
    }
    case "file": {
      if (!file) throw badRequest("Attach a file.");
      const label = input.topic?.trim() || (file.name || "Uploaded file").replace(/\.[^.]+$/, "");
      return { label, sourceText: (await fileText(file)) || null };
    }
    default:
      throw badRequest("Unknown source.");
  }
}

// ---------------------------------------------------------------------------
// Text mining for user-supplied sources
// ---------------------------------------------------------------------------

const STOP = new Set("the a an and or of to in on for with by is are was were be been this that these those it its as at from into than then their there which who whom what when where how why can could should would may might will shall not no yes also such each other more most some any all".split(" "));

function sentences(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 260);
}

function keyTerms(text, n = 12) {
  const counts = new Map();
  for (const w of (text || "").match(/[A-Za-z][A-Za-z-]{3,}/g) ?? []) {
    const k = w.toLowerCase();
    if (STOP.has(k)) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function questionsFromText(text, label) {
  const sents = sentences(text);
  const terms = keyTerms(text, 16);
  const out = [];
  for (const s of sents) {
    const term = terms.find((t) => new RegExp(`\\b${t}\\b`, "i").test(s));
    if (!term) continue;
    const others = terms.filter((t) => t !== term);
    if (others.length < 3) continue;
    out.push(mcq(`Fill in the blank: "${s.replace(new RegExp(`\\b${term}\\b`, "i"), "_____")}"`, term, pick(others, 3), titleCase(term), `From the source: "${s}"`));
    if (out.length >= 10) break;
  }
  for (const s of pick(sents, 3)) out.push(tf(`According to the source: ${s}`, true, label, "This statement appears in the source."));
  return out;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function toQuestion(q, difficulty) {
  const base = { id: shortId(), type: q.type, prompt: q.prompt, explanation: q.explanation ?? null, concept: q.concept ?? null, difficulty: difficulty === "mixed" ? pick(["easy", "medium", "hard"], 1)[0] : difficulty, points: 1, answerText: null };
  if (q.type === "mcq") return { ...base, ...shuffleWithAnswer(q.correct, q.wrong) };
  if (q.type === "truefalse") return { ...base, options: ["True", "False"], answerIndex: q.answer ? 0 : 1 };
  return { ...base, options: [], answerIndex: null, answerText: q.answerText, points: 2 };
}

/** Quiz questions in the backend QuizQuestion shape. */
export function generateQuestions({ label, text, count = 8, difficulty = "mixed", types = ["mcq"] }) {
  const topic = findTopic(label, text?.slice(0, 4000)) ?? genericTopic(label);
  let pool = [...(text ? questionsFromText(text, label) : []), ...topic.questions];
  const allowed = new Set(types?.length ? types : ["mcq"]);
  pool = pool.filter((q) => allowed.has(q.type));
  if (!pool.length) pool = topic.questions.filter((q) => q.type === "mcq");
  // Top up from the generic pack rather than repeating a question.
  if (pool.length < count) pool.push(...genericTopic(label).questions.filter((q) => allowed.has(q.type) && !pool.some((p) => p.prompt === q.prompt)));
  return {
    title: `${titleCase(label || topic.title)} quiz`,
    questions: pick(pool, count).map((q) => toQuestion(q, difficulty)),
  };
}

/** Flashcards: { front, back, hint }. */
export function generateCards({ label, text, count = 12 }) {
  const topic = findTopic(label, text?.slice(0, 4000)) ?? genericTopic(label);
  const cards = topic.concepts.map(([term, definition]) => ({ front: term, back: definition, hint: null }));
  for (const q of topic.questions) {
    if (q.type === "mcq") cards.push({ front: q.prompt, back: q.correct, hint: q.concept ?? null });
    if (q.type === "short") cards.push({ front: q.prompt, back: q.answerText, hint: null });
  }
  if (text) {
    for (const s of sentences(text).slice(0, 6)) {
      const term = keyTerms(s, 1)[0];
      if (term) cards.unshift({ front: `What does the source say about "${term}"?`, back: s, hint: null });
    }
  }
  return { title: `${titleCase(label || topic.title)}`, subject: topic.subject, cards: cards.slice(0, count) };
}

/** Study Studio guide. */
export function generateStudyGuide({ label, text }) {
  const topic = findTopic(label, text?.slice(0, 4000)) ?? genericTopic(label);
  const sents = sentences(text);
  const summary = sents.length >= 3 ? `${sents.slice(0, 3).join(" ")}\n\n${topic.summary}` : topic.summary;
  const keyPoints = sents.length >= 4 ? pick(sents, 5) : topic.concepts.map(([t, d]) => `**${t}:** ${d}`);
  return {
    title: titleCase(label || topic.title),
    subject: topic.subject,
    summary,
    keyPoints,
    concepts: topic.concepts.map(([term, definition]) => ({ term, definition })),
    questionsToPonder: [
      `How would you explain ${label || topic.title} to a friend who missed the lesson?`,
      `Which idea in ${label || topic.title} connects to something you already know well?`,
      `What question would an examiner most likely ask about ${topic.concepts[0][0].toLowerCase()}?`,
      `Where could ${label || topic.title} go wrong in a real-world situation?`,
    ],
  };
}

/** Grade a short answer loosely: shares key words with the model answer. */
export function gradeShortAnswer(question, answer) {
  const words = (s) => new Set((s || "").toLowerCase().match(/[a-z0-9²³√±=+.-]{2,}/g) ?? []);
  const expected = words(question.answerText);
  const given = words(answer);
  const overlap = [...expected].filter((w) => given.has(w)).length;
  const correct = Boolean(answer?.trim()) && (expected.size === 0 || overlap / expected.size >= 0.4);
  return {
    correct,
    feedback: correct ? "Nice — that captures the key idea." : `Not quite. A strong answer would mention: ${question.answerText ?? "the key idea"}.`,
  };
}

/** Topic info for other generators (roadmaps, lesson plans, papers). */
export function topicInfo(label, text) {
  const t = findTopic(label, text) ?? genericTopic(label);
  return { subject: t.subject, title: t.title, summary: t.summary, concepts: t.concepts.map(([term, definition]) => ({ term, definition })), questions: t.questions };
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

/**
 * A tutor reply in markdown. Socratic mode asks guiding questions; explain mode
 * teaches; exam mode gives high-yield bullets. Cites class materials when given.
 */
export function tutorReply({ mode = "explain", message, materials = [], studySet = null, userName = "there" }) {
  const msg = (message || "").trim();
  const topic = findTopic(msg, studySet?.title, studySet?.summary, ...materials.map((m) => `${m.title} ${m.text?.slice(0, 2000) ?? ""}`)) ?? genericTopic(msg.split(/[?.!]/)[0].slice(0, 60) || "this topic");
  const [c1, c2, c3] = topic.concepts;
  const cite = studySet ? " [Source]" : materials[0] ? ` [Material: ${materials[0].title}]` : "";
  const first = (userName || "there").split(" ")[0];

  if (/^(hi|hello|hey)\b/i.test(msg)) {
    return `Hi ${first}! 👋 I'm your EduCare tutor. Ask me about anything you're studying${materials.length ? ` — I can also use your class materials, like **${materials[0].title}**` : ""}.\n\nWhat would you like to work on?`;
  }

  if (mode === "socratic") {
    return [
      `Good question — let's work it out together rather than me just handing you the answer.`,
      ``,
      `**First, a check:** in your own words, what does *${c1[0].toLowerCase()}* mean?${cite}`,
      ``,
      `Once you've got that, think about this: how does *${c2[0].toLowerCase()}* connect to it? Try writing one sentence linking the two.`,
      ``,
      `> Hint: ${c1[1]}`,
      ``,
      `Reply with your thinking and I'll guide you to the next step.`,
    ].join("\n");
  }

  if (mode === "exam") {
    return [
      `## High-yield summary${cite ? "" : ""}`,
      ``,
      ...topic.concepts.slice(0, 5).map(([t, d]) => `- **${t}** — ${d}`),
      ``,
      `**Common trap:** ${topic.questions.find((q) => q.type === "truefalse")?.explanation ?? "mixing up similar-sounding terms."}`,
      ``,
      `**Practice question:** ${topic.questions[0].prompt}`,
      ``,
      `Want me to quiz you on a few more?${cite}`,
    ].join("\n");
  }

  return [
    `Let's build this up step by step.`,
    ``,
    `**1. Start with the core idea.** ${c1[0]}: ${c1[1]}${cite}`,
    ``,
    `**2. Connect it.** ${c2[0]}: ${c2[1]}`,
    ``,
    `**3. See it in action.** ${c3 ? `${c3[0]}: ${c3[1]}` : topic.summary}`,
    ``,
    topic.subject === "Physics" ? `For example, a ball dropped from rest reaches $v = gt = 9.8 \\times 2 \\approx 19.6\\ \\text{m/s}$ after 2 s.\n` : ``,
    `**Quick check:** ${topic.questions[0].prompt}`,
    ``,
    `_Demo mode: replies are simulated. Connect the real backend with a Gemini key for live AI tutoring._`,
  ].join("\n");
}

/** Split text into stream-sized chunks (a few words each). */
export function chunks(text, size = 4) {
  const words = text.split(/(\s+)/);
  const out = [];
  for (let i = 0; i < words.length; i += size * 2) out.push(words.slice(i, i + size * 2).join(""));
  return out;
}

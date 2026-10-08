// Port of backend/src/modules/tools.js (toolsRouter at /tools and artifactRouter at /artifacts).
import { badRequest, by, db, fileText, findOr404, forbidden, insert, isObjectId, jsonField, remove, requireRole, shortId, update } from "../core.js";
import { route } from "../router.js";
import { generateQuestions, resolveSource, think, topicInfo } from "../ai.js";

const STYLES = ["interactive", "lecture", "flipped", "project", "inquiry"];
const STYLE_LABEL = { interactive: "Interactive", lecture: "Lecture", flipped: "Flipped", project: "Project", inquiry: "Inquiry" };
const SECTION_TYPES = ["mcq", "truefalse", "fill", "short", "long"];
const SECTION_LABEL = { mcq: "Multiple choice", truefalse: "True or false", fill: "Fill in the blanks", short: "Short answer", long: "Long answer" };
const LETTERS = "ABCD";

function saveArtifact(userId, type, title, data) {
  return insert("artifacts", { userId, type, title: title.slice(0, 160), data });
}

// ---------------------------------------------------------------------------
// Validation (mirrors the zod schemas)
// ---------------------------------------------------------------------------

const fail = (path, message) => badRequest(`${path}: ${message}`, [{ path, message }]);

function optText(v, path, max) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw fail(path, "Invalid input: expected string");
  const s = v.trim();
  if (!s) return undefined;
  if (s.length > max) throw fail(path, `Too big: expected string to have <=${max} characters`);
  return s;
}

function numField(v, path, min, max, fallback, { int = true } = {}) {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw fail(path, "Invalid input: expected number, received NaN");
  if (int && !Number.isInteger(n)) throw fail(path, "Invalid input: expected int, received number");
  if (n < min) throw fail(path, `Too small: expected number to be >=${min}`);
  if (n > max) throw fail(path, `Too big: expected number to be <=${max}`);
  return n;
}

function enumField(v, options, path, fallback) {
  if (v === undefined && fallback !== undefined) return fallback;
  if (!options.includes(v)) throw fail(path, `Invalid option: expected one of ${options.map((o) => `"${o}"`).join("|")}`);
  return v;
}

/** Drop undefined keys, like Prisma does when storing JSON. */
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const stripDot = (s) => String(s).replace(/[.\s]+$/, "");
const firstSentence = (s) => (String(s).match(/^.*?[.!?](\s|$)/)?.[0] ?? String(s)).trim();

const PREREQS = {
  Physics: ["Rearranging simple equations", "The difference between vectors and scalars", "SI units and unit conversion"],
  Chemistry: ["Structure of the atom (protons, neutrons, electrons)", "Reading the periodic table"],
  Biology: ["Basic cell structure", "Writing word equations"],
  Mathematics: ["Expanding brackets and collecting like terms", "Solving linear equations"],
  "Computer Science": ["Running a simple program", "Variables and basic data types"],
};

// ---------------------------------------------------------------------------
// Lesson planner
// ---------------------------------------------------------------------------

/** Split `total` minutes across segment weights so they sum exactly (in 5-minute steps when possible). */
function allocateMinutes(weights, total) {
  const unit = total % 5 === 0 && total >= 40 ? 5 : 1;
  const units = total / unit;
  const sum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / sum) * units);
  const out = raw.map((x) => Math.max(1, Math.floor(x)));
  let left = units - out.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length][1]] += 1;
  for (let i = out.length - 1; left < 0 && i >= 0; i--) {
    while (left < 0 && out[i] > 1) {
      out[i] -= 1;
      left += 1;
    }
  }
  return out.map((x) => x * unit);
}

function agendaTemplate(style, { topic, c1, c2, c3, hook, practiceQ }) {
  const T = topic;
  switch (style) {
    case "lecture":
      return [
        [10, "Starter: retrieval quiz", `Three quick recall questions on prior learning that ${T} builds on.`, "Display the starter; take answers from non-volunteers.", "Answer from memory on mini whiteboards."],
        [25, `Direct instruction: ${c1.term}`, `Structured explanation of ${c1.term.toLowerCase()} — ${lowerFirst(stripDot(c1.definition))}.`, "Explain with clear visuals; pause every few minutes for a check question.", "Complete guided notes and answer check questions."],
        [20, "Worked examples", `Model two examples that use ${c2.term.toLowerCase()}, then a faded example where students finish the last step.`, "Think aloud through each step, then hand over the final step.", "Copy the method and complete the faded example."],
        [20, `Direct instruction: ${c3.term}`, `Extend to ${c3.term.toLowerCase()} and show how it connects to ${c1.term.toLowerCase()}.`, "Link back to the first example; highlight a common mistake.", "Annotate notes with the connection and the common mistake."],
        [15, "Independent practice", `Graded questions on ${T}, starting with ${practiceQ}`, "Circulate and give targeted feedback.", "Work silently through the graded questions."],
        [10, "Summary and exit ticket", "Recap the three key ideas and complete the exit ticket.", "Summarise using student answers; collect exit tickets.", "Answer the exit ticket individually."],
      ];
    case "flipped":
      return [
        [10, "Pre-work check", `Quick quiz on the pre-class video/reading about ${T}.`, "Run the quiz and note which ideas need re-teaching.", "Answer the pre-work quiz."],
        [15, "Clarify misconceptions", `Address the questions most students missed, focusing on ${c1.term.toLowerCase()}.`, "Re-teach briefly using the quiz data.", "Ask questions and correct their notes."],
        [35, "Application task", `Groups apply ${c2.term.toLowerCase()} and ${c3.term.toLowerCase()} to a richer problem: ${hook}`, "Coach groups with questions rather than answers.", "Collaborate on the task and record their reasoning."],
        [20, "Gallery walk", "Groups post solutions and review each other's work with sticky-note feedback.", "Prompt groups to compare methods.", "Give and respond to peer feedback."],
        [20, "Consolidation and exit ticket", "Draw out the key ideas from the gallery walk, then complete the exit ticket.", "Summarise the best methods; assign the next pre-work.", "Complete the exit ticket."],
      ];
    case "project":
      return [
        [10, "Project launch", `Present the brief: create something that demonstrates ${T}.`, "Share the brief, success criteria and rubric.", "Read the brief and ask clarifying questions."],
        [15, "Plan in teams", `Teams decide how their product will show ${c1.term.toLowerCase()} and ${c2.term.toLowerCase()}.`, "Approve plans; push for accuracy of the science/content.", "Assign roles and sketch a plan."],
        [45, "Build", `Teams build their product, checking it against the success criteria and ${c3.term.toLowerCase()}.`, "Hold quick check-ins with each team.", "Build, test and refine their product."],
        [20, "Showcase", "Each team gives a 2-minute demo; others ask one question each.", "Facilitate and model good questions.", "Present and give peer feedback."],
        [10, "Reflection and exit ticket", "Individual reflection on what the project taught them about the topic.", "Collect reflections and exit tickets.", "Reflect and complete the exit ticket."],
      ];
    case "inquiry":
      return [
        [10, "Phenomenon", `Present a puzzling observation: ${hook}`, "Show the phenomenon without explaining it.", "Observe and write down questions."],
        [10, "Predict", "Students predict what will happen and why.", "Record predictions on the board without judging them.", "Make and justify a prediction."],
        [35, "Investigate", `Small groups investigate to test their predictions about ${c1.term.toLowerCase()}.`, "Provide materials and probing questions.", "Collect evidence and record observations."],
        [25, "Make sense of it", `Groups share findings; the class builds the idea of ${c2.term.toLowerCase()} from the evidence.`, "Orchestrate the discussion toward the key idea.", "Share evidence and refine explanations."],
        [10, `Formalise: ${c3.term}`, `Name the concept formally and link it to the investigation.`, "Introduce the formal vocabulary.", "Add the formal definition to their notes."],
        [10, "Exit ticket", "Apply the idea to a new example.", "Collect and sort exit tickets for next lesson.", "Complete the exit ticket."],
      ];
    default:
      return [
        [10, "Hook", `Open with a puzzle: ${hook} Students vote before any teaching.`, "Pose the question and take a quick vote — don't reveal the answer yet.", "Vote individually, then justify their choice to a partner."],
        [20, `Mini-lesson: ${c1.term}`, `Introduce ${c1.term.toLowerCase()}: ${lowerFirst(stripDot(c1.definition))}.`, "Explain with one worked example, thinking aloud.", "Take guided notes and follow the example."],
        [15, "Think–pair–share", `Pairs explain how ${c2.term.toLowerCase()} connects to ${c1.term.toLowerCase()}.`, "Circulate, listen for misconceptions and pick two pairs to share.", "Discuss in pairs, then share with the class."],
        [15, `Worked example: ${c3.term}`, `Model an example using ${c3.term.toLowerCase()}, then fade support (I do, we do).`, "Model, then hand over steps one at a time.", "Complete each next step on mini whiteboards."],
        [25, "Guided practice", `Tiered practice on ${T}, starting with: ${practiceQ}`, "Support a target group; stamp correct answers.", "Work through the tiered questions in pairs."],
        [15, "Plenary and exit ticket", "Revisit the hook question with the new ideas, then complete the exit ticket.", "Reveal the hook answer and run the exit ticket.", "Explain the hook answer and complete the exit ticket."],
      ];
  }
}

/** Lesson plan in the backend lessonSchema shape. */
export function buildLessonPlan(input) {
  const info = topicInfo(input.topic, [input.subject, input.objectives, input.notes].filter(Boolean).join(" "));
  const topic = input.topic.trim();
  const [c1, c2, c3 = info.concepts[0]] = info.concepts;
  const mcqs = info.questions.filter((q) => q.type === "mcq");
  const tfs = info.questions.filter((q) => q.type === "truefalse");
  const shorts = info.questions.filter((q) => q.type === "short");
  const hook = mcqs[0]?.prompt ?? `What do you already know about ${topic}?`;
  const practiceQ = mcqs[3]?.prompt ?? shorts[0]?.prompt ?? `a straightforward ${topic} question`;
  const styleLabel = STYLE_LABEL[input.style];

  let rows = agendaTemplate(input.style, { topic, c1, c2, c3, hook, practiceQ });
  if (input.durationMin < 25) rows = [rows[0], rows.reduce((a, b) => (b[0] > a[0] ? b : a)), rows[rows.length - 1]];
  const minutes = allocateMinutes(rows.map((x) => x[0]), input.durationMin);
  const agenda = rows.map(([, title, description, teacher, students], i) => ({ minutes: minutes[i], title, description, teacher, students }));

  const given = (input.objectives ?? "")
    .split(/\n|;|•/)
    .map((s) => s.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((s) => s.length > 3)
    .map((s) => (/^students/i.test(s) ? s : `Students will be able to ${lowerFirst(s)}`));
  const objectives = [
    ...given,
    `Students will be able to define ${c1.term.toLowerCase()} and ${c2.term.toLowerCase()} in their own words.`,
    `Students will be able to explain how ${c3.term.toLowerCase()} connects to ${c1.term.toLowerCase()}.`,
    `Students will be able to apply ideas from ${topic} to solve an unseen problem.`,
    `Students will be able to identify and correct a common misconception about ${topic}.`,
  ].slice(0, 5);

  const styleMaterials = {
    interactive: ["Think–pair–share prompt cards"],
    lecture: ["Guided notes handout"],
    flipped: ["Pre-class video or reading (shared the lesson before)"],
    project: ["Project brief and rubric", "Building materials or laptops"],
    inquiry: ["Investigation kit for each group", "Prediction sheet"],
  }[input.style];
  const subjectMaterials = info.subject === "Physics" ? ["PhET simulation (optional)"] : info.subject === "Computer Science" ? ["Laptops with an online code editor"] : [];

  const checks = [];
  if (mcqs[1]) checks.push(`Hinge question after the mini-lesson: "${mcqs[1].prompt}" — correct answer: ${mcqs[1].correct}.`);
  if (shorts[0]) checks.push(`Mini whiteboards: "${shorts[0].prompt}" (look for: ${shorts[0].answerText}).`);
  if (tfs[0]) checks.push(`Thumbs up/down: "${tfs[0].prompt}" — ${tfs[0].answer ? "true" : "false"}; ${lowerFirst(tfs[0].explanation)}`);
  checks.push(`Cold-call two students to explain ${c2.term.toLowerCase()} in their own words before independent practice.`);

  return {
    title: `${titleCase(topic)} — ${styleLabel} Lesson`,
    overview: `In this ${input.durationMin}-minute ${styleLabel.toLowerCase()} lesson${input.grade ? ` for ${input.grade}` : ""}, students explore ${topic}. They start from **${c1.term.toLowerCase()}**, connect it to **${c2.term.toLowerCase()}** and **${c3.term.toLowerCase()}**, and finish by applying the ideas to unseen problems, with an exit ticket to check understanding.`,
    objectives,
    prerequisites: PREREQS[info.subject] ?? [`Key vocabulary from earlier lessons related to ${topic}`, "Familiar pair-discussion routines"],
    materials: ["Slides or whiteboard", "Mini whiteboards and markers", "Printed practice worksheet", ...styleMaterials, ...subjectMaterials],
    agenda,
    checksForUnderstanding: checks,
    differentiation: {
      support: [
        `Glossary card defining ${c1.term.toLowerCase()}, ${c2.term.toLowerCase()} and ${c3.term.toLowerCase()}.`,
        "Sentence starters for paired discussion (\"I think… because…\").",
        "Partially worked examples with the first step completed.",
      ],
      challenge: [
        `Write an exam-style question on ${topic} with a full mark scheme.`,
        `Explain where the ideas of ${topic} break down or need extra assumptions.`,
        ...(mcqs[6] ? [`Extension problem: ${mcqs[6].prompt}`] : []),
      ],
    },
    homework: `Complete five mixed-difficulty practice questions on ${topic}, then write a three-sentence summary explaining ${c2.term.toLowerCase()} in your own words. Spend 10 minutes reviewing your EduCare flashcards.`,
    exitTicket: [shorts[1]?.prompt ?? shorts[0]?.prompt ?? `In one sentence, what is ${c1.term.toLowerCase()}?`, `Explain ${c2.term.toLowerCase()} using an example.`, `Rate your confidence with ${topic} from 1–5 and name one thing that's still unclear.`],
  };
}

function parseLessonInput(b = {}) {
  if (typeof b.topic !== "string") throw fail("topic", "Invalid input: expected string");
  const topic = b.topic.trim();
  if (topic.length < 2) throw fail("topic", "Too small: expected string to have >=2 characters");
  if (topic.length > 200) throw fail("topic", "Too big: expected string to have <=200 characters");
  return clean({
    topic,
    subject: optText(b.subject, "subject", 80),
    grade: optText(b.grade, "grade", 60),
    durationMin: numField(b.durationMin, "durationMin", 10, 240, 45),
    style: enumField(b.style, STYLES, "style", "interactive"),
    objectives: optText(b.objectives, "objectives", 1500),
    notes: optText(b.notes, "notes", 2000),
  });
}

route("POST", "/tools/lesson-plan", async (req) => {
  requireRole(req.user, "TEACHER");
  const input = parseLessonInput(req.body);
  await think(1500, 2500);
  const plan = buildLessonPlan(input);
  const artifact = saveArtifact(req.user.id, "lesson_plan", plan.title, { input, plan });
  return { artifact };
});

// ---------------------------------------------------------------------------
// Question paper
// ---------------------------------------------------------------------------

const DIFF_CYCLE = ["easy", "medium", "medium", "hard"];

function paperPools(label, text) {
  const info = topicInfo(label, text?.slice(0, 4000));
  const cs = info.concepts;
  const dedupe = (qs) => qs.filter((q, i) => qs.findIndex((x) => x.prompt === q.prompt) === i);
  const quiz = (types) => dedupe(generateQuestions({ label, text, count: 30, types }).questions);
  const mcq = quiz(["mcq"]);
  const tf = quiz(["truefalse"]);
  const raw = info.questions;

  const pools = {
    mcq: [
      ...mcq.filter((q) => !q.prompt.startsWith("Fill in the blank")).map((q) => ({
        text: q.prompt,
        options: q.options,
        answer: `(${LETTERS[q.answerIndex]}) ${q.options[q.answerIndex]}`,
        bloom: /\d/.test(q.prompt) ? "apply" : "remember",
      })),
      ...cs.map((c, i) => {
        const wrong = cs.filter((x) => x !== c).slice(i % 2, (i % 2) + 3).map((x) => x.definition);
        const options = [c.definition, ...wrong].sort((a, b) => (a.length % 3) - (b.length % 3) || a.localeCompare(b));
        const idx = options.indexOf(c.definition);
        return { text: `Which statement best describes **${lowerFirst(c.term)}**?`, options, answer: `(${LETTERS[idx]}) ${c.definition}`, bloom: "understand" };
      }),
    ],
    truefalse: [
      ...tf.map((q) => ({ text: q.prompt.replace(/^According to the source: /, ""), answer: q.answerIndex === 0 ? "True" : "False", bloom: "understand" })),
      ...cs.map((c, i) => {
        const other = cs[(i + 2) % cs.length];
        return i % 2 === 0 || other === c
          ? { text: `${c.term}: ${lowerFirst(c.definition)}`, answer: "True", bloom: "remember" }
          : { text: `${c.term} is best described as: ${lowerFirst(other.definition)}`, answer: "False", bloom: "understand" };
      }),
    ],
    fill: [
      ...cs.map((c) => ({ text: `${stripDot(c.definition)} — this is called ________.`, answer: c.term, bloom: "remember" })),
      ...mcq.filter((q) => q.prompt.startsWith("Fill in the blank")).map((q) => ({ text: q.prompt.replace(/^Fill in the blank: /, "").replace(/_____/, "________"), answer: q.options[q.answerIndex], bloom: "remember" })),
      ...raw.filter((q) => q.type === "short" && q.answerText.length < 40).map((q) => ({ text: `${stripDot(q.prompt)}: ________`, answer: q.answerText, bloom: "remember" })),
    ],
    short: [
      ...raw.filter((q) => q.type === "short").map((q) => ({ text: q.prompt, answer: `${q.answerText}. ${q.explanation}`, bloom: "remember" })),
      ...cs.map((c) => ({ text: `Define **${lowerFirst(c.term)}** and give one example.`, answer: `${c.definition} Award 1 mark for an accurate definition and 1 mark for a valid example.`, bloom: "understand" })),
      ...cs.slice(0, -1).map((c, i) => ({
        text: `Explain the difference between ${lowerFirst(c.term)} and ${lowerFirst(cs[i + 1].term)}.`,
        answer: `${c.term}: ${lowerFirst(c.definition)} ${cs[i + 1].term}: ${lowerFirst(cs[i + 1].definition)} Credit a clear contrast, not just two definitions.`,
        bloom: "analyze",
      })),
    ],
    long: [
      ...(info.subject === "Physics"
        ? [
            {
              text: "A ball is projected from level ground at $20\\ \\text{m/s}$ at $30^\\circ$ above the horizontal. Take $g = 9.8\\ \\text{m/s}^2$ and ignore air resistance.\n\n(a) Calculate the time of flight.\n(b) Calculate the horizontal range.\n(c) Explain why launching at $45^\\circ$ with the same speed gives a greater range.",
              answer: "(a) $t = \\dfrac{2u\\sin\\theta}{g} = \\dfrac{2(20)(0.5)}{9.8} \\approx 2.04\\ \\text{s}$ — 2 marks (method + answer).\n(b) $R = \\dfrac{u^2 \\sin 2\\theta}{g} = \\dfrac{400 \\times 0.866}{9.8} \\approx 35.3\\ \\text{m}$ — 2 marks.\n(c) $R \\propto \\sin 2\\theta$, which is greatest when $2\\theta = 90^\\circ$, i.e. $\\theta = 45^\\circ$ — 1 mark.",
              bloom: "apply",
            },
          ]
        : []),
      ...cs.slice(0, -1).map((c, i) => ({
        text: `Explain how ${lowerFirst(c.term)} and ${lowerFirst(cs[i + 1].term)} are connected. Use a worked example or labelled diagram to support your answer.`,
        answer: `Marking scheme: accurate definition of ${lowerFirst(c.term)} (${stripDot(lowerFirst(c.definition))}); accurate definition of ${lowerFirst(cs[i + 1].term)}; a clear explanation of the link between them; a correct, relevant example or diagram; logical structure and correct terminology.`,
        bloom: "analyze",
      })),
      ...raw.filter((q) => q.type === "truefalse" && !q.answer).map((q) => ({
        text: `"${q.prompt}" Evaluate this statement, using evidence and an example.`,
        answer: `The statement is false. ${q.explanation} Award marks for: identifying it as false, the correct reasoning, a supporting example, and a balanced conclusion.`,
        bloom: "evaluate",
      })),
      ...cs.slice(2, 4).map((c) => ({
        text: `Design an activity, experiment or worked scenario that demonstrates ${lowerFirst(c.term)}. Describe what you would do, what you would observe or calculate, and what it shows.`,
        answer: `Credit: a feasible design clearly linked to ${lowerFirst(c.term)}; identified variables or steps; an expected result consistent with "${stripDot(c.definition)}"; a sensible limitation or improvement.`,
        bloom: "create",
      })),
    ],
  };
  return { info, pools };
}

/** Question paper in the backend paperSchema shape: { title, instructions, sections[] }. */
export function generatePaper(input, src) {
  const { pools } = paperPools(src.label, src.sourceText ?? undefined);
  const qIndex = { mcq: 0, truefalse: 0, fill: 0, short: 0, long: 0 };
  let n = 0;
  const sections = input.sections.map((cfg) => ({
    type: cfg.type,
    questions: Array.from({ length: cfg.count }, () => {
      const pool = pools[cfg.type];
      const q = pool[qIndex[cfg.type]++ % pool.length];
      const difficulty =
        input.difficulty !== "mixed" ? input.difficulty : cfg.type === "long" ? (n++ % 2 ? "hard" : "medium") : DIFF_CYCLE[n++ % DIFF_CYCLE.length];
      return { ...q, difficulty };
    }),
  }));
  const total = input.sections.reduce((s, x) => s + x.count, 0);
  const letters = input.sections.map((_, i) => String.fromCharCode(65 + i));
  return {
    title: `${titleCase(src.label)} — ${input.subject ? `${input.subject} ` : ""}Question Paper`,
    instructions: [
      "Answer all questions.",
      `This paper has ${input.sections.length} section${input.sections.length === 1 ? "" : "s"} (${letters.join(", ")}) and ${total} question${total === 1 ? "" : "s"}.`,
      "The marks for each question are shown in brackets.",
      ...(input.sections.some((s) => s.type === "mcq") ? ["For multiple-choice questions, write the letter of the correct option."] : []),
      "Show all working for calculations — marks are awarded for method.",
      `Time allowed: ${input.durationMin} minutes.`,
    ],
    sections,
  };
}

/** Enforce the requested structure regardless of what the "model" returned (backend route logic). */
export function assemblePaper(input, data) {
  let number = 0;
  const sections = input.sections.map((cfg, i) => {
    const generated = (data.sections[i]?.type === cfg.type ? data.sections[i] : data.sections.find((s) => s.type === cfg.type)) ?? data.sections[i] ?? { questions: [] };
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
  return paper;
}

function parsePaperInput(body = {}) {
  const b = { ...body, sections: jsonField(body.sections, body.sections) };
  const source = enumField(b.source, ["topic", "text", "material", "file"], "source", "topic");
  if (b.materialId !== undefined && !isObjectId(b.materialId)) throw fail("materialId", "Invalid id");
  if (!Array.isArray(b.sections)) throw fail("sections", "Invalid input: expected array");
  if (b.sections.length < 1) throw fail("sections", "Too small: expected array to have >=1 items");
  if (b.sections.length > 6) throw fail("sections", "Too big: expected array to have <=6 items");
  const sections = b.sections.map((s, i) => ({
    type: enumField(s?.type, SECTION_TYPES, `sections.${i}.type`),
    count: numField(s?.count, `sections.${i}.count`, 1, 40),
    marksEach: numField(s?.marksEach, `sections.${i}.marksEach`, 0.5, 50, undefined, { int: false }),
  }));
  for (const [i, s] of sections.entries()) {
    if (s.count === undefined) throw fail(`sections.${i}.count`, "Invalid input: expected number, received undefined");
    if (s.marksEach === undefined) throw fail(`sections.${i}.marksEach`, "Invalid input: expected number, received undefined");
  }
  return clean({
    source,
    topic: optText(b.topic, "topic", 300),
    text: optText(b.text, "text", 200_000),
    materialId: b.materialId,
    subject: optText(b.subject, "subject", 80),
    grade: optText(b.grade, "grade", 60),
    durationMin: numField(b.durationMin, "durationMin", 10, 360, 60),
    difficulty: enumField(b.difficulty, ["easy", "medium", "hard", "mixed"], "difficulty", "mixed"),
    sections,
    notes: optText(b.notes, "notes", 2000),
  });
}

route("POST", "/tools/question-paper", async (req) => {
  requireRole(req.user, "TEACHER");
  const input = parsePaperInput(req.body);
  const src = await resolveSource(input, req.user, req.files?.file?.[0]);
  await think(2000, 3200);
  const data = generatePaper(input, src);

  const paper = assemblePaper(input, data);
  const artifact = saveArtifact(req.user.id, "question_paper", paper.title, { input: clean({ ...input, text: undefined }), paper });
  return { artifact };
});

/** Convert the objective questions of a saved paper into an interactive quiz. */
route("POST", "/tools/question-paper/:id/to-quiz", (req) => {
  requireRole(req.user, "TEACHER");
  const artifact = findOr404("artifacts", req.params.id, "Question paper");
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
  const quiz = insert("quizzes", { ownerId: req.user.id, title: paper.title, topic: paper.subject, source: "paper", questions, timeLimitMin: paper.durationMin });
  return { quiz };
});

// ---------------------------------------------------------------------------
// Answer sheet checker
// ---------------------------------------------------------------------------

const MARKS_RE = /[([]\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)?\s*[)\]]/i;
const NUMBERED_RE = /^\s*(?:Q(?:uestion)?\s*)?(\d+[a-z]?)\s*[.):-]\s*(.*)$/i;

/** Split "1. ... 2. ..." text into numbered items. */
function numberedItems(text) {
  const items = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(NUMBERED_RE);
    if (m) {
      cur = { number: m[1], text: m[2].trim() };
      items.push(cur);
    } else if (cur && line.trim()) cur.text += ` ${line.trim()}`;
  }
  return items;
}

/** Answer key text -> [{ number, question, expected, maxScore }]. */
function parseKey(text, defaultMarks) {
  let items = numberedItems(text);
  if (!items.length) {
    items = String(text)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 3)
      .slice(0, 15)
      .map((l, i) => ({ number: String(i + 1), text: l }));
  }
  return items.map(({ number, text: t }) => {
    const marks = t.match(MARKS_RE);
    const body = t.replace(MARKS_RE, "").trim();
    const split = body.match(/^(.*?)(?:\s*(?:Answer|Ans|Key|Expected)\s*[:-]\s*|\s+[—–]\s+|\s+-\s+|\s*=>\s*)(.+)$/i);
    return {
      number,
      question: split ? split[1].trim() || `Question ${number}` : `Question ${number}`,
      expected: (split ? split[2] : body).trim(),
      maxScore: marks ? Number(marks[1]) : defaultMarks,
    };
  });
}

/** A made-up key for when it only arrived as an image. */
function syntheticKey(label, defaultMarks) {
  const info = topicInfo(label);
  const qs = info.questions.filter((q) => q.type !== "truefalse").slice(0, 5);
  return qs.map((q, i) => ({
    number: String(i + 1),
    question: q.prompt,
    expected: q.type === "mcq" ? `${q.correct}. ${q.explanation}` : `${q.answerText}. ${q.explanation}`,
    maxScore: defaultMarks,
  }));
}

const words = (s) => new Set((String(s).toLowerCase().match(/[a-z0-9²³√±=+.-]{3,}/g) ?? []).filter((w) => !["the", "and", "for", "with", "that", "this", "are", "from", "award", "mark", "marks"].includes(w)));

function overlap(expected, given) {
  const e = words(expected);
  if (!e.size) return given?.trim() ? 1 : 0;
  const g = words(given);
  return [...e].filter((w) => g.has(w)).length / e.size;
}

const missing = (expected, given) => {
  const g = words(given);
  return [...words(expected)].filter((w) => !g.has(w) && w.length > 4).slice(0, 4);
};

const roundHalf = (x) => Math.round(x * 2) / 2;
const SIM_PATTERN = ["correct", "partial", "correct", "incorrect", "correct", "partial", "correct", "unanswered", "correct", "partial"];

function wrongAnswer(expected) {
  const num = expected.match(/-?\d+(\.\d+)?/);
  if (num) return expected.replace(num[0], String(Math.round(Number(num[0]) * 2 * 10) / 10)).split(/(?<=[.!?])\s/)[0];
  return "Describes a related idea but not the one asked; none of the key terms from the answer key appear.";
}

/** Answer-check result in the backend checkSchema shape. */
export function buildAnswerCheck({ key, sheetText, strictness, fileCount }) {
  const fromText = Boolean(sheetText?.trim());
  const answers = new Map(fromText ? numberedItems(sheetText).map((a) => [a.number.toLowerCase(), a.text]) : []);
  const studentName = fromText ? sheetText.match(/name\s*[:-]\s*([A-Za-z][A-Za-z .'-]{1,40}?)\s*(?:\n|$|,|roll|class)/i)?.[1]?.trim() : undefined;
  const correctAt = { lenient: 0.45, balanced: 0.6, strict: 0.75 }[strictness];
  const partialAt = { lenient: 0.15, balanced: 0.25, strict: 0.35 }[strictness];

  const questions = key.map((k, i) => {
    let verdict;
    let studentAnswer;
    let ratio;
    if (fromText) {
      studentAnswer = answers.get(k.number.toLowerCase()) ?? "";
      ratio = overlap(k.expected, studentAnswer);
      verdict = !studentAnswer.trim() ? "unanswered" : ratio >= correctAt ? "correct" : ratio >= partialAt ? "partial" : "incorrect";
    } else {
      verdict = SIM_PATTERN[i % SIM_PATTERN.length];
      if (strictness === "lenient" && verdict === "incorrect") verdict = "partial";
      if (strictness === "strict" && verdict === "partial" && i % 2 === 1) verdict = "incorrect";
      const parts = k.expected.split(/\s+/);
      studentAnswer =
        verdict === "correct" ? firstSentence(k.expected) : verdict === "partial" ? `${parts.slice(0, Math.max(3, Math.ceil(parts.length / 2))).join(" ")}…` : verdict === "incorrect" ? wrongAnswer(k.expected) : "";
      ratio = verdict === "partial" ? 0.5 : verdict === "correct" ? 1 : 0;
    }
    const score =
      verdict === "correct"
        ? k.maxScore
        : verdict === "partial"
          ? Math.min(k.maxScore - 0.5, Math.max(0.5, roundHalf(k.maxScore * Math.min(0.8, Math.max(0.3, ratio)) * (strictness === "strict" ? 0.85 : strictness === "lenient" ? 1.15 : 1))))
          : 0;
    const gaps = missing(k.expected, studentAnswer);
    const feedback = {
      correct: "Accurate and complete — the key points from the answer key are all there.",
      partial: `Partly there. ${gaps.length ? `To get full marks, also cover: ${gaps.join(", ")}.` : "Develop the explanation further with the reasoning behind it."}`,
      incorrect: `This doesn't match the expected answer. Revisit: ${firstSentence(k.expected)}`,
      unanswered: "No answer found for this question. Attempt every question — a partial answer can still earn marks.",
    }[verdict];
    return { number: k.number, question: k.question, expected: k.expected, studentAnswer, score, maxScore: k.maxScore, verdict, feedback };
  });

  const total = questions.reduce((s, q) => s + q.score, 0);
  const max = questions.reduce((s, q) => s + q.maxScore, 0) || 1;
  const pct = total / max;
  const short = (q) => `Q${q.number}${q.question && !/^Question \d/.test(q.question) ? ` (${stripDot(q.question).slice(0, 60)})` : ""}`;
  const good = questions.filter((q) => q.verdict === "correct");
  const weak = questions.filter((q) => q.verdict !== "correct");

  return clean({
    studentName: studentName || undefined,
    questions,
    overallFeedback:
      pct >= 0.8
        ? "Excellent work. Answers are accurate and well explained; the few lost marks come from small omissions rather than misunderstandings."
        : pct >= 0.5
          ? "A solid attempt with a good grasp of the basics. Marks were mainly lost on incomplete explanations — make sure every answer states the key idea and the reasoning behind it."
          : "This needs more work. Several answers miss the key ideas from the answer key; revise the focus areas below and try similar questions again.",
    strengths: good.length ? good.slice(0, 3).map((q) => `Secure on ${short(q)}`) : ["Attempted the paper and showed some relevant working"],
    focusAreas: weak.length ? weak.slice(0, 4).map((q) => `${short(q)}: ${firstSentence(q.expected)}`) : ["Keep practising with harder, mixed questions"],
    legibility: fromText ? "clear" : fileCount > 2 ? "mostly_clear" : "clear",
  });
}

route("POST", "/tools/answer-check", async (req) => {
  const b = req.body ?? {};
  const input = clean({
    answerKeyText: optText(b.answerKeyText, "answerKeyText", 100_000),
    defaultMarks: numField(b.defaultMarks, "defaultMarks", 0.5, 100, 5, { int: false }),
    strictness: enumField(b.strictness, ["lenient", "balanced", "strict"], "strictness", "balanced"),
    title: optText(b.title, "title", 160),
  });
  const keyFiles = (req.files?.answerKey ?? []).slice(0, 2);
  const sheetFiles = (req.files?.answerSheet ?? []).slice(0, 6);
  if (!sheetFiles.length) throw badRequest("Upload the answer sheet (photos or PDF).");
  if (!keyFiles.length && !input.answerKeyText) throw badRequest("Provide an answer key (file or text).");

  const keyTexts = [input.answerKeyText];
  for (const f of keyFiles) keyTexts.push(await fileText(f));
  const keyText = keyTexts.filter(Boolean).join("\n");
  let key = keyText ? parseKey(keyText, input.defaultMarks) : [];
  if (!key.length) key = syntheticKey(input.title || keyFiles[0]?.name?.replace(/\.[^.]+$/, "") || "", input.defaultMarks);

  const sheetTexts = [];
  for (const f of sheetFiles) sheetTexts.push(await fileText(f));
  await think(2200, 3500);

  const data = buildAnswerCheck({ key, sheetText: sheetTexts.filter(Boolean).join("\n"), strictness: input.strictness, fileCount: sheetFiles.length });
  const questions = data.questions.map((q) => ({ ...q, score: Math.max(0, Math.min(q.score, q.maxScore)) }));
  const result = {
    ...data,
    questions,
    totalScore: Math.round(questions.reduce((s, q) => s + q.score, 0) * 10) / 10,
    maxScore: questions.reduce((s, q) => s + q.maxScore, 0),
  };
  const title = input.title || `Answer check${data.studentName ? ` — ${data.studentName}` : ""}`;
  const artifact = saveArtifact(req.user.id, "answer_check", title, { input: { strictness: input.strictness, files: sheetFiles.map((f) => f.name) }, result });
  return { artifact };
});

// ---------------------------------------------------------------------------
// Library (/artifacts)
// ---------------------------------------------------------------------------

route("GET", "/artifacts", (req) => {
  const type = typeof req.query.type === "string" && req.query.type ? req.query.type : undefined;
  const artifacts = db.artifacts
    .filter((a) => a.userId === req.user.id && (!type || a.type === type))
    .sort(by("createdAt", "desc"))
    .slice(0, 200)
    .map((a) => ({ id: a.id, type: a.type, title: a.title, createdAt: a.createdAt, updatedAt: a.updatedAt }));
  return { artifacts };
});

function ownArtifact(id, user) {
  const a = findOr404("artifacts", id, "Item");
  if (a.userId !== user.id) throw forbidden();
  return a;
}

route("GET", "/artifacts/:id", (req) => ({ artifact: ownArtifact(req.params.id, req.user) }));

route("PATCH", "/artifacts/:id", (req) => {
  const a = ownArtifact(req.params.id, req.user);
  const b = req.body ?? {};
  const patch = {};
  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : null;
    if (title === null) throw fail("title", "Invalid input: expected string");
    if (!title) throw fail("title", "Too small: expected string to have >=1 characters");
    if (title.length > 160) throw fail("title", "Too big: expected string to have <=160 characters");
    patch.title = title;
  }
  if (b.data !== undefined) {
    if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) throw fail("data", "Invalid input: expected record");
    patch.data = { ...a.data, ...b.data };
  }
  update("artifacts", a, patch);
  return { artifact: a };
});

route("DELETE", "/artifacts/:id", (req) => {
  const a = ownArtifact(req.params.id, req.user);
  remove("artifacts", (x) => x.id === a.id);
  return { ok: true };
});

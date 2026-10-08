import { z } from "zod";
import { generateJSON } from "../lib/gemini.js";
import { shortId } from "../lib/ids.js";
import { HttpError } from "../lib/errors.js";

export const QUESTION_TYPES = ["mcq", "truefalse", "short"];
export const DIFFICULTIES = ["easy", "medium", "hard", "mixed"];

const rawQuestion = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().describe("The question. Use $...$ for inline math."),
  options: z.array(z.string()).describe('Exactly 4 options for "mcq", ["True","False"] for "truefalse", [] for "short".'),
  answerIndex: z.number().int().optional().describe("Index of the correct option (mcq / truefalse)."),
  answerText: z.string().optional().describe('Model answer for "short" questions (1-3 sentences).'),
  explanation: z.string().describe("Why the answer is right and the most tempting wrong option is wrong. 1-3 sentences."),
  concept: z.string().describe("The specific concept being tested, 1-4 words, e.g. 'Newton's third law'."),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

const quizSchema = z.object({
  title: z.string().describe("Short, specific quiz title."),
  questions: z.array(rawQuestion),
});

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Validate, repair and shuffle a model-produced question. Returns null if unusable. */
export function normalizeQuestion(q) {
  const base = {
    id: shortId(),
    type: q.type,
    prompt: q.prompt?.trim(),
    explanation: q.explanation?.trim() || null,
    concept: q.concept?.trim() || null,
    difficulty: q.difficulty ?? "medium",
    answerText: null,
    answerIndex: null,
    options: [],
    points: q.type === "short" ? 2 : 1,
  };
  if (!base.prompt) return null;

  if (q.type === "mcq") {
    const options = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean);
    if (options.length < 3 || new Set(options).size !== options.length) return null;
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= options.length) return null;
    const correct = options[q.answerIndex];
    const shuffled = shuffle(options);
    return { ...base, options: shuffled, answerIndex: shuffled.indexOf(correct) };
  }
  if (q.type === "truefalse") {
    let idx = q.answerIndex;
    if (!Number.isInteger(idx) && q.answerText) idx = /^t/i.test(q.answerText) ? 0 : 1;
    if (idx !== 0 && idx !== 1) return null;
    return { ...base, options: ["True", "False"], answerIndex: idx };
  }
  if (q.type === "short") {
    if (!q.answerText?.trim()) return null;
    return { ...base, answerText: q.answerText.trim() };
  }
  return null;
}

const DIFFICULTY_GUIDE = {
  easy: "All questions easy: recall and basic understanding.",
  medium: "All questions medium: application and explanation.",
  hard: "All questions hard: analysis, multi-step reasoning, edge cases.",
  mixed: "Mix difficulties: roughly 30% easy, 50% medium, 20% hard, ordered easy to hard.",
};

/**
 * Generate quiz questions from a topic or source parts.
 * @returns {Promise<{ title: string, questions: object[], model: string }>}
 */
export async function generateQuestions({ label, parts = [], count = 8, difficulty = "mixed", types = ["mcq"], focusConcepts, audience }) {
  const typeList = types.filter((t) => QUESTION_TYPES.includes(t));
  const system = [
    "You are an expert assessment designer who writes clear, unambiguous, curriculum-quality questions.",
    "Rules:",
    "- Every question must have exactly one defensible correct answer.",
    "- Distractors must be plausible and reflect real misconceptions, never jokes or 'all of the above'.",
    "- Test understanding, not trivia about the source's wording or formatting.",
    "- Keep prompts self-contained: never say 'according to the text' or refer to page numbers.",
    "- Use $...$ for inline math and $$...$$ for display math.",
    parts.length
      ? "- Base every question strictly on the provided source. Do not introduce facts that are not supported by it."
      : "- Use accurate, widely accepted knowledge appropriate to the topic.",
  ].join("\n");

  const prompt = [
    `Create ${count} questions${parts.length ? ` from the source above (topic: "${label}")` : ` about: "${label}"`}.`,
    `Question types allowed: ${typeList.join(", ")}. Distribute across them.`,
    DIFFICULTY_GUIDE[difficulty] ?? DIFFICULTY_GUIDE.mixed,
    focusConcepts?.length ? `Focus on these concepts the learner struggles with: ${focusConcepts.join("; ")}. Approach each from a new angle.` : "",
    audience ? `Audience: ${audience}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Ask for a few extra so validation drop-outs don't leave the quiz short.
  const { data, model } = await generateJSON({ system, parts, prompt: `${prompt}\nReturn ${count + 2} questions.`, schema: quizSchema, temperature: 0.6 });
  const questions = data.questions.map(normalizeQuestion).filter(Boolean).slice(0, count);
  if (!questions.length) throw new HttpError(502, "The AI produced no usable questions. Try a different source.");
  return { title: data.title, questions, model };
}

const gradeSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      score: z.number().describe("0 to 1: fraction of credit earned."),
      feedback: z.string().describe("One or two sentences addressed to the student."),
    }),
  ),
});

/** Grade free-text answers against model answers in a single call. */
export async function gradeShortAnswers(items) {
  if (!items.length) return new Map();
  const { data } = await generateJSON({
    system:
      "You are a fair, encouraging teacher grading short answers. Award credit for correct ideas even when worded differently. Give partial credit (e.g. 0.5) for partially correct answers. Empty or off-topic answers score 0.",
    prompt: `Grade each answer.\n\n${JSON.stringify(
      items.map((i) => ({ id: i.id, question: i.prompt, modelAnswer: i.answerText, studentAnswer: i.text || "(blank)" })),
      null,
      1,
    )}`,
    schema: gradeSchema,
    temperature: 0.2,
    thinking: "low",
  });
  return new Map(data.results.map((r) => [r.id, { score: Math.min(1, Math.max(0, r.score)), feedback: r.feedback }]));
}

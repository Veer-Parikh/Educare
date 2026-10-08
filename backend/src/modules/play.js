import { Router } from "express";
import { z } from "zod";
import { parse } from "../lib/http.js";
import { generateText } from "../lib/gemini.js";
import { generateQuestions } from "../ai/quiz.js";
import { aiLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Tiny TTL cache: guide lines are short and repetitive, no need to spend quota every click.
const cache = new Map();
const TTL = 10 * 60 * 1000;
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = fn().then(
    (v) => v,
    (err) => {
      cache.delete(key);
      throw err;
    },
  );
  cache.set(key, { value, expires: Date.now() + TTL });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

router.post("/quick-quiz", aiLimiter, async (req, res) => {
  const { topic, facts, count } = parse(
    z.object({
      topic: z.string().trim().min(2).max(120),
      facts: z.array(z.string().max(400)).max(12).optional(),
      count: z.coerce.number().int().min(2).max(6).default(3),
    }),
    req.body,
  );
  const { questions } = await generateQuestions({
    label: topic,
    parts: facts?.length ? [{ text: `Key facts:\n- ${facts.join("\n- ")}` }] : [],
    count,
    difficulty: "mixed",
    types: ["mcq"],
    audience: "curious students aged 10-18; playful but accurate",
  });
  res.json({ questions });
});

const GUIDE_PROMPTS = {
  intro: () => "Give an enthusiastic one- or two-sentence welcome to a student about to explore the solar system in 3D.",
  planet: (t) => `Share one surprising, accurate fact about ${t} that most students don't know. One or two sentences.`,
  mission: (t) => `Brief a student on a mission to explore ${t}: mention one intriguing thing to look for. One or two sentences.`,
  complete: (t) => `Congratulate a student who just completed a mission to ${t || "a planet"} and invite them to try another. One sentence.`,
};

router.post("/guide", async (req, res) => {
  const { kind, target } = parse(
    z.object({ kind: z.enum(["intro", "planet", "mission", "complete"]), target: z.string().trim().max(60).optional() }),
    req.body,
  );
  const variant = Math.floor(Math.random() * 3);
  const text = await cached(`${kind}:${target ?? ""}:${variant}`, async () => {
    const r = await generateText({
      system: "You are Nova, a friendly AI space guide in an educational game. Keep replies under 200 characters, vivid and factually correct. No emojis.",
      prompt: GUIDE_PROMPTS[kind](target),
      temperature: 0.9,
      thinking: "off",
      timeoutMs: 20_000,
    });
    return r.text;
  });
  res.json({ text });
});

export default router;

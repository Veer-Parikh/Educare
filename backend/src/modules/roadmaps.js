import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { forbidden, notFound } from "../lib/errors.js";
import { parse, zOptText } from "../lib/http.js";
import { findOr404 } from "../lib/access.js";
import { generateJSON } from "../lib/gemini.js";
import { shortId } from "../lib/ids.js";
import { awardXp, XP } from "../lib/gamification.js";
import { aiLimiter } from "../middleware/rateLimit.js";

const router = Router();

const LEVELS = ["beginner", "intermediate", "advanced"];
const RESOURCE_TYPES = ["video", "article", "book", "course", "practice", "docs", "project"];

// Only well-known domains may carry direct links; everything else gets a search link in the UI.
const TRUSTED = /^(https:\/\/)(www\.)?(developer\.mozilla\.org|khanacademy\.org|youtube\.com|docs\.python\.org|react\.dev|nodejs\.org|w3schools\.com|freecodecamp\.org|coursera\.org|edx\.org|ocw\.mit\.edu|en\.wikipedia\.org|leetcode\.com|kaggle\.com|developer\.android\.com|learn\.microsoft\.com|docs\.oracle\.com|brilliant\.org|openstax\.org|ncert\.nic\.in|geeksforgeeks\.org|3blue1brown\.com|cs50\.harvard\.edu)(\/|$)/i;

const roadmapSchema = z.object({
  summary: z.string().describe("2-3 sentence overview of the path and what the learner will be able to do at the end."),
  milestones: z.array(
    z.object({
      week: z.number().int(),
      title: z.string(),
      description: z.string().describe("What to learn this week and why it matters, 1-2 sentences."),
      topics: z.array(z.string()).describe("3-6 concrete subtopics."),
      resources: z
        .array(
          z.object({
            title: z.string().describe("Name of a real, well-known resource (course, book, channel, docs page)."),
            type: z.enum(RESOURCE_TYPES),
            url: z.string().optional().describe("Only include if you are certain of the exact URL on a major site; otherwise omit."),
            note: z.string().optional(),
          }),
        )
        .describe("2-4 resources."),
      project: z.string().optional().describe("A small hands-on task or checkpoint for the week."),
    }),
  ),
});

router.post("/generate", aiLimiter, async (req, res) => {
  const input = parse(
    z.object({
      goal: z.string().trim().min(3, "What do you want to learn?").max(200),
      level: z.enum(LEVELS).default("beginner"),
      weeks: z.coerce.number().int().min(1).max(24).default(8),
      hoursPerWeek: z.coerce.number().int().min(1).max(60).default(5),
      context: zOptText(1000),
    }),
    req.body,
  );

  const { data } = await generateJSON({
    system:
      "You are a senior curriculum designer. You design realistic, well-sequenced learning roadmaps with prerequisites first, spaced practice, and a project every few weeks.",
    prompt: [
      `Goal: ${input.goal}`,
      `Current level: ${input.level}`,
      `Duration: ${input.weeks} weeks at about ${input.hoursPerWeek} hours per week — size each week to fit that time.`,
      input.context ? `Learner context: ${input.context}` : "",
      `Return exactly ${input.weeks} milestones, one per week, numbered from 1.`,
    ]
      .filter(Boolean)
      .join("\n"),
    schema: roadmapSchema,
    temperature: 0.5,
  });

  const milestones = data.milestones.slice(0, input.weeks).map((m, i) => ({
    id: shortId(),
    week: i + 1,
    title: m.title,
    description: m.description,
    topics: m.topics.slice(0, 8),
    resources: m.resources.slice(0, 5).map((r) => ({
      title: r.title,
      type: r.type,
      url: r.url && TRUSTED.test(r.url) ? r.url : null,
      note: r.note ?? null,
    })),
    project: m.project ?? null,
    done: false,
    completedAt: null,
  }));

  const roadmap = await prisma.roadmap.create({
    data: { userId: req.user.id, goal: input.goal, level: input.level, weeks: input.weeks, hoursPerWeek: input.hoursPerWeek, summary: data.summary, milestones },
  });
  res.status(201).json({ roadmap });
});

const withProgress = (r) => ({
  ...r,
  progress: r.milestones.length ? r.milestones.filter((m) => m.done).length / r.milestones.length : 0,
});

router.get("/", async (req, res) => {
  const roadmaps = await prisma.roadmap.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: "desc" }, take: 50 });
  res.json({ roadmaps: roadmaps.map(withProgress) });
});

async function ownRoadmap(id, user) {
  const roadmap = await findOr404(prisma.roadmap, id, "Roadmap");
  if (roadmap.userId !== user.id) throw forbidden();
  return roadmap;
}

router.get("/:id", async (req, res) => {
  res.json({ roadmap: withProgress(await ownRoadmap(req.params.id, req.user)) });
});

router.patch("/:id/milestones/:milestoneId", async (req, res) => {
  const roadmap = await ownRoadmap(req.params.id, req.user);
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  const target = roadmap.milestones.find((m) => m.id === req.params.milestoneId);
  if (!target) throw notFound("Milestone");

  const firstCompletion = done && !target.done && !target.completedAt;
  const milestones = roadmap.milestones.map((m) =>
    m.id === target.id ? { ...m, done, completedAt: done ? (m.completedAt ?? new Date()) : m.completedAt } : m,
  );
  const updated = await prisma.roadmap.update({ where: { id: roadmap.id }, data: { milestones: { set: milestones } } });
  const reward = firstCompletion ? await awardXp(req.user.id, "roadmap", XP.roadmapMilestone, { tz: req.tz, meta: { roadmapId: roadmap.id } }) : null;
  res.json({ roadmap: withProgress(updated), reward });
});

router.delete("/:id", async (req, res) => {
  await ownRoadmap(req.params.id, req.user);
  await prisma.roadmap.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;

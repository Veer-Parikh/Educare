import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { parse, zOptText } from "../lib/http.js";
import { dayKey, lastNDays } from "../lib/dates.js";
import { awardXp, currentStreak, levelFor, XP } from "../lib/gamification.js";

const router = Router();

router.post("/focus", async (req, res) => {
  const { minutes, label } = parse(z.object({ minutes: z.coerce.number().int().min(1).max(240), label: zOptText(80) }), req.body);
  const reward = await awardXp(req.user.id, "focus", Math.min(minutes, XP.focusMaxPerSession) * XP.focusPerMinute, {
    tz: req.tz,
    minutes,
    meta: label ? { label } : undefined,
  });
  res.status(201).json({ reward });
});

router.post("/game", async (req, res) => {
  const { game, score, total } = parse(
    z.object({ game: z.string().trim().max(40), score: z.coerce.number().int().min(0).max(50), total: z.coerce.number().int().min(1).max(50) }),
    req.body,
  );
  const reward = await awardXp(req.user.id, "game", XP.gameBase + XP.gamePerCorrect * Math.min(score, total), {
    tz: req.tz,
    meta: { game, score, total },
    dailyCap: XP.gameDailyCap,
  });
  res.status(201).json({ reward });
});

router.get("/summary", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 120, 7), 366);
  const keys = lastNDays(days, req.tz);
  const activities = await prisma.activity.findMany({
    where: { userId: req.user.id, day: { gte: keys[0] } },
    select: { day: true, xp: true, type: true, minutes: true },
  });

  const byDay = new Map(keys.map((k) => [k, { day: k, xp: 0, focusMinutes: 0 }]));
  const byType = {};
  for (const a of activities) {
    const d = byDay.get(a.day);
    if (d) {
      d.xp += a.xp;
      d.focusMinutes += a.minutes ?? 0;
    }
    byType[a.type] = (byType[a.type] ?? 0) + a.xp;
  }

  const today = dayKey(new Date(), req.tz);
  const week = keys.slice(-7);
  const series = [...byDay.values()];
  res.json({
    xp: req.user.xp,
    level: levelFor(req.user.xp),
    streak: currentStreak(req.user, req.tz),
    longestStreak: req.user.longestStreak,
    dailyGoalXp: req.user.dailyGoalXp,
    todayXp: byDay.get(today)?.xp ?? 0,
    weekXp: week.reduce((s, k) => s + (byDay.get(k)?.xp ?? 0), 0),
    weekFocusMinutes: week.reduce((s, k) => s + (byDay.get(k)?.focusMinutes ?? 0), 0),
    activeDays: series.filter((d) => d.xp > 0).length,
    days: series,
    byType,
  });
});

export default router;

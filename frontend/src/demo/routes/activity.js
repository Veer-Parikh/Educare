// Port of backend/src/modules/activity.js.
import { awardXp, badRequest, currentStreak, dayKey, db, lastNDays, levelFor, optText, XP } from "../core.js";
import { route } from "../router.js";

/** z.coerce.number().int().min(lo).max(hi) */
function int(v, path, lo, hi) {
  const n = Number(v);
  if (v === undefined || v === null || Number.isNaN(n)) throw badRequest(`${path}: Expected number, received nan`);
  if (!Number.isInteger(n)) throw badRequest(`${path}: Expected integer, received float`);
  if (n < lo) throw badRequest(`${path}: Number must be greater than or equal to ${lo}`);
  if (n > hi) throw badRequest(`${path}: Number must be less than or equal to ${hi}`);
  return n;
}

route("POST", "/activity/focus", (req) => {
  const b = req.body ?? {};
  const minutes = int(b.minutes, "minutes", 1, 240);
  const label = optText(b.label);
  if (label !== undefined && (typeof label !== "string" || label.length > 80)) throw badRequest("label: String must contain at most 80 character(s)");
  const reward = awardXp(req.user.id, "focus", Math.min(minutes, XP.focusMaxPerSession) * XP.focusPerMinute, {
    tz: req.tz,
    minutes,
    meta: label ? { label } : undefined,
  });
  return { reward };
});

route("POST", "/activity/game", (req) => {
  const b = req.body ?? {};
  if (typeof b.game !== "string") throw badRequest("game: Required");
  const game = b.game.trim();
  if (game.length > 40) throw badRequest("game: String must contain at most 40 character(s)");
  const score = int(b.score, "score", 0, 50);
  const total = int(b.total, "total", 1, 50);
  const reward = awardXp(req.user.id, "game", XP.gameBase + XP.gamePerCorrect * Math.min(score, total), {
    tz: req.tz,
    meta: { game, score, total },
    dailyCap: XP.gameDailyCap,
  });
  return { reward };
});

route("GET", "/activity/summary", (req) => {
  const days = Math.min(Math.max(Number(req.query.days) || 120, 7), 366);
  const keys = lastNDays(days, req.tz);
  const activities = db.activities.filter((a) => a.userId === req.user.id && a.day >= keys[0]);

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
  return {
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
  };
});

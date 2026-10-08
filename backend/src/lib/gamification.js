import { prisma } from "./prisma.js";
import { dayDiff, dayKey } from "./dates.js";

export const XP = {
  review: 2,
  quizBase: 10,
  quizPerCorrect: 2,
  submit: 20,
  submitOnTimeBonus: 10,
  focusPerMinute: 1,
  focusMaxPerSession: 120,
  tutorMessage: 1,
  tutorDailyCap: 20,
  studio: 15,
  roadmapMilestone: 20,
  gameBase: 5,
  gamePerCorrect: 2,
  gameDailyCap: 60,
};

/** Streak as the user would see it today (0 if they missed yesterday). */
export function currentStreak(user, tz) {
  if (!user.lastActiveDay) return 0;
  const gap = dayDiff(user.lastActiveDay, dayKey(new Date(), tz));
  return gap <= 1 ? user.streak : 0;
}

export async function xpToday(userId, tz, type) {
  const agg = await prisma.activity.aggregate({
    where: { userId, day: dayKey(new Date(), tz), ...(type ? { type } : {}) },
    _sum: { xp: true },
  });
  return agg._sum.xp ?? 0;
}

/**
 * Record an XP-earning action and advance the user's streak.
 * With `aggregate`, repeated same-day actions (card reviews, tutor messages)
 * accumulate into one ledger row instead of one row each.
 * @returns {Promise<{ xp: number, streak: number, leveledStreak: boolean }>}
 */
export async function awardXp(userId, type, xp, { tz = "UTC", minutes, meta, aggregate = false, dailyCap } = {}) {
  const day = dayKey(new Date(), tz);
  let amount = Math.max(0, Math.round(xp));

  if (dailyCap) {
    const earned = await xpToday(userId, tz, type);
    amount = Math.max(0, Math.min(amount, dailyCap - earned));
  }

  if (aggregate) {
    const existing = await prisma.activity.findFirst({ where: { userId, day, type }, select: { id: true, meta: true } });
    if (existing) {
      const count = (existing.meta?.count ?? 1) + 1;
      await prisma.activity.update({
        where: { id: existing.id },
        data: { xp: { increment: amount }, meta: { ...(existing.meta ?? {}), count } },
      });
    } else {
      await prisma.activity.create({ data: { userId, type, xp: amount, day, meta: { count: 1, ...(meta ?? {}) } } });
    }
  } else {
    await prisma.activity.create({ data: { userId, type, xp: amount, day, minutes, meta } });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streak: true, longestStreak: true, lastActiveDay: true },
  });

  let streak = user.streak;
  let leveledStreak = false;
  if (user.lastActiveDay !== day) {
    streak = user.lastActiveDay && dayDiff(user.lastActiveDay, day) === 1 ? user.streak + 1 : 1;
    leveledStreak = true;
    // Guarded so two concurrent awards on a new day only advance the streak once.
    await prisma.user.updateMany({
      // Prisma's NOT is null-safe (skips unset fields), so match "never active" explicitly.
      where: { id: userId, OR: [{ lastActiveDay: { isSet: false } }, { lastActiveDay: null }, { NOT: { lastActiveDay: day } }] },
      data: { streak, lastActiveDay: day, longestStreak: Math.max(user.longestStreak, streak) },
    });
  }
  if (amount > 0) await prisma.user.update({ where: { id: userId }, data: { xp: { increment: amount } } });

  return { xp: amount, streak, leveledStreak };
}

/** Level curve: each level needs 20% more XP than the previous, starting at 100. */
export function levelFor(totalXp) {
  let level = 1;
  let need = 100;
  let remaining = totalXp;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = Math.round(need * 1.2);
  }
  return { level, into: remaining, next: need };
}

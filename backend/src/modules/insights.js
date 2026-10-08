import { Router } from "express";
import { prisma, userSummary } from "../lib/prisma.js";
import { classAccess } from "../lib/access.js";
import { generateText } from "../lib/gemini.js";
import { dayKey } from "../lib/dates.js";
import { currentStreak } from "../lib/gamification.js";
import { teacherOnly } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";

// Mounted at /classes/:classId
const router = Router({ mergeParams: true });

const DAY = 86_400_000;
const pct = (n) => (n == null ? null : Math.round(n * 1000) / 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function loadClassData(classroomId) {
  const [memberships, assignments, quizzes] = await Promise.all([
    prisma.membership.findMany({ where: { classroomId }, include: { user: userSummary } }),
    prisma.assignment.findMany({ where: { classroomId }, select: { id: true, title: true, dueAt: true, points: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.quiz.findMany({ where: { classroomId, published: true }, select: { id: true, title: true, questions: true, createdAt: true } }),
  ]);
  const studentIds = memberships.map((m) => m.userId);
  const [submissions, attempts, lastActivity] = await Promise.all([
    prisma.submission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) } },
      select: { studentId: true, assignmentId: true, status: true, score: true, late: true, submittedAt: true },
    }),
    prisma.quizAttempt.findMany({
      where: { quizId: { in: quizzes.map((q) => q.id) }, userId: { in: studentIds } },
      select: { userId: true, quizId: true, score: true, maxScore: true, answers: true, completedAt: true },
    }),
    prisma.activity.groupBy({ by: ["userId"], where: { userId: { in: studentIds } }, _max: { createdAt: true } }),
  ]);
  return { memberships, assignments, quizzes, submissions, attempts, lastActivity };
}

/** Best attempt per (user, quiz). */
function bestAttempts(attempts) {
  const best = new Map();
  for (const a of attempts) {
    const key = `${a.userId}:${a.quizId}`;
    const cur = best.get(key);
    if (!cur || a.score / a.maxScore > cur.score / cur.maxScore) best.set(key, a);
  }
  return [...best.values()];
}

export async function computeInsights(classroomId) {
  const d = await loadClassData(classroomId);
  const now = Date.now();
  const pastDue = d.assignments.filter((a) => a.dueAt && a.dueAt.getTime() < now);
  const subKey = new Map(d.submissions.map((s) => [`${s.studentId}:${s.assignmentId}`, s]));
  const pointsOf = new Map(d.assignments.map((a) => [a.id, a.points]));
  const best = bestAttempts(d.attempts);
  const lastAct = new Map(d.lastActivity.map((r) => [r.userId, r._max.createdAt]));

  const students = d.memberships.map(({ user, joinedAt }) => {
    const subs = d.submissions.filter((s) => s.studentId === user.id);
    const graded = subs.filter((s) => s.status === "graded" && s.score != null && pointsOf.get(s.assignmentId));
    const missing = pastDue.filter((a) => !subKey.has(`${user.id}:${a.id}`) && a.dueAt > joinedAt).length;
    const late = subs.filter((s) => s.late).length;
    const avg = mean(graded.map((s) => s.score / pointsOf.get(s.assignmentId)));
    const quizAvg = mean(best.filter((a) => a.userId === user.id).map((a) => a.score / a.maxScore));
    const lastSeen = [lastAct.get(user.id), ...subs.map((s) => s.submittedAt)].filter(Boolean).sort((a, b) => b - a)[0] ?? null;
    const idleDays = lastSeen ? Math.floor((now - new Date(lastSeen).getTime()) / DAY) : null;

    const reasons = [];
    if (missing >= 2) reasons.push(`Missing ${missing} assignments`);
    if (avg != null && avg < 0.5 && graded.length >= 2) reasons.push(`Averaging ${pct(avg)}%`);
    if (quizAvg != null && quizAvg < 0.5) reasons.push(`Quiz average ${pct(quizAvg)}%`);
    if (idleDays == null ? now - joinedAt.getTime() > 14 * DAY : idleDays >= 14) reasons.push(idleDays == null ? "No activity yet" : `Inactive for ${idleDays} days`);
    if (late >= 3) reasons.push(`${late} late submissions`);
    const risk = reasons.length >= 2 || missing >= 3 ? "high" : reasons.length === 1 ? "medium" : "low";

    return {
      student: user,
      submitted: subs.length,
      missing,
      late,
      averagePct: pct(avg),
      quizAveragePct: pct(quizAvg),
      lastActiveAt: lastSeen,
      risk,
      reasons,
    };
  });

  const assignments = d.assignments.map((a) => {
    const subs = d.submissions.filter((s) => s.assignmentId === a.id);
    const graded = subs.filter((s) => s.status === "graded" && s.score != null);
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      submitted: subs.length,
      graded: graded.length,
      late: subs.filter((s) => s.late).length,
      // Only students who were enrolled before the deadline can be "missing" it.
      missing:
        a.dueAt && a.dueAt.getTime() < now
          ? d.memberships.filter((m) => m.joinedAt < a.dueAt && !subKey.has(`${m.userId}:${a.id}`)).length
          : null,
      averagePct: pct(a.points ? mean(graded.map((s) => s.score / a.points)) : null),
    };
  });

  // Concept & question difficulty from class quizzes.
  const conceptAgg = new Map();
  const questionAgg = new Map();
  const quizById = new Map(d.quizzes.map((q) => [q.id, q]));
  for (const att of best) {
    const quiz = quizById.get(att.quizId);
    quiz?.questions.forEach((q, i) => {
      const ans = att.answers[i];
      if (!ans) return;
      const qa = questionAgg.get(q.id) ?? { quizTitle: quiz.title, prompt: q.prompt, concept: q.concept, correct: 0, total: 0 };
      qa.total += 1;
      if (ans.correct) qa.correct += 1;
      questionAgg.set(q.id, qa);
      if (q.concept) {
        const key = q.concept.trim().toLowerCase();
        const ca = conceptAgg.get(key) ?? { concept: q.concept.trim(), correct: 0, total: 0 };
        ca.total += 1;
        if (ans.correct) ca.correct += 1;
        conceptAgg.set(key, ca);
      }
    });
  }
  const weakConcepts = [...conceptAgg.values()]
    .filter((c) => c.total >= 2)
    .map((c) => ({ ...c, accuracyPct: pct(c.correct / c.total) }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct)
    .slice(0, 8);
  const hardestQuestions = [...questionAgg.values()]
    .filter((q) => q.total >= 2)
    .map((q) => ({ ...q, correctPct: pct(q.correct / q.total) }))
    .sort((a, b) => a.correctPct - b.correctPct)
    .slice(0, 6);

  const expected = pastDue.reduce(
    (s, a) => s + d.memberships.filter((m) => m.joinedAt < a.dueAt).length,
    0,
  );
  const deliveredPastDue = d.submissions.filter((s) => pastDue.some((a) => a.id === s.assignmentId));
  const avgs = students.map((s) => s.averagePct).filter((v) => v != null);

  return {
    summary: {
      students: d.memberships.length,
      assignments: d.assignments.length,
      quizzes: d.quizzes.length,
      averagePct: avgs.length ? Math.round(mean(avgs) * 10) / 10 : null,
      submissionRatePct: expected ? pct(Math.min(1, deliveredPastDue.length / expected)) : null,
      onTimeRatePct: deliveredPastDue.length ? pct(deliveredPastDue.filter((s) => !s.late).length / deliveredPastDue.length) : null,
      atRisk: students.filter((s) => s.risk === "high").length,
      watch: students.filter((s) => s.risk === "medium").length,
    },
    distribution: [
      { band: "< 50%", count: avgs.filter((v) => v < 50).length },
      { band: "50–69%", count: avgs.filter((v) => v >= 50 && v < 70).length },
      { band: "70–84%", count: avgs.filter((v) => v >= 70 && v < 85).length },
      { band: "85%+", count: avgs.filter((v) => v >= 85).length },
    ],
    students: students.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.risk] - ({ high: 0, medium: 1, low: 2 })[b.risk]),
    assignments,
    weakConcepts,
    hardestQuestions,
  };
}

router.get("/insights", teacherOnly, async (req, res) => {
  await classAccess(req.params.classId, req.user, { teacher: true });
  res.json(await computeInsights(req.params.classId));
});

router.post("/insights/summary", teacherOnly, aiLimiter, async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const insights = await computeInsights(classroom.id);
  const compact = {
    class: classroom.name,
    subject: classroom.subject,
    summary: insights.summary,
    assignments: insights.assignments.map(({ title, submitted, graded, missing, averagePct }) => ({ title, submitted, graded, missing, averagePct })),
    studentsNeedingAttention: insights.students.filter((s) => s.risk !== "low").map((s) => ({ name: s.student.name, risk: s.risk, reasons: s.reasons, averagePct: s.averagePct })),
    weakConcepts: insights.weakConcepts,
    hardestQuestions: insights.hardestQuestions.map(({ prompt, correctPct, concept }) => ({ prompt: prompt.slice(0, 160), correctPct, concept })),
  };
  const { text } = await generateText({
    system:
      "You are an instructional coach helping a teacher act on class data. Be concrete, kind and brief. Base every claim on the data given; if data is thin, say what to collect next.",
    prompt: `Write a short briefing in markdown with these sections:\n### Snapshot\n### Who needs attention\n### Reteach next\n### Suggested actions this week\nUse bullet points. Max 220 words.\n\nDATA:\n${JSON.stringify(compact)}`,
    temperature: 0.4,
  });
  res.json({ summary: text, generatedAt: new Date() });
});

router.get("/gradebook", teacherOnly, async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const d = await loadClassData(classroom.id);
  const best = bestAttempts(d.attempts);
  const now = Date.now();
  const rows = d.memberships
    .map(({ user }) => {
      const cells = d.assignments.map((a) => {
        const s = d.submissions.find((x) => x.studentId === user.id && x.assignmentId === a.id);
        const status = s ? (s.status === "graded" ? "graded" : s.late ? "late" : "submitted") : a.dueAt && a.dueAt.getTime() < now ? "missing" : "assigned";
        return { assignmentId: a.id, score: s?.score ?? null, status };
      });
      const quizCells = d.quizzes.map((q) => {
        const b = best.find((x) => x.userId === user.id && x.quizId === q.id);
        return { quizId: q.id, pct: b ? pct(b.score / b.maxScore) : null };
      });
      const graded = cells.filter((c) => c.score != null);
      const totalPts = graded.reduce((s, c) => s + (d.assignments.find((a) => a.id === c.assignmentId)?.points ?? 0), 0);
      return {
        student: user,
        cells,
        quizCells,
        averagePct: totalPts ? pct(graded.reduce((s, c) => s + c.score, 0) / totalPts) : null,
      };
    })
    .sort((a, b) => a.student.name.localeCompare(b.student.name));
  res.json({
    assignments: d.assignments,
    quizzes: d.quizzes.map(({ id, title }) => ({ id, title })),
    rows,
  });
});

router.get("/leaderboard", async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user);
  const period = ["week", "month", "all"].includes(req.query.period) ? req.query.period : "week";
  const members = await prisma.membership.findMany({ where: { classroomId: classroom.id }, include: { user: { select: { ...userSummary.select, xp: true, streak: true, lastActiveDay: true } } } });
  const ids = members.map((m) => m.userId);

  let xpBy;
  if (period === "all") {
    xpBy = new Map(members.map((m) => [m.userId, m.user.xp]));
  } else {
    const since = dayKey(new Date(Date.now() - (period === "week" ? 6 : 29) * DAY), req.tz);
    const rows = await prisma.activity.groupBy({ by: ["userId"], where: { userId: { in: ids }, day: { gte: since } }, _sum: { xp: true } });
    xpBy = new Map(rows.map((r) => [r.userId, r._sum.xp ?? 0]));
  }
  const ranked = members
    .map((m) => ({ user: { id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl }, xp: xpBy.get(m.userId) ?? 0, streak: currentStreak(m.user, req.tz) }))
    .sort((a, b) => b.xp - a.xp || a.user.name.localeCompare(b.user.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  res.json({ period, leaderboard: ranked.slice(0, 25), me: ranked.find((r) => r.user.id === req.user.id) ?? null });
});

export default router;

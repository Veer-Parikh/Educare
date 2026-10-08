// Port of backend/src/modules/insights.js (mounted at /classes/:classId).
import { DAY, byId, classAccess, currentStreak, dayKey, db, pickUser, requireRole, userSummary } from "../core.js";
import { route } from "../router.js";
import { think } from "../ai.js";

const pct = (n) => (n == null ? null : Math.round(n * 1000) / 10);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function loadClassData(classroomId) {
  const memberships = db.memberships.filter((m) => m.classroomId === classroomId).map((m) => ({ ...m, user: userSummary(byId("users", m.userId)) }));
  const assignments = db.assignments
    .filter((a) => a.classroomId === classroomId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, title, dueAt, points, createdAt }) => ({ id, title, dueAt, points, createdAt }));
  const quizzes = db.quizzes.filter((q) => q.classroomId === classroomId && q.published).map(({ id, title, questions, createdAt }) => ({ id, title, questions, createdAt }));
  const studentIds = new Set(memberships.map((m) => m.userId));
  const assignmentIds = new Set(assignments.map((a) => a.id));
  const quizIds = new Set(quizzes.map((q) => q.id));

  const submissions = db.submissions
    .filter((s) => assignmentIds.has(s.assignmentId))
    .map(({ studentId, assignmentId, status, score, late, submittedAt }) => ({ studentId, assignmentId, status, score, late, submittedAt }));
  const attempts = db.quizAttempts
    .filter((a) => quizIds.has(a.quizId) && studentIds.has(a.userId))
    .map(({ userId, quizId, score, maxScore, answers, completedAt }) => ({ userId, quizId, score, maxScore, answers, completedAt }));
  const latest = new Map();
  for (const a of db.activities) {
    if (!studentIds.has(a.userId)) continue;
    const cur = latest.get(a.userId);
    if (!cur || a.createdAt > cur) latest.set(a.userId, a.createdAt);
  }
  const lastActivity = [...latest].map(([userId, createdAt]) => ({ userId, _max: { createdAt } }));
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

export function computeInsights(classroomId) {
  const d = loadClassData(classroomId);
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

    return { student: user, submitted: subs.length, missing, late, averagePct: pct(avg), quizAveragePct: pct(quizAvg), lastActiveAt: lastSeen, risk, reasons };
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
      missing: a.dueAt && a.dueAt.getTime() < now ? d.memberships.filter((m) => m.joinedAt < a.dueAt && !subKey.has(`${m.userId}:${a.id}`)).length : null,
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
      const qa = questionAgg.get(q.id) ?? { quizTitle: quiz.title, prompt: q.prompt, concept: q.concept ?? null, correct: 0, total: 0 };
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

  const expected = pastDue.reduce((s, a) => s + d.memberships.filter((m) => m.joinedAt < a.dueAt).length, 0);
  const deliveredPastDue = d.submissions.filter((s) => pastDue.some((a) => a.id === s.assignmentId));
  const avgs = students.map((s) => s.averagePct).filter((v) => v != null);
  const riskOrder = { high: 0, medium: 1, low: 2 };

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
    students: students.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]),
    assignments,
    weakConcepts,
    hardestQuestions,
  };
}

/** Simulated coaching briefing in the markdown format the backend prompt asks for. */
function briefing(classroom, insights) {
  const s = insights.summary;
  const first = (name) => name.split(" ")[0];
  const flagged = insights.students.filter((x) => x.risk !== "low");
  const toGrade = insights.assignments.reduce((n, a) => n + (a.submitted - a.graded), 0);
  const worstMissing = [...insights.assignments].filter((a) => a.missing).sort((a, b) => b.missing - a.missing)[0];
  const weak = insights.weakConcepts.slice(0, 3);
  const hard = insights.hardestQuestions[0];

  const snapshot = [
    `- ${plural(s.students, "student")}, ${plural(s.assignments, "assignment")} and ${plural(s.quizzes, "published quiz", "published quizzes")} in **${classroom.name}**.`,
    s.averagePct != null ? `- Class average on graded work is **${s.averagePct}%**${s.averagePct >= 75 ? " — a healthy baseline." : s.averagePct >= 60 ? " — steady, with room to lift." : " — below where we'd like it."}` : "- No graded work yet, so there's no class average to report.",
    s.submissionRatePct != null ? `- Submission rate on past-due work: **${s.submissionRatePct}%**${s.onTimeRatePct != null ? `, with ${s.onTimeRatePct}% on time` : ""}.` : "- No assignments are past due yet, so submission rates will appear soon.",
  ];

  const attention = flagged.length
    ? flagged.slice(0, 4).map((x) => `- **${x.student.name}** (${x.risk === "high" ? "at risk" : "watch"}): ${x.reasons.join("; ").toLowerCase() || "trending down"}${x.averagePct != null && !x.reasons.some((r) => r.startsWith("Averaging")) ? ` · average ${x.averagePct}%` : ""}.`)
    : ["- No one is flagged right now. Keep an eye on late submissions as deadlines land."];
  if (flagged.length > 4) attention.push(`- Plus ${flagged.length - 4} more on the watch list.`);

  const reteach = weak.length
    ? weak.map((c) => `- **${c.concept}** — ${c.accuracyPct}% accuracy across ${c.total} answers.`)
    : ["- Not enough quiz data yet. Publish a short check-for-understanding quiz to see which concepts need reteaching."];
  if (hard) reteach.push(`- Hardest question: _"${hard.prompt.slice(0, 120)}"_ (${hard.correctPct}% correct${hard.concept ? `, ${hard.concept}` : ""}).`);

  const actions = [];
  if (toGrade > 0) actions.push(`- Grade the **${plural(toGrade, "submission")}** waiting — AI draft grading can speed this up.`);
  const high = flagged.filter((x) => x.risk === "high");
  if (high.length) actions.push(`- Check in 1:1 with ${high.slice(0, 3).map((x) => first(x.student.name)).join(", ")} this week and agree one small, concrete next step.`);
  if (weak[0]) actions.push(`- Open the next lesson with a 5-minute retrieval quiz on **${weak[0].concept}**, then a worked example.`);
  if (worstMissing) actions.push(`- Send a reminder about **${worstMissing.title}** (${worstMissing.missing} missing) and offer a short extension window.`);
  if (actions.length < 3) actions.push("- Post a quick exit-ticket quiz after your next lesson to collect fresh data.");

  return [`### Snapshot`, ...snapshot, ``, `### Who needs attention`, ...attention, ``, `### Reteach next`, ...reteach, ``, `### Suggested actions this week`, ...actions.slice(0, 4)].join("\n");
}

route("GET", "/classes/:classId/insights", (req) => {
  requireRole(req.user, "TEACHER");
  classAccess(req.params.classId, req.user, { teacher: true });
  return computeInsights(req.params.classId);
});

route("POST", "/classes/:classId/insights/summary", async (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const insights = computeInsights(classroom.id);
  await think(1200, 2200);
  return { summary: briefing(classroom, insights), generatedAt: new Date() };
});

route("GET", "/classes/:classId/gradebook", (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const d = loadClassData(classroom.id);
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
      return { student: user, cells, quizCells, averagePct: totalPts ? pct(graded.reduce((s, c) => s + c.score, 0) / totalPts) : null };
    })
    .sort((a, b) => a.student.name.localeCompare(b.student.name));
  return { assignments: d.assignments, quizzes: d.quizzes.map(({ id, title }) => ({ id, title })), rows };
});

route("GET", "/classes/:classId/leaderboard", (req) => {
  const { classroom } = classAccess(req.params.classId, req.user);
  const period = ["week", "month", "all"].includes(req.query.period) ? req.query.period : "week";
  const members = db.memberships.filter((m) => m.classroomId === classroom.id).map((m) => ({ ...m, user: byId("users", m.userId) }));

  let xpBy;
  if (period === "all") {
    xpBy = new Map(members.map((m) => [m.userId, m.user.xp]));
  } else {
    const since = dayKey(new Date(Date.now() - (period === "week" ? 6 : 29) * DAY), req.tz);
    const ids = new Set(members.map((m) => m.userId));
    xpBy = new Map();
    for (const a of db.activities) if (ids.has(a.userId) && a.day >= since) xpBy.set(a.userId, (xpBy.get(a.userId) ?? 0) + (a.xp ?? 0));
  }
  const ranked = members
    .map((m) => ({ user: pickUser(m.user), xp: xpBy.get(m.userId) ?? 0, streak: currentStreak(m.user, req.tz) }))
    .sort((a, b) => b.xp - a.xp || a.user.name.localeCompare(b.user.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { period, leaderboard: ranked.slice(0, 25), me: ranked.find((r) => r.user.id === req.user.id) ?? null };
});

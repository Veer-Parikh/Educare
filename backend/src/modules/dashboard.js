import { Router } from "express";
import { prisma, userSummary } from "../lib/prisma.js";
import { myClassIds } from "../lib/access.js";
import { currentStreak, levelFor, xpToday } from "../lib/gamification.js";
import { studentStatus } from "./assignments.js";

const router = Router();
const DAY = 86_400_000;
const classSelect = { id: true, name: true, theme: true, subject: true };

async function studentDashboard(user, tz) {
  const classIds = await myClassIds(user);
  const now = new Date();

  const [assignments, sessions, dueCards, recentGrades, mastery, roadmap, publishedQuizzes, todayXp, classes] = await Promise.all([
    prisma.assignment.findMany({
      where: { classroomId: { in: classIds }, dueAt: { gte: new Date(now - 30 * DAY), lte: new Date(+now + 21 * DAY) } },
      include: { classroom: { select: classSelect } },
      orderBy: { dueAt: "asc" },
    }),
    prisma.liveSession.findMany({
      where: { classroomId: { in: classIds }, startsAt: { gte: new Date(now - 2 * 3600_000), lte: new Date(+now + 7 * DAY) } },
      include: { classroom: { select: classSelect } },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    prisma.card.count({ where: { ownerId: user.id, due: { lte: now } } }),
    prisma.submission.findMany({
      where: { studentId: user.id, status: "graded" },
      include: { assignment: { select: { id: true, title: true, points: true, classroom: { select: classSelect } } } },
      orderBy: { gradedAt: "desc" },
      take: 5,
      omit: { aiDraft: true },
    }),
    prisma.conceptMastery.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" }, take: 80 }),
    prisma.roadmap.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }),
    prisma.quiz.findMany({
      where: { published: true, classroomId: { in: classIds } },
      select: { id: true, title: true, dueAt: true, questions: { select: { id: true } }, classroom: { select: classSelect } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    xpToday(user.id, tz),
    prisma.classroom.findMany({ where: { id: { in: classIds }, archived: false }, select: { ...classSelect, teacher: userSummary }, take: 12 }),
  ]);

  const mySubs = await prisma.submission.findMany({
    where: { studentId: user.id, assignmentId: { in: assignments.map((a) => a.id) } },
    select: { assignmentId: true, status: true, late: true },
  });
  const subBy = new Map(mySubs.map((s) => [s.assignmentId, s]));
  const withStatus = assignments.map((a) => ({
    id: a.id,
    title: a.title,
    dueAt: a.dueAt,
    points: a.points,
    classroom: a.classroom,
    status: studentStatus(a, subBy.get(a.id)),
  }));

  const attempted = new Set(
    (
      await prisma.quizAttempt.findMany({
        where: { userId: user.id, quizId: { in: publishedQuizzes.map((q) => q.id) } },
        select: { quizId: true },
      })
    ).map((a) => a.quizId),
  );

  const weak = mastery
    .filter((m) => m.total && m.correct / m.total < 0.75)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 4)
    .map((m) => ({ concept: m.label, accuracy: m.correct / m.total, total: m.total }));

  let activeRoadmap = null;
  if (roadmap) {
    const next = roadmap.milestones.find((m) => !m.done);
    activeRoadmap = {
      id: roadmap.id,
      goal: roadmap.goal,
      progress: roadmap.milestones.length ? roadmap.milestones.filter((m) => m.done).length / roadmap.milestones.length : 0,
      next: next ? { id: next.id, week: next.week, title: next.title } : null,
    };
  }

  return {
    role: "STUDENT",
    stats: {
      xp: user.xp,
      level: levelFor(user.xp),
      streak: currentStreak(user, tz),
      longestStreak: user.longestStreak,
      todayXp,
      dailyGoalXp: user.dailyGoalXp,
      dueCards,
      classes: classIds.length,
    },
    upcoming: withStatus.filter((a) => a.status === "assigned" && a.dueAt >= now).slice(0, 8),
    overdue: withStatus.filter((a) => a.status === "missing").slice(-5).reverse(),
    sessions,
    recentGrades: recentGrades.map((s) => ({ id: s.id, score: s.score, gradedAt: s.gradedAt, assignment: s.assignment })),
    weakConcepts: weak,
    roadmap: activeRoadmap,
    pendingQuizzes: publishedQuizzes
      .filter((q) => !attempted.has(q.id))
      .slice(0, 5)
      .map((q) => ({ id: q.id, title: q.title, dueAt: q.dueAt, questionCount: q.questions.length, classroom: q.classroom })),
    classes,
  };
}

async function teacherDashboard(user, tz) {
  const classes = await prisma.classroom.findMany({
    where: { teacherId: user.id, archived: false },
    select: { ...classSelect, code: true, _count: { select: { members: true, assignments: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const classIds = classes.map((c) => c.id);
  const now = new Date();

  const [toGrade, toGradeCount, upcoming, sessions, students, recentAttempts] = await Promise.all([
    prisma.submission.findMany({
      where: { status: "submitted", assignment: { classroomId: { in: classIds } } },
      include: {
        student: userSummary,
        assignment: { select: { id: true, title: true, points: true, dueAt: true, classroom: { select: classSelect } } },
      },
      orderBy: { submittedAt: "asc" },
      take: 8,
      omit: { aiDraft: true },
    }),
    prisma.submission.count({ where: { status: "submitted", assignment: { classroomId: { in: classIds } } } }),
    prisma.assignment.findMany({
      where: { classroomId: { in: classIds }, dueAt: { gte: now, lte: new Date(+now + 14 * DAY) } },
      include: { classroom: { select: classSelect }, _count: { select: { submissions: true } } },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    prisma.liveSession.findMany({
      where: { classroomId: { in: classIds }, startsAt: { gte: new Date(now - 2 * 3600_000), lte: new Date(+now + 7 * DAY) } },
      include: { classroom: { select: classSelect } },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    prisma.membership.findMany({ where: { classroomId: { in: classIds } }, select: { userId: true } }),
    prisma.quizAttempt.count({ where: { quiz: { ownerId: user.id, published: true }, completedAt: { gte: new Date(now - 7 * DAY) } } }),
  ]);

  return {
    role: "TEACHER",
    stats: {
      classes: classes.length,
      students: new Set(students.map((s) => s.userId)).size,
      toGrade: toGradeCount,
      quizAttemptsThisWeek: recentAttempts,
      streak: currentStreak(user, tz),
    },
    classes,
    toGrade,
    upcoming: upcoming.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      classroom: a.classroom,
      submitted: a._count.submissions,
      students: classes.find((c) => c.id === a.classroomId)?._count.members ?? 0,
    })),
    sessions,
  };
}

router.get("/", async (req, res) => {
  res.json(req.user.role === "TEACHER" ? await teacherDashboard(req.user, req.tz) : await studentDashboard(req.user, req.tz));
});

/** Calendar feed: assignment deadlines, live sessions and quiz due dates. */
router.get("/agenda", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * DAY);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 35 * DAY);
  if (Number.isNaN(+from) || Number.isNaN(+to)) return res.json({ events: [] });
  const classIds = await myClassIds(req.user);

  const [assignments, sessions, quizzes] = await Promise.all([
    prisma.assignment.findMany({ where: { classroomId: { in: classIds }, dueAt: { gte: from, lte: to } }, include: { classroom: { select: classSelect } } }),
    prisma.liveSession.findMany({ where: { classroomId: { in: classIds }, startsAt: { gte: from, lte: to } }, include: { classroom: { select: classSelect } } }),
    prisma.quiz.findMany({ where: { classroomId: { in: classIds }, published: true, dueAt: { gte: from, lte: to } }, select: { id: true, title: true, dueAt: true, classroom: { select: classSelect } } }),
  ]);

  const events = [
    ...assignments.map((a) => ({ id: a.id, type: "assignment", title: a.title, at: a.dueAt, classroom: a.classroom, link: `/app/assignments/${a.id}` })),
    ...sessions.map((s) => ({ id: s.id, type: "session", title: s.title, at: s.startsAt, durationMin: s.durationMin, meetingUrl: s.meetingUrl, classroom: s.classroom, link: `/app/classes/${s.classroomId}/live` })),
    ...quizzes.map((q) => ({ id: q.id, type: "quiz", title: q.title, at: q.dueAt, classroom: q.classroom, link: `/app/quizzes/${q.id}` })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  res.json({ events });
});

export default router;

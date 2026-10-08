// Port of backend/src/modules/dashboard.js.
import { by, byId, currentStreak, DAY, db, levelFor, myClassIds, userSummary, xpToday } from "../core.js";
import { route } from "../router.js";

/** classSelect: { id, name, theme, subject } */
const classSel = (id) => {
  const c = byId("classrooms", id);
  return c ? { id: c.id, name: c.name, theme: c.theme, subject: c.subject ?? null } : null;
};

/** Same as backend assignments.js studentStatus (inlined to keep route files independent). */
function studentStatus(assignment, submission, now = new Date()) {
  if (submission?.status === "graded") return "graded";
  if (submission) return submission.late ? "late" : "submitted";
  if (assignment.dueAt && assignment.dueAt < now) return "missing";
  return "assigned";
}

const omitAiDraft = ({ aiDraft: _omit, ...rest }) => rest;
const inRange = (d, from, to) => d != null && d >= from && d <= to;

function studentDashboard(user, tz) {
  const classIds = myClassIds(user);
  const inClass = (r) => classIds.includes(r.classroomId);
  const now = new Date();

  const assignments = db.assignments
    .filter((a) => inClass(a) && inRange(a.dueAt, new Date(now - 30 * DAY), new Date(+now + 21 * DAY)))
    .sort(by("dueAt"));
  const sessions = db.liveSessions
    .filter((s) => inClass(s) && inRange(s.startsAt, new Date(now - 2 * 3600_000), new Date(+now + 7 * DAY)))
    .sort(by("startsAt"))
    .slice(0, 5)
    .map((s) => ({ ...s, classroom: classSel(s.classroomId) }));
  const dueCards = db.cards.filter((c) => c.ownerId === user.id && c.due <= now).length;
  const recentGrades = db.submissions
    .filter((s) => s.studentId === user.id && s.status === "graded")
    .sort(by("gradedAt", "desc"))
    .slice(0, 5);
  const mastery = db.conceptMastery.filter((m) => m.userId === user.id).sort(by("lastSeenAt", "desc")).slice(0, 80);
  const roadmap = db.roadmaps.filter((r) => r.userId === user.id).sort(by("updatedAt", "desc"))[0] ?? null;
  const publishedQuizzes = db.quizzes
    .filter((q) => q.published && inClass(q))
    .sort(by("createdAt", "desc"))
    .slice(0, 20);
  const todayXp = xpToday(user.id, tz);
  const classes = db.classrooms
    .filter((c) => classIds.includes(c.id) && !c.archived)
    .slice(0, 12)
    .map((c) => ({ ...classSel(c.id), teacher: userSummary(byId("users", c.teacherId)) }));

  const assignmentIds = new Set(assignments.map((a) => a.id));
  const subBy = new Map(db.submissions.filter((s) => s.studentId === user.id && assignmentIds.has(s.assignmentId)).map((s) => [s.assignmentId, s]));
  const withStatus = assignments.map((a) => ({
    id: a.id,
    title: a.title,
    dueAt: a.dueAt,
    points: a.points,
    classroom: classSel(a.classroomId),
    status: studentStatus(a, subBy.get(a.id)),
  }));

  const quizIds = new Set(publishedQuizzes.map((q) => q.id));
  const attempted = new Set(db.quizAttempts.filter((a) => a.userId === user.id && quizIds.has(a.quizId)).map((a) => a.quizId));

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
    recentGrades: recentGrades.map((s) => {
      const a = byId("assignments", s.assignmentId);
      return {
        id: s.id,
        score: s.score,
        gradedAt: s.gradedAt,
        assignment: a ? { id: a.id, title: a.title, points: a.points, classroom: classSel(a.classroomId) } : null,
      };
    }),
    weakConcepts: weak,
    roadmap: activeRoadmap,
    pendingQuizzes: publishedQuizzes
      .filter((q) => !attempted.has(q.id))
      .slice(0, 5)
      .map((q) => ({ id: q.id, title: q.title, dueAt: q.dueAt, questionCount: q.questions.length, classroom: classSel(q.classroomId) })),
    classes,
  };
}

function teacherDashboard(user, tz) {
  const classes = db.classrooms
    .filter((c) => c.teacherId === user.id && !c.archived)
    .sort(by("updatedAt", "desc"))
    .map((c) => ({
      ...classSel(c.id),
      code: c.code,
      _count: {
        members: db.memberships.filter((m) => m.classroomId === c.id).length,
        assignments: db.assignments.filter((a) => a.classroomId === c.id).length,
      },
    }));
  const classIds = classes.map((c) => c.id);
  const now = new Date();

  const classAssignments = new Map(db.assignments.filter((a) => classIds.includes(a.classroomId)).map((a) => [a.id, a]));
  const pending = db.submissions.filter((s) => s.status === "submitted" && classAssignments.has(s.assignmentId));
  const toGrade = [...pending]
    .sort(by("submittedAt"))
    .slice(0, 8)
    .map((s) => {
      const a = classAssignments.get(s.assignmentId);
      return {
        ...omitAiDraft(s),
        student: userSummary(byId("users", s.studentId)),
        assignment: { id: a.id, title: a.title, points: a.points, dueAt: a.dueAt, classroom: classSel(a.classroomId) },
      };
    });
  const upcoming = [...classAssignments.values()]
    .filter((a) => inRange(a.dueAt, now, new Date(+now + 14 * DAY)))
    .sort(by("dueAt"))
    .slice(0, 8);
  const sessions = db.liveSessions
    .filter((s) => classIds.includes(s.classroomId) && inRange(s.startsAt, new Date(now - 2 * 3600_000), new Date(+now + 7 * DAY)))
    .sort(by("startsAt"))
    .slice(0, 5)
    .map((s) => ({ ...s, classroom: classSel(s.classroomId) }));
  const students = new Set(db.memberships.filter((m) => classIds.includes(m.classroomId)).map((m) => m.userId));
  const myPublished = new Set(db.quizzes.filter((q) => q.ownerId === user.id && q.published).map((q) => q.id));
  const weekAgo = new Date(now - 7 * DAY);
  const recentAttempts = db.quizAttempts.filter((a) => myPublished.has(a.quizId) && a.completedAt >= weekAgo).length;

  return {
    role: "TEACHER",
    stats: {
      classes: classes.length,
      students: students.size,
      toGrade: pending.length,
      quizAttemptsThisWeek: recentAttempts,
      streak: currentStreak(user, tz),
    },
    classes,
    toGrade,
    upcoming: upcoming.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      classroom: classSel(a.classroomId),
      submitted: db.submissions.filter((s) => s.assignmentId === a.id).length,
      students: classes.find((c) => c.id === a.classroomId)?._count.members ?? 0,
    })),
    sessions,
  };
}

route("GET", "/dashboard", (req) => (req.user.role === "TEACHER" ? teacherDashboard(req.user, req.tz) : studentDashboard(req.user, req.tz)));

/** Calendar feed: assignment deadlines, live sessions and quiz due dates. */
route("GET", "/dashboard/agenda", (req) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * DAY);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 35 * DAY);
  if (Number.isNaN(+from) || Number.isNaN(+to)) return { events: [] };
  const classIds = myClassIds(req.user);
  const inClass = (r) => classIds.includes(r.classroomId);

  const assignments = db.assignments.filter((a) => inClass(a) && inRange(a.dueAt, from, to));
  const sessions = db.liveSessions.filter((s) => inClass(s) && inRange(s.startsAt, from, to));
  const quizzes = db.quizzes.filter((q) => inClass(q) && q.published && inRange(q.dueAt, from, to));

  const events = [
    ...assignments.map((a) => ({ id: a.id, type: "assignment", title: a.title, at: a.dueAt, classroom: classSel(a.classroomId), link: `/app/assignments/${a.id}` })),
    ...sessions.map((s) => ({ id: s.id, type: "session", title: s.title, at: s.startsAt, durationMin: s.durationMin, meetingUrl: s.meetingUrl, classroom: classSel(s.classroomId), link: `/app/classes/${s.classroomId}/live` })),
    ...quizzes.map((q) => ({ id: q.id, type: "quiz", title: q.title, at: q.dueAt, classroom: classSel(q.classroomId), link: `/app/quizzes/${q.id}` })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  return { events };
});

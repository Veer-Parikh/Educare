// Seed demo accounts and a realistic class so every screen has something to show.
// Safe to re-run: it does nothing if the demo teacher already exists.
//
//   npm run seed
//
// Logins (password: educare123)
//   teacher@educare.dev   — teacher
//   aarav@educare.dev     — student
//   meera@educare.dev     — student
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";
import { joinCode, shortId } from "../src/lib/ids.js";
import { dayKey } from "../src/lib/dates.js";

const PASSWORD = "educare123";
const DAY = 86_400_000;

async function main() {
  if (await prisma.user.findUnique({ where: { email: "teacher@educare.dev" }, select: { id: true } })) {
    console.log("Demo data already present — nothing to do.");
    return;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const tz = "Asia/Kolkata";

  const teacher = await prisma.user.create({
    data: { name: "Dr. Kavya Iyer", email: "teacher@educare.dev", role: "TEACHER", passwordHash, sapId: "T1001", institution: "EduCare Demo School", timezone: tz, bio: "Physics teacher. Loves a good demo." },
  });
  const [aarav, meera] = await Promise.all([
    prisma.user.create({ data: { name: "Aarav Shah", email: "aarav@educare.dev", role: "STUDENT", passwordHash, sapId: "60001", institution: "EduCare Demo School", timezone: tz } }),
    prisma.user.create({ data: { name: "Meera Nair", email: "meera@educare.dev", role: "STUDENT", passwordHash, sapId: "60002", institution: "EduCare Demo School", timezone: tz } }),
  ]);

  const physics = await prisma.classroom.create({
    data: { name: "Physics — Grade 11", subject: "Physics", section: "A", code: joinCode(), theme: "sky", teacherId: teacher.id, description: "Mechanics, waves and thermodynamics." },
  });
  const chem = await prisma.classroom.create({
    data: { name: "Chemistry Lab", subject: "Chemistry", code: joinCode(), theme: "emerald", teacherId: teacher.id },
  });
  // Students joined a few weeks ago, so past deadlines apply to them.
  const joinedAt = new Date(Date.now() - 21 * DAY);
  await prisma.membership.createMany({
    data: [
      { classroomId: physics.id, userId: aarav.id, joinedAt },
      { classroomId: physics.id, userId: meera.id, joinedAt },
      { classroomId: chem.id, userId: aarav.id, joinedAt },
    ],
  });

  await prisma.announcement.create({
    data: { classroomId: physics.id, authorId: teacher.id, pinned: true, body: "Welcome to Physics! Unit 1 (Kinematics) notes are in Materials. Use the AI Tutor in Socratic mode when you're stuck — it knows our class notes." },
  });

  const notes =
    "Kinematics describes motion without considering its causes. Displacement is a vector: change in position. Velocity v = Δx/Δt; acceleration a = Δv/Δt. " +
    "For constant acceleration: v = u + at, s = ut + ½at², v² = u² + 2as. Free fall near Earth's surface has a ≈ 9.8 m/s² downward. " +
    "Projectile motion splits into independent horizontal (constant velocity) and vertical (constant acceleration) components. Range R = u² sin 2θ / g.";
  await prisma.material.create({
    data: { classroomId: physics.id, uploaderId: teacher.id, kind: "note", title: "Unit 1 — Kinematics summary", text: notes, charCount: notes.length, textStatus: "ready" },
  });

  const lab = await prisma.assignment.create({
    data: {
      classroomId: physics.id,
      authorId: teacher.id,
      title: "Projectile motion lab report",
      instructions: "Launch a ball at three angles (30°, 45°, 60°). Record the range and compare with R = u² sin 2θ / g. Explain any differences.",
      dueAt: new Date(Date.now() + 4 * DAY),
      rubric: [
        { id: shortId(), title: "Method & data", description: "Clear procedure and a complete data table", points: 8 },
        { id: shortId(), title: "Analysis", description: "Correct use of the range equation with working", points: 8 },
        { id: shortId(), title: "Error discussion", description: "Identifies at least two real sources of error", points: 4 },
      ],
      points: 20,
    },
  });
  const worksheet = await prisma.assignment.create({
    data: { classroomId: physics.id, authorId: teacher.id, title: "Kinematics worksheet", instructions: "Solve problems 1–10 from the worksheet. Show your working.", dueAt: new Date(Date.now() - 2 * DAY), points: 10 },
  });
  await prisma.submission.create({
    data: {
      assignmentId: worksheet.id,
      studentId: aarav.id,
      text: "1) v = 20 m/s  2) s = 45 m ... all working shown in the attached photo.",
      submittedAt: new Date(Date.now() - 3 * DAY),
      status: "graded",
      score: 8,
      feedback: "Solid work. Watch your signs in Q7 — acceleration due to gravity is negative when up is positive.",
      gradedAt: new Date(Date.now() - DAY),
      gradedById: teacher.id,
    },
  });
  await prisma.submission.create({
    data: { assignmentId: lab.id, studentId: meera.id, text: "At 45° the range was greatest (3.1 m), matching theory within 6%. Air resistance and launch height explain the gap.", submittedAt: new Date() },
  });

  const q = (type, prompt, options, answerIndex, concept, explanation) => ({
    id: shortId(), type, prompt, options, answerIndex, answerText: null, explanation, concept, difficulty: "medium", points: 1,
  });
  const quiz = await prisma.quiz.create({
    data: {
      ownerId: teacher.id,
      classroomId: physics.id,
      published: true,
      title: "Kinematics check-in",
      topic: "Kinematics",
      source: "manual",
      dueAt: new Date(Date.now() + 2 * DAY),
      questions: [
        q("mcq", "Which quantity is a vector?", ["Speed", "Distance", "Displacement", "Time"], 2, "Vectors vs scalars", "Displacement has direction; the others don't."),
        q("mcq", "A ball is dropped from rest. Its speed after 2 s is about:", ["9.8 m/s", "19.6 m/s", "4.9 m/s", "39.2 m/s"], 1, "Free fall", "v = gt = 9.8 × 2."),
        q("truefalse", "At the top of its flight, a projectile's acceleration is zero.", ["True", "False"], 1, "Projectile motion", "Gravity still acts: a = g downward."),
        q("mcq", "Maximum range on level ground occurs at a launch angle of:", ["30°", "45°", "60°", "90°"], 1, "Projectile motion", "sin 2θ is maximal at θ = 45°."),
      ],
    },
  });
  await prisma.quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId: aarav.id,
      score: 2,
      maxScore: 4,
      durationSec: 140,
      answers: quiz.questions.map((qq, i) => ({ questionId: qq.id, choiceIndex: i % 2 ? qq.answerIndex : 0, text: null, correct: i % 2 === 1, points: i % 2, feedback: null })),
    },
  });
  await prisma.conceptMastery.createMany({
    data: [
      { userId: aarav.id, concept: "vectors vs scalars", label: "Vectors vs scalars", subject: "Kinematics", correct: 0, total: 1 },
      { userId: aarav.id, concept: "free fall", label: "Free fall", subject: "Kinematics", correct: 1, total: 1 },
      { userId: aarav.id, concept: "projectile motion", label: "Projectile motion", subject: "Kinematics", correct: 1, total: 2 },
    ],
  });

  const deck = await prisma.deck.create({ data: { ownerId: aarav.id, title: "Kinematics formulas", subject: "Physics" } });
  await prisma.card.createMany({
    data: [
      ["Equation linking v, u, a and t", "v = u + at"],
      ["Displacement with constant acceleration (no final velocity)", "s = ut + ½at²"],
      ["Equation without time", "v² = u² + 2as"],
      ["Range of a projectile on level ground", "R = u² sin 2θ / g"],
      ["Acceleration of free fall near Earth", "≈ 9.8 m/s², downward"],
    ].map(([front, back]) => ({ deckId: deck.id, ownerId: aarav.id, front, back })),
  });

  await prisma.liveSession.create({
    data: { classroomId: physics.id, hostId: teacher.id, title: "Doubt-clearing: projectile motion", startsAt: new Date(Date.now() + DAY + 3 * 3600_000), durationMin: 45, meetingUrl: `https://meet.jit.si/EduCare-Physics-${shortId()}` },
  });

  // A few days of activity so streaks and heatmaps aren't empty.
  const activity = [];
  for (let i = 5; i >= 1; i--) activity.push({ userId: aarav.id, type: i % 2 ? "review" : "quiz", xp: 12 + i * 3, day: dayKey(new Date(Date.now() - i * DAY), tz) });
  await prisma.activity.createMany({ data: activity });
  await prisma.user.update({ where: { id: aarav.id }, data: { xp: activity.reduce((s, a) => s + a.xp, 0) + 30, streak: 5, longestStreak: 5, lastActiveDay: dayKey(new Date(Date.now() - DAY), tz) } });

  console.log("Seeded demo data.");
  console.log(`  Physics class code: ${physics.code}   Chemistry: ${chem.code}`);
  console.log(`  Logins (password "${PASSWORD}"): teacher@educare.dev, aarav@educare.dev, meera@educare.dev`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

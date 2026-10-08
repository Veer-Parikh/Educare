// Demo dataset: a richer take on backend/scripts/seed.js so every screen has
// something to show — a full class roster, graded and pending work, quiz
// attempts that feed insights, flashcards in every FSRS state and two months of
// activity for streaks, heatmaps and leaderboards.

import { DAY, dayKey, db, insert, joinCode, shortId } from "./core.js";
import { seedLearning } from "./seeds/learning.js";

export const DEMO_EMAILS = { TEACHER: "teacher@educare.dev", STUDENT: "aarav@educare.dev" };

const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000);
const ahead = (days, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000);

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Deterministic pseudo-random so the dataset looks the same on every reset. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function seed() {
  const tz = browserTz();
  const rand = rng(42);
  const base = { passwordHash: "demo", institution: "EduCare Demo School", timezone: tz };

  // ---- people ---------------------------------------------------------------
  const teacher = insert("users", { ...base, name: "Dr. Kavya Iyer", email: DEMO_EMAILS.TEACHER, role: "TEACHER", sapId: "T1001", bio: "Physics teacher. Loves a good demo.", createdAt: ago(120) });
  const mathsTeacher = insert("users", { ...base, name: "Mr. Arjun Mehta", email: "arjun@educare.dev", role: "TEACHER", sapId: "T1002", createdAt: ago(110) });
  const roster = [
    ["Aarav Shah", DEMO_EMAILS.STUDENT, "60001"],
    ["Meera Nair", "meera@educare.dev", "60002"],
    ["Rohan Gupta", "rohan@educare.dev", "60003"],
    ["Ishita Rao", "ishita@educare.dev", "60004"],
    ["Kabir Singh", "kabir@educare.dev", "60005"],
    ["Zara Khan", "zara@educare.dev", "60006"],
    ["Dev Patel", "dev@educare.dev", "60007"],
  ].map(([name, email, sapId]) => insert("users", { ...base, name, email, role: "STUDENT", sapId, createdAt: ago(100) }));
  const [aarav, meera, rohan, ishita, kabir, zara, dev] = roster;

  // ---- classes ----------------------------------------------------------------
  const physics = insert("classrooms", { name: "Physics — Grade 11", subject: "Physics", section: "A", code: joinCode(), theme: "sky", teacherId: teacher.id, description: "Mechanics, waves and thermodynamics.", createdAt: ago(60) });
  const chem = insert("classrooms", { name: "Chemistry Lab", subject: "Chemistry", section: "B", code: joinCode(), theme: "emerald", teacherId: teacher.id, description: "Hands-on practicals and lab reports.", createdAt: ago(55) });
  const maths = insert("classrooms", { name: "Mathematics — Algebra II", subject: "Mathematics", code: joinCode(), theme: "violet", teacherId: mathsTeacher.id, description: "Quadratics, functions and an intro to calculus.", createdAt: ago(58) });
  insert("classrooms", { name: "Physics — Grade 10 (2025)", subject: "Physics", code: joinCode(), theme: "rose", teacherId: teacher.id, archived: true, createdAt: ago(400) });

  const joinedAt = ago(45);
  for (const s of roster) insert("memberships", { classroomId: physics.id, userId: s.id, joinedAt });
  for (const s of [aarav, meera, rohan, ishita]) insert("memberships", { classroomId: chem.id, userId: s.id, joinedAt });
  for (const s of [aarav, zara, dev]) insert("memberships", { classroomId: maths.id, userId: s.id, joinedAt });

  // ---- stream -------------------------------------------------------------------
  insert("announcements", { classroomId: physics.id, authorId: teacher.id, pinned: true, body: "Welcome to Physics! Unit 1 (Kinematics) notes are in **Materials**. Use the AI Tutor in Socratic mode when you're stuck — it knows our class notes.", createdAt: ago(40) });
  insert("announcements", { classroomId: physics.id, authorId: teacher.id, body: "Great work on the kinematics worksheet, everyone. Common slip: sign of g when *up* is positive. Lab report on projectile motion is due this week.", createdAt: ago(2, 5) });
  insert("announcements", { classroomId: chem.id, authorId: teacher.id, body: "Bring your lab coats on Thursday — we're doing flame tests. 🔥", createdAt: ago(3) });
  insert("announcements", { classroomId: maths.id, authorId: mathsTeacher.id, pinned: true, body: "Quadratics test next Monday. Revise factorising and the discriminant.", createdAt: ago(1, 3) });

  // ---- materials ------------------------------------------------------------------
  const kinematics =
    "Kinematics describes motion without considering its causes. Displacement is a vector: change in position. Velocity v = Δx/Δt; acceleration a = Δv/Δt. " +
    "For constant acceleration: v = u + at, s = ut + ½at², v² = u² + 2as. Free fall near Earth's surface has a ≈ 9.8 m/s² downward. " +
    "Projectile motion splits into independent horizontal (constant velocity) and vertical (constant acceleration) components. Range R = u² sin 2θ / g. " +
    "The slope of a position–time graph is velocity, the slope of a velocity–time graph is acceleration, and the area under a velocity–time graph is displacement.";
  const newton =
    "Newton's first law: an object stays at rest or moves at constant velocity unless a net force acts on it. Newton's second law: F = ma, the net force equals mass times acceleration. " +
    "Newton's third law: for every action there is an equal and opposite reaction. Friction opposes relative motion; its maximum static value is μsN. Weight W = mg acts towards Earth's centre.";
  const bonding =
    "Atoms bond to reach a stable electron arrangement. Ionic bonds form when metals transfer electrons to non-metals, producing oppositely charged ions. Covalent bonds form when non-metals share pairs of electrons. " +
    "Electronegativity differences decide bond polarity. Metallic bonding is a lattice of positive ions in a sea of delocalised electrons, which explains conductivity.";
  const m = (classroom, uploader, title, text, extra = {}) =>
    insert("materials", { classroomId: classroom.id, uploaderId: uploader.id, kind: "note", title, text, charCount: text.length, textStatus: "ready", ...extra });
  m(physics, teacher, "Unit 1 — Kinematics summary", kinematics, { createdAt: ago(40) });
  m(physics, teacher, "Unit 2 — Newton's laws", newton, { description: "Read before Monday's class.", createdAt: ago(12) });
  insert("materials", { classroomId: physics.id, uploaderId: teacher.id, kind: "link", title: "PhET: Projectile Motion simulation", url: "https://phet.colorado.edu/en/simulations/projectile-motion", description: "Play with launch angle and air resistance.", createdAt: ago(20) });
  m(chem, teacher, "Chemical bonding notes", bonding, { createdAt: ago(18) });
  m(maths, mathsTeacher, "Quadratics cheat sheet", "A quadratic ax² + bx + c = 0 can be solved by factorising, completing the square or the quadratic formula x = (−b ± √(b² − 4ac)) / 2a. The discriminant b² − 4ac tells you the number of real roots: positive gives two, zero gives one repeated root, negative gives none.", { createdAt: ago(15) });

  // ---- assignments & submissions ----------------------------------------------------
  const rubric = (rows) => rows.map(([title, description, points]) => ({ id: shortId(), title, description, points }));
  const lab = insert("assignments", {
    classroomId: physics.id,
    authorId: teacher.id,
    title: "Projectile motion lab report",
    instructions: "Launch a ball at three angles (30°, 45°, 60°). Record the range and compare with R = u² sin 2θ / g. Explain any differences.",
    dueAt: ahead(3),
    points: 20,
    rubric: rubric([
      ["Method & data", "Clear procedure and a complete data table", 8],
      ["Analysis", "Correct use of the range equation with working", 8],
      ["Error discussion", "Identifies at least two real sources of error", 4],
    ]),
    createdAt: ago(6),
  });
  const worksheet = insert("assignments", { classroomId: physics.id, authorId: teacher.id, title: "Kinematics worksheet", instructions: "Solve problems 1–10 from the worksheet. Show your working.", dueAt: ago(5), points: 10, createdAt: ago(14) });
  const newtonEssay = insert("assignments", { classroomId: physics.id, authorId: teacher.id, title: "Newton's laws in everyday life", instructions: "Write 300 words describing three everyday situations, one for each of Newton's laws. Name the forces involved.", dueAt: ahead(8), points: 15, createdAt: ago(1) });
  const graphs = insert("assignments", { classroomId: physics.id, authorId: teacher.id, title: "Motion graphs practice", instructions: "Sketch the x–t and v–t graphs for the five scenarios in the handout.", dueAt: ago(12), points: 10, createdAt: ago(20) });
  const chemReport = insert("assignments", { classroomId: chem.id, authorId: teacher.id, title: "Flame test observations", instructions: "Record the flame colour for each metal salt and explain the result in terms of electron energy levels.", dueAt: ahead(5), points: 20, createdAt: ago(3) });
  const quadSet = insert("assignments", { classroomId: maths.id, authorId: mathsTeacher.id, title: "Quadratics problem set", instructions: "Questions 1–12. Use the discriminant to justify the number of roots before solving.", dueAt: ahead(2), points: 24, createdAt: ago(4) });

  const graded = (assignment, student, score, feedback, daysAgo, extra = {}) =>
    insert("submissions", { assignmentId: assignment.id, studentId: student.id, text: extra.text ?? "My answers are below, with working for each problem.", submittedAt: ago(daysAgo + 1), status: "graded", score, feedback, gradedAt: ago(daysAgo), gradedById: assignment.authorId, ...extra });

  const wsScores = [8, 9, 6, 7, 4, 10, 5];
  roster.forEach((s, i) => graded(worksheet, s, wsScores[i], wsScores[i] >= 8 ? "Solid work — clear working throughout." : wsScores[i] >= 6 ? "Good effort. Watch your signs in Q7: g is negative when up is positive." : "Several errors with the equations of motion. Let's go over Q3–Q7 together.", 3, i === 0 ? { text: "1) v = 20 m/s  2) s = 45 m  3) t = 2.04 s ... all working shown in the attached photo." } : {}));
  const grScores = [9, 8, 7, 9, 5, 8];
  roster.slice(0, 6).forEach((s, i) => graded(graphs, s, grScores[i], "Graphs are neat and correctly labelled.", 9, { late: i === 4 }));

  insert("submissions", { assignmentId: lab.id, studentId: meera.id, text: "At 45° the range was greatest (3.1 m), matching theory within 6%. Air resistance and launch height explain the gap.", submittedAt: ago(0, 6) });
  insert("submissions", {
    assignmentId: lab.id,
    studentId: ishita.id,
    text: "Ranges: 30° → 2.6 m, 45° → 3.0 m, 60° → 2.5 m. The 30° and 60° results should be equal in theory; the difference comes from the launcher's spring weakening and timing error.",
    submittedAt: ago(1),
    aiDraft: {
      score: 17,
      feedback: "A clear, well-structured report. The data table is complete and the comparison with theory is correct. To reach full marks, quantify the percentage difference and discuss air resistance.",
      rubricScores: [
        { criterionId: lab.rubric[0].id, score: 7, comment: "Good table; include uncertainty." },
        { criterionId: lab.rubric[1].id, score: 7, comment: "Correct use of R = u² sin 2θ / g." },
        { criterionId: lab.rubric[2].id, score: 3, comment: "Two sources named; explain their effect." },
      ],
      strengths: ["Complete data table", "Correct physics reasoning"],
      improvements: ["Quantify the error", "Discuss air resistance"],
      confidence: "high",
      model: "demo",
      generatedAt: ago(0, 20),
    },
  });
  insert("submissions", { assignmentId: lab.id, studentId: rohan.id, text: "We got the max range at 45 degrees. 30 and 60 were close.", submittedAt: ago(0, 2) });
  insert("submissions", { assignmentId: chemReport.id, studentId: meera.id, text: "Sodium: yellow-orange. Potassium: lilac. Copper: blue-green. Electrons absorb energy, jump up a level and emit light of a specific colour when they fall back.", submittedAt: ago(1) });
  insert("submissions", { assignmentId: quadSet.id, studentId: zara.id, text: "Answers 1–12 attached.", submittedAt: ago(0, 8) });

  // ---- quizzes, attempts, mastery -------------------------------------------------------
  const q = (type, prompt, options, answerIndex, concept, explanation, answerText = null) => ({ id: shortId(), type, prompt, options, answerIndex, answerText, explanation, concept, difficulty: "medium", points: 1 });
  const kinQuiz = insert("quizzes", {
    ownerId: teacher.id,
    classroomId: physics.id,
    published: true,
    title: "Kinematics check-in",
    topic: "Kinematics",
    source: "manual",
    dueAt: ahead(2),
    timeLimitMin: 10,
    questions: [
      q("mcq", "Which quantity is a vector?", ["Speed", "Distance", "Displacement", "Time"], 2, "Vectors vs scalars", "Displacement has direction; the others don't."),
      q("mcq", "A ball is dropped from rest. Its speed after 2 s is about:", ["9.8 m/s", "19.6 m/s", "4.9 m/s", "39.2 m/s"], 1, "Free fall", "v = gt = 9.8 × 2."),
      q("truefalse", "At the top of its flight, a projectile's acceleration is zero.", ["True", "False"], 1, "Projectile motion", "Gravity still acts: a = g downward."),
      q("mcq", "Maximum range on level ground occurs at a launch angle of:", ["30°", "45°", "60°", "90°"], 1, "Projectile motion", "sin 2θ is maximal at θ = 45°."),
      q("mcq", "The slope of a velocity–time graph gives:", ["Displacement", "Acceleration", "Speed", "Force"], 1, "Motion graphs", "a = Δv/Δt."),
      q("short", "State the equation linking v, u, a and t.", [], null, "Equations of motion", "From a = (v − u)/t.", "v = u + at"),
    ],
    createdAt: ago(8),
  });
  const newtonQuiz = insert("quizzes", {
    ownerId: teacher.id,
    classroomId: physics.id,
    published: true,
    title: "Newton's laws warm-up",
    topic: "Newton's laws",
    source: "manual",
    dueAt: ahead(6),
    questions: [
      q("mcq", "F = ma is Newton's:", ["First law", "Second law", "Third law", "Law of gravitation"], 1, "Newton's second law", "Net force equals mass × acceleration."),
      q("mcq", "A 2 kg mass accelerates at 3 m/s². The net force is:", ["1.5 N", "5 N", "6 N", "9 N"], 2, "Newton's second law", "F = 2 × 3 = 6 N."),
      q("truefalse", "An object moving at constant velocity has no net force on it.", ["True", "False"], 0, "Newton's first law", "Constant velocity means zero acceleration."),
      q("mcq", "Action–reaction pairs act on:", ["The same object", "Different objects", "Only moving objects", "Only stationary objects"], 1, "Newton's third law", "The pair always acts on two different bodies."),
    ],
    createdAt: ago(1),
  });
  const bondQuiz = insert("quizzes", {
    ownerId: teacher.id,
    classroomId: chem.id,
    published: true,
    title: "Bonding basics",
    topic: "Chemical bonding",
    source: "manual",
    questions: [
      q("mcq", "Sodium chloride is held together by:", ["Covalent bonds", "Ionic bonds", "Metallic bonds", "Hydrogen bonds"], 1, "Ionic bonding", "Na⁺ and Cl⁻ attract."),
      q("mcq", "Covalent bonds involve:", ["Transferring electrons", "Sharing electrons", "Sharing protons", "Delocalised ions"], 1, "Covalent bonding", "A shared pair of electrons."),
      q("truefalse", "Metals conduct because of delocalised electrons.", ["True", "False"], 0, "Metallic bonding", "The electron sea carries charge."),
    ],
    createdAt: ago(10),
  });
  insert("quizzes", { ownerId: teacher.id, title: "Waves & sound (draft)", topic: "Waves", source: "manual", questions: [q("mcq", "Sound is a:", ["Transverse wave", "Longitudinal wave", "Electromagnetic wave", "Standing wave only"], 1, "Wave types", "Particles oscillate parallel to travel.")], createdAt: ago(0, 4) });
  const practice = insert("quizzes", {
    ownerId: aarav.id,
    title: "Photosynthesis practice",
    topic: "Photosynthesis",
    source: "topic",
    questions: [
      q("mcq", "Where does photosynthesis take place?", ["Mitochondria", "Chloroplasts", "Nucleus", "Ribosomes"], 1, "Chloroplast", "Chlorophyll is in chloroplasts."),
      q("mcq", "Which gas is released?", ["Carbon dioxide", "Nitrogen", "Oxygen", "Hydrogen"], 2, "Photosynthesis", "Water is split, releasing O₂."),
      q("truefalse", "Plants respire only at night.", ["True", "False"], 1, "Respiration", "Respiration happens all the time."),
    ],
    createdAt: ago(9),
  });

  const conceptKey = (c) => c.trim().toLowerCase().replace(/\s+/g, " ");
  const mastery = new Map();
  const attempt = (quiz, user, correctness, daysAgo) => {
    const answers = quiz.questions.map((qq, i) => {
      const correct = correctness[i % correctness.length];
      const choiceIndex = qq.type === "short" ? null : correct ? qq.answerIndex : (qq.answerIndex + 1) % qq.options.length;
      const k = `${user.id}|${conceptKey(qq.concept)}`;
      const row = mastery.get(k) ?? { userId: user.id, concept: conceptKey(qq.concept), label: qq.concept, subject: quiz.topic, correct: 0, total: 0, lastSeenAt: ago(daysAgo) };
      row.total += 1;
      row.correct += correct ? 1 : 0;
      mastery.set(k, row);
      return { questionId: qq.id, choiceIndex, text: qq.type === "short" ? (correct ? qq.answerText : "v = at") : null, correct: Boolean(correct), points: correct ? qq.points : 0, feedback: qq.type === "short" ? (correct ? "Nice — that captures the key idea." : `Not quite. A strong answer would mention: ${qq.answerText}.`) : null };
    });
    const score = answers.reduce((s, a) => s + a.points, 0);
    insert("quizAttempts", { quizId: quiz.id, userId: user.id, answers, score, maxScore: quiz.questions.reduce((s, qq) => s + qq.points, 0), durationSec: 90 + Math.floor(rand() * 240), completedAt: ago(daysAgo, Math.floor(rand() * 8)) });
  };
  attempt(kinQuiz, aarav, [1, 1, 0, 1, 0, 1], 4);
  attempt(kinQuiz, meera, [1, 1, 1, 1, 1, 1], 3);
  attempt(kinQuiz, rohan, [1, 0, 0, 1, 0, 0], 3);
  attempt(kinQuiz, ishita, [1, 1, 1, 1, 0, 1], 2);
  attempt(kinQuiz, kabir, [0, 0, 0, 1, 0, 0], 2);
  attempt(kinQuiz, zara, [1, 1, 0, 1, 1, 1], 1);
  attempt(newtonQuiz, meera, [1, 1, 1, 0], 0);
  attempt(newtonQuiz, ishita, [1, 1, 1, 1], 0);
  attempt(bondQuiz, aarav, [1, 0, 1], 6);
  attempt(bondQuiz, meera, [1, 1, 1], 6);
  attempt(bondQuiz, rohan, [0, 1, 0], 5);
  attempt(practice, aarav, [1, 1, 0], 9);
  attempt(practice, aarav, [1, 1, 1], 5);
  for (const row of mastery.values()) insert("conceptMastery", row);

  // ---- flashcards ------------------------------------------------------------------------
  const deck = (owner, title, subject, description, cards, createdAt) => {
    const d = insert("decks", { ownerId: owner.id, title, subject, description, createdAt });
    cards.forEach(([front, back, hint], i) => {
      // Spread cards across FSRS states: some new, some due now, some scheduled ahead.
      const stage = i % 4;
      const sched =
        stage === 0
          ? {}
          : stage === 1
            ? { state: 2, reps: 3, stability: 4.2, difficulty: 5.1, scheduledDays: 4, elapsedDays: 4, due: ago(0, 2), lastReview: ago(4) }
            : stage === 2
              ? { state: 2, reps: 5, stability: 12.5, difficulty: 4.3, scheduledDays: 12, elapsedDays: 3, due: ahead(9), lastReview: ago(3) }
              : { state: 1, reps: 1, stability: 0.8, difficulty: 6.4, learningSteps: 1, scheduledDays: 0, due: ago(0, 1), lastReview: ago(1) };
      insert("cards", { deckId: d.id, ownerId: owner.id, front, back, hint: hint ?? null, ...sched, createdAt });
    });
    return d;
  };
  deck(aarav, "Kinematics formulas", "Physics", "The SUVAT equations and friends.", [
    ["Equation linking v, u, a and t", "v = u + at"],
    ["Displacement with constant acceleration (no final velocity)", "s = ut + ½at²"],
    ["Equation without time", "v² = u² + 2as"],
    ["Range of a projectile on level ground", "R = u² sin 2θ / g", "Depends on sin 2θ"],
    ["Acceleration of free fall near Earth", "≈ 9.8 m/s², downward"],
    ["Slope of a v–t graph", "Acceleration"],
    ["Area under a v–t graph", "Displacement"],
    ["Angle for maximum range", "45°"],
  ], ago(20));
  deck(aarav, "Chemical bonding", "Chemistry", null, [
    ["Ionic bond", "Electrostatic attraction between oppositely charged ions", "Metal + non-metal"],
    ["Covalent bond", "A shared pair of electrons"],
    ["Metallic bond", "Positive ions in a sea of delocalised electrons"],
    ["Electronegativity", "How strongly an atom attracts bonding electrons"],
    ["Why do noble gases rarely react?", "Full outer electron shells"],
  ], ago(12));
  deck(aarav, "Quadratics", "Mathematics", null, [
    ["Quadratic formula", "x = (−b ± √(b² − 4ac)) / 2a"],
    ["Discriminant", "b² − 4ac"],
    ["b² − 4ac < 0 means…", "No real roots"],
    ["Factorise x² − 9", "(x − 3)(x + 3)"],
  ], ago(6));
  deck(teacher, "Physics demo questions", "Physics", "Quick-fire cards for class warm-ups.", [
    ["Unit of force", "Newton (N)"],
    ["Newton's second law", "F = ma"],
    ["Weight of a 5 kg mass", "≈ 49 N"],
  ], ago(15));

  // ---- live sessions --------------------------------------------------------------------------
  insert("liveSessions", { classroomId: physics.id, hostId: teacher.id, title: "Doubt-clearing: projectile motion", description: "Bring your lab data — we'll go through the error analysis.", startsAt: ahead(1, 3), durationMin: 45, meetingUrl: `https://meet.jit.si/EduCare-Physics-${shortId()}`, createdAt: ago(2) });
  insert("liveSessions", { classroomId: physics.id, hostId: teacher.id, title: "Unit 1 recap", startsAt: ago(6), durationMin: 60, meetingUrl: `https://meet.jit.si/EduCare-Physics-${shortId()}`, createdAt: ago(9) });
  insert("liveSessions", { classroomId: maths.id, hostId: mathsTeacher.id, title: "Quadratics test review", startsAt: ahead(3, 5), durationMin: 50, meetingUrl: `https://meet.jit.si/EduCare-Maths-${shortId()}`, createdAt: ago(1) });

  // ---- activity, XP and streaks ------------------------------------------------------------------
  const types = ["review", "quiz", "focus", "tutor", "submit", "studio"];
  const activityFor = (user, days, density, streakDays) => {
    let xp = 0;
    for (let i = days; i >= 1; i--) {
      const inStreak = i <= streakDays;
      if (!inStreak && rand() > density) continue;
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const type = types[Math.floor(rand() * types.length)];
        const gained = type === "focus" ? 25 : type === "submit" ? 30 : type === "studio" ? 15 : 6 + Math.floor(rand() * 18);
        xp += gained;
        insert("activities", { userId: user.id, type, xp: gained, day: dayKey(ago(i), tz), minutes: type === "focus" ? 25 : null, meta: type === "review" ? { count: 5 + Math.floor(rand() * 20) } : null, createdAt: ago(i) });
      }
    }
    return xp;
  };
  const profiles = [
    [aarav, 70, 0.65, 6],
    [meera, 70, 0.85, 14],
    [rohan, 60, 0.35, 0],
    [ishita, 70, 0.75, 9],
    [kabir, 40, 0.2, 0],
    [zara, 60, 0.6, 3],
    [dev, 50, 0.45, 2],
  ];
  for (const [user, days, density, streak] of profiles) {
    const xp = activityFor(user, days, density, streak);
    Object.assign(user, { xp, streak, longestStreak: Math.max(streak, Math.round(streak * 1.5) + 2), lastActiveDay: streak ? dayKey(ago(1), tz) : dayKey(ago(4), tz) });
  }
  teacher.xp = 340;

  // ---- notifications ------------------------------------------------------------------------------
  const note = (user, type, title, body, link, hoursAgo, read = false) => insert("notifications", { userId: user.id, type, title, body, link, read, createdAt: ago(0, hoursAgo) });
  note(aarav, "grade", "Kinematics worksheet was graded", "You scored 8/10.", `/app/assignments/${worksheet.id}`, 70, true);
  note(aarav, "assignment", "New assignment: Newton's laws in everyday life", physics.name, `/app/assignments/${newtonEssay.id}`, 22);
  note(aarav, "quiz", "New quiz: Newton's laws warm-up", physics.name, `/app/quizzes/${newtonQuiz.id}`, 20);
  note(aarav, "announcement", "Mr. Arjun Mehta posted in Mathematics — Algebra II", "Quadratics test next Monday.", `/app/classes/${maths.id}`, 27);
  note(teacher, "submission", "Meera Nair submitted Projectile motion lab report", null, `/app/assignments/${lab.id}`, 6);
  note(teacher, "submission", "Rohan Gupta submitted Projectile motion lab report", null, `/app/assignments/${lab.id}`, 2);
  note(teacher, "submission", "Meera Nair submitted Flame test observations", null, `/app/assignments/${chemReport.id}`, 24, true);

  // ---- tutor chats, roadmaps, study sets, saved teacher tools ---------------------------------------
  seedLearning({ teacher, students: roster, aarav, classes: { physics, chem, maths }, materials: db.materials, ago, ahead, tz });
}

// Demo data for tutor chats, roadmaps, Study Studio sets and saved teacher tools.
// Shapes match what routes/tutor.js, studio.js, roadmaps.js and tools.js produce.

import { insert } from "../core.js";
import { generateCards, generateQuestions } from "../ai.js";
import { buildMilestones, generateRoadmap } from "../routes/roadmaps.js";
import { assemblePaper, generatePaper } from "../routes/tools.js";

/** A conversation plus its messages, a few minutes apart. */
function chat({ user, classroomId = null, studySetId = null, mode, title, at, turns }) {
  const convo = insert("conversations", { userId: user.id, classroomId, studySetId, mode, title, createdAt: at, updatedAt: at });
  let t = at;
  for (const [role, content] of turns) {
    t = new Date(t.getTime() + (role === "user" ? 90_000 : 20_000));
    insert("messages", { conversationId: convo.id, role, content, createdAt: t });
  }
  convo.updatedAt = t;
  return convo;
}

/** Deck + cards + quiz rows like POST /studio creates for a pack. */
function packExtras(user, title, label, text, at, { cards = 10, questions = 6 } = {}) {
  const deck = insert("decks", { ownerId: user.id, title, subject: label.slice(0, 80), createdAt: at });
  for (const c of generateCards({ label, text, count: cards }).cards) {
    insert("cards", { deckId: deck.id, ownerId: user.id, front: c.front, back: c.back, hint: c.hint || null, createdAt: at, due: at });
  }
  const quiz = insert("quizzes", {
    ownerId: user.id,
    title: `${title} — check-up`,
    topic: label,
    source: "studio",
    questions: generateQuestions({ label, text, count: questions, types: ["mcq", "truefalse"] }).questions,
    createdAt: at,
  });
  return { deckId: deck.id, quizId: quiz.id };
}

/** @param {{ teacher, students, aarav, classes: { physics, chem, maths }, materials, ago, ahead, tz }} ctx */
export function seedLearning(ctx) {
  const { teacher, aarav, classes, materials, ago } = ctx;
  const kinematicsNotes = materials.find((m) => m.classroomId === classes.physics.id && m.title.startsWith("Unit 1"));

  // ---- Study Studio --------------------------------------------------------------------
  const photoAt = ago(8);
  const photoSet = insert("studySets", {
    userId: aarav.id,
    title: "Photosynthesis",
    sourceType: "topic",
    sourceName: "Photosynthesis",
    sourceText: null,
    summary: [
      "### The big picture",
      "",
      "**Photosynthesis** is how plants, algae and some bacteria turn light energy into chemical energy. Inside **chloroplasts**, the green pigment **chlorophyll** absorbs mostly red and blue light and uses that energy to combine carbon dioxide and water into glucose, releasing oxygen as a by-product. Almost every food chain on Earth starts here.",
      "",
      "### The equation",
      "",
      "The overall reaction is $6\\text{CO}_2 + 6\\text{H}_2\\text{O} \\rightarrow \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$. Carbon dioxide enters leaves through **stomata**, water arrives from the roots through the **xylem**, and the oxygen released actually comes from splitting water molecules — not from the CO₂.",
      "",
      "### Two stages",
      "",
      "The **light-dependent reactions** happen on the thylakoid membranes: light splits water, releasing O₂ and producing ATP and NADPH. The **Calvin cycle** runs in the stroma and uses that ATP and NADPH to fix CO₂ into sugar. It doesn't need light directly, but it stops when the light reactions stop supplying energy.",
      "",
      "### Limiting factors",
      "",
      "The rate of photosynthesis is capped by whichever factor is in shortest supply: **light intensity**, **CO₂ concentration** or **temperature**. Temperature matters because the reactions are controlled by **enzymes**, which slow down when cold and denature when too hot. Growers raise CO₂ and light in greenhouses to boost yields.",
    ].join("\n"),
    keyPoints: [
      "Photosynthesis converts light energy into chemical energy stored in glucose.",
      "It takes place in chloroplasts, where chlorophyll absorbs red and blue light.",
      "Overall: carbon dioxide + water → glucose + oxygen, powered by light.",
      "The oxygen released comes from splitting water, not from carbon dioxide.",
      "Light-dependent reactions make ATP and NADPH; the Calvin cycle uses them to fix CO₂.",
      "Light intensity, CO₂ concentration and temperature are the classic limiting factors.",
      "Enzymes control the reactions, so very high temperatures reduce the rate.",
      "Plants respire all the time; photosynthesis only happens in the light.",
    ],
    concepts: [
      { term: "Photosynthesis", definition: "The process that uses light energy to make glucose and oxygen from carbon dioxide and water." },
      { term: "Chloroplast", definition: "The organelle where photosynthesis happens; contains chlorophyll in its thylakoid membranes." },
      { term: "Chlorophyll", definition: "Green pigment that absorbs red and blue light and reflects green." },
      { term: "Stomata", definition: "Tiny pores, mainly on the underside of leaves, that let CO₂ in and O₂ and water vapour out." },
      { term: "Light-dependent reactions", definition: "First stage: light splits water, releasing O₂ and producing ATP and NADPH." },
      { term: "Calvin cycle", definition: "Second stage in the stroma: uses ATP and NADPH to fix CO₂ into sugar." },
      { term: "Limiting factor", definition: "The factor in shortest supply, which sets the maximum rate of a process." },
      { term: "Glucose", definition: "The sugar made by photosynthesis; used for respiration or stored as starch." },
    ],
    questionsToPonder: [
      "Why would a plant in a sealed glass jar eventually stop photosynthesising, even in bright light?",
      "If chlorophyll reflects green light, why might plants under green light grow poorly?",
      "How are photosynthesis and respiration like two halves of one cycle?",
      "What would happen to the oxygen in the atmosphere if photosynthesis stopped worldwide?",
    ],
    createdAt: photoAt,
    ...packExtras(aarav, "Photosynthesis", "Photosynthesis", undefined, photoAt),
  });

  const kinAt = ago(16);
  insert("studySets", {
    userId: aarav.id,
    title: "Unit 1 — Kinematics Summary",
    sourceType: "material",
    sourceName: kinematicsNotes?.title ?? "Unit 1 — Kinematics summary",
    sourceText: kinematicsNotes?.text ?? null,
    summary: [
      "### What kinematics is",
      "",
      "**Kinematics** describes *how* things move without asking *why*. It works with four linked quantities: **displacement** (change in position, a vector), **velocity** ($v = \\Delta x / \\Delta t$), **acceleration** ($a = \\Delta v / \\Delta t$) and time.",
      "",
      "### The equations of motion",
      "",
      "When acceleration is constant, three equations connect everything: $v = u + at$, $s = ut + \\tfrac{1}{2}at^2$ and $v^2 = u^2 + 2as$. Pick the one that contains the three quantities you know and the one you want. Near Earth's surface, **free fall** means $a \\approx 9.8\\ \\text{m/s}^2$ downward.",
      "",
      "### Projectiles and graphs",
      "",
      "A **projectile** is two independent motions: constant velocity horizontally and free fall vertically. On level ground the range is $R = u^2 \\sin 2\\theta / g$, greatest at 45°. On graphs, the **slope of an x–t graph** is velocity, the **slope of a v–t graph** is acceleration, and the **area under a v–t graph** is displacement.",
    ].join("\n"),
    keyPoints: [
      "Kinematics describes motion without considering its causes.",
      "Displacement and velocity are vectors; distance and speed are scalars.",
      "For constant acceleration use v = u + at, s = ut + ½at² and v² = u² + 2as.",
      "Free fall near Earth's surface has a ≈ 9.8 m/s² downward.",
      "Projectile motion splits into independent horizontal and vertical components.",
      "Range on level ground is R = u² sin 2θ / g, maximised at 45°.",
      "The slope of a v–t graph is acceleration; the area under it is displacement.",
    ],
    concepts: [
      { term: "Displacement", definition: "Change in position; a vector with magnitude and direction." },
      { term: "Velocity", definition: "Rate of change of displacement, v = Δx/Δt." },
      { term: "Acceleration", definition: "Rate of change of velocity, a = Δv/Δt." },
      { term: "Free fall", definition: "Motion under gravity alone, with a ≈ 9.8 m/s² downward." },
      { term: "Projectile motion", definition: "Constant horizontal velocity combined with vertical free fall." },
      { term: "Range", definition: "Horizontal distance a projectile travels: R = u² sin 2θ / g on level ground." },
    ],
    questionsToPonder: [
      "Why does a projectile launched at 30° land at the same spot as one launched at 60° (same speed)?",
      "Can an object have zero velocity but non-zero acceleration? When?",
      "How would air resistance change the shape of a projectile's path?",
    ],
    createdAt: kinAt,
    ...packExtras(aarav, "Unit 1 — Kinematics Summary", kinematicsNotes?.title ?? "Kinematics", kinematicsNotes?.text, kinAt, { cards: 12, questions: 6 }),
  });

  // ---- tutor conversations ----------------------------------------------------------------
  chat({
    user: aarav,
    classroomId: classes.physics.id,
    mode: "socratic",
    title: "Why acceleration isn't zero at the top",
    at: ago(3, 4),
    turns: [
      ["user", "Why is the acceleration not zero at the top of a projectile's flight? The ball stops there, right?"],
      [
        "model",
        "Great question — and it's one of the most common traps in kinematics, so let's untangle it together rather than me just telling you. [Material: Unit 1 — Kinematics summary]\n\n**First, a check:** at the very top of the flight, what is the ball's **vertical** velocity $v_y$? And is its **horizontal** velocity $v_x$ zero too?\n\n> Hint: your notes say projectile motion splits into two *independent* motions.",
      ],
      ["user", "v_y is zero at the top, but v_x is still the same as at launch. So it's still moving sideways — it doesn't actually stop."],
      [
        "model",
        "Exactly — the ball never stops; only the vertical part of its velocity is momentarily zero. 👏\n\nNow think about acceleration. By definition,\n\n$$a = \\frac{\\Delta v}{\\Delta t}$$\n\nA moment *before* the top, $v_y$ is slightly positive (moving up). A moment *after*, it's slightly negative (moving down).\n\n**So:** is $v_y$ *changing* as the ball passes through the top? What does that tell you about $a_y$?",
      ],
      ["user", "It's changing from up to down, so there has to be an acceleration. Is it just g downwards the whole time?"],
      [
        "model",
        "That's it! 🎯 Gravity never switches off, so throughout the whole flight\n\n$$a_y = -g \\approx -9.8\\ \\text{m/s}^2 \\qquad a_x = 0$$\n\nThe key idea to remember: **zero velocity does not mean zero acceleration.** Velocity tells you how fast position is changing; acceleration tells you how fast *velocity* is changing — and at the top, velocity is changing just as fast as anywhere else. [Material: Unit 1 — Kinematics summary]\n\n**Quick check:** a ball is thrown straight up at $u = 14.7\\ \\text{m/s}$. How long does it take to reach the top? Use $v = u + at$ and tell me what you get for $t$.",
      ],
      ["user", "0 = 14.7 − 9.8t so t = 1.5 s"],
      [
        "model",
        "Perfect — $t = \\dfrac{14.7}{9.8} = 1.5\\ \\text{s}$. ✅\n\nNotice you set $v = 0$ at the top but still used $a = -9.8\\ \\text{m/s}^2$ — that's exactly the idea we just worked out.\n\n**Stretch question:** how long is the *whole* flight if it lands back at the launch height? (Think about symmetry before you reach for an equation.)",
      ],
    ],
  });

  chat({
    user: aarav,
    studySetId: photoSet.id,
    mode: "explain",
    title: "Chat: Photosynthesis",
    at: ago(7, 2),
    turns: [
      ["user", "Where does the oxygen from photosynthesis actually come from? I assumed it was from the CO₂."],
      [
        "model",
        "Lots of people assume that — but the oxygen comes from **water**, not carbon dioxide. [Source]\n\n**1. The light-dependent reactions split water.** Light energy absorbed by chlorophyll is used to break water molecules apart (*photolysis*):\n\n$$2\\text{H}_2\\text{O} \\rightarrow 4\\text{H}^+ + 4e^- + \\text{O}_2$$\n\nThe O₂ is released through the stomata; the hydrogen ions and electrons are used to make ATP and NADPH.\n\n**2. The carbon dioxide goes into the sugar.** In the Calvin cycle, CO₂ is *fixed* — its carbon and oxygen atoms end up in glucose, $\\text{C}_6\\text{H}_{12}\\text{O}_6$.\n\n**How do we know?** Experiments in the 1940s used water labelled with the heavy isotope ¹⁸O. The labelled oxygen showed up in the O₂ gas released — when the CO₂ was labelled instead, it didn't.\n\n**Quick check:** if a plant were given water containing ¹⁸O, where would you expect to find the ¹⁸O first?",
      ],
      ["user", "In the oxygen gas it gives off!"],
      [
        "model",
        "Exactly right. ✅ The ¹⁸O appears in the released O₂ because that oxygen comes straight from the split water molecules. [Source]\n\nThis is also why the light-dependent reactions *need* water as well as light — no water, no electrons to replace the ones chlorophyll loses, and the whole process stalls.\n\n**Your turn:** which of the three limiting factors in your pack would you change to speed up the Calvin cycle specifically — and why?",
      ],
    ],
  });

  chat({
    user: aarav,
    mode: "exam",
    title: "Discriminant traps before Monday's test",
    at: ago(1, 5),
    turns: [
      ["user", "Quiz me on the discriminant — I have a quadratics test on Monday."],
      [
        "model",
        "## High-yield summary\n\nFor $ax^2 + bx + c = 0$, the **discriminant** is $\\Delta = b^2 - 4ac$.\n\n- $\\Delta > 0$ → **two** distinct real roots\n- $\\Delta = 0$ → **one** repeated real root (the vertex touches the x-axis)\n- $\\Delta < 0$ → **no** real roots\n\n**Common traps**\n\n- Forgetting the sign of $c$: for $x^2 - 3x - 4$, $c = -4$, so $-4ac = +16$.\n- Using $b$ instead of $b^2$ — square the whole of $b$, including its sign.\n- Rearranging to $= 0$ first! $x^2 + 4x = -4$ must become $x^2 + 4x + 4 = 0$.\n\n**Practice question:** how many real roots does $x^2 + 4x + 4 = 0$ have? Show the discriminant.",
      ],
      ["user", "b² − 4ac = 16 − 16 = 0 so one repeated root, x = −2"],
      [
        "model",
        "Correct ✅ — $\\Delta = 4^2 - 4(1)(4) = 0$, so there's one repeated root, and $x^2 + 4x + 4 = (x + 2)^2$ gives $x = -2$.\n\n**Exam drill — round 2**\n\n1. Find $k$ if $x^2 + kx + 9 = 0$ has exactly one real root.\n2. Show that $2x^2 - 3x + 5 = 0$ has no real roots.\n\n---\n\n**Answers:** (1) $k^2 - 36 = 0 \\Rightarrow k = \\pm 6$. (2) $\\Delta = 9 - 40 = -31 < 0$, so no real roots.\n\n**Examiner tip:** \"show that\" questions want the discriminant written out *and* a concluding sentence — the final line is often worth a mark on its own.",
      ],
    ],
  });

  chat({
    user: teacher,
    mode: "explain",
    title: "Low-prep demos for Newton's third law",
    at: ago(5, 1),
    turns: [
      ["user", "Give me three classroom demos for Newton's third law that need almost no equipment. Grade 11, 10 minutes max each."],
      [
        "model",
        "Here are three quick, low-prep demos that make action–reaction pairs *visible*.\n\n**1. Balloon rocket (5 min)**\nThread a straw onto a string stretched across the room, tape an inflated balloon to the straw and let go. The balloon pushes air backwards; the air pushes the balloon forwards.\n- *Ask:* \"Which object exerts the forward force on the balloon?\" (The air — students usually say \"the balloon itself\".)\n\n**2. Two students on wheeled chairs (3 min)**\nTwo students sit facing each other on office chairs; one pushes the other's palms. *Both* roll apart.\n- *Ask:* \"Only one person pushed — so why did both move?\" Then vary the masses (a lighter student) and compare accelerations using $a = F/m$.\n\n**3. Spring scales tug-of-war (5 min)**\nHook two spring balances together and have two students pull. The readings are always equal, however hard either pulls.\n- *Key line:* the forces in a third-law pair are **equal in size, opposite in direction, and act on different objects**.\n\n**Misconception to target:** \"if the forces are equal and opposite, why doesn't everything cancel?\" — because the two forces act on *different* bodies, so they never appear on the same free-body diagram.\n\nWant a five-question exit ticket to go with these?",
      ],
    ],
  });

  // ---- roadmaps ------------------------------------------------------------------------------
  const jeeInput = { goal: "JEE Physics: mechanics", level: "intermediate", weeks: 8, hoursPerWeek: 6 };
  const jee = generateRoadmap(jeeInput);
  const jeeMilestones = buildMilestones(jee, jeeInput.weeks).map((m, i) => (i < 3 ? { ...m, done: true, completedAt: ago(18 - i * 7) } : m));
  insert("roadmaps", { userId: aarav.id, ...jeeInput, summary: jee.summary, milestones: jeeMilestones, createdAt: ago(24), updatedAt: ago(4) });

  const dsInput = { goal: "Data science with Python", level: "beginner", weeks: 6, hoursPerWeek: 4, context: "I know a little Python from school." };
  const ds = generateRoadmap(dsInput);
  const dsMilestones = buildMilestones(ds, dsInput.weeks).map((m, i) => (i === 0 ? { ...m, done: true, completedAt: ago(2) } : m));
  const { context: _ctx, ...dsRow } = dsInput;
  insert("roadmaps", { userId: aarav.id, ...dsRow, summary: ds.summary, milestones: dsMilestones, createdAt: ago(6), updatedAt: ago(2) });

  // ---- teacher tools library --------------------------------------------------------------------
  const lessonInput = { topic: "Projectile motion", subject: "Physics", grade: "Grade 11", durationMin: 50, style: "interactive", objectives: "Split projectile motion into independent horizontal and vertical components\nUse R = u² sin 2θ / g to predict range" };
  const lessonPlan = {
    title: "Projectile Motion: Two Motions at Once",
    overview:
      "Students discover that a projectile is really **two independent motions** — constant velocity horizontally and free fall vertically. A drop-vs-launch demo hooks them, a short worked example builds the method, and paired practice moves them from \"how high?\" to \"how far?\" questions using $R = \\dfrac{u^2 \\sin 2\\theta}{g}$.",
    objectives: [
      "Students will be able to split a projectile's velocity into horizontal and vertical components using $u\\cos\\theta$ and $u\\sin\\theta$.",
      "Students will be able to explain why horizontal and vertical motion are independent.",
      "Students will be able to calculate time of flight, maximum height and range for a projectile on level ground.",
      "Students will be able to justify why 45° gives the maximum range when air resistance is ignored.",
    ],
    prerequisites: ["Equations of motion for constant acceleration (SUVAT)", "Resolving a vector into components with sine and cosine", "Free fall with $g \\approx 9.8\\ \\text{m/s}^2$"],
    materials: ["Two identical coins and a ruler (drop-vs-flick demo)", "Projector with the PhET Projectile Motion simulation", "Mini whiteboards and markers", "Tiered practice worksheet (bronze / silver / gold)", "Exit ticket slips"],
    agenda: [
      { minutes: 5, title: "Hook: drop vs flick", description: "Place one coin on the desk edge and another on a ruler. Flick the ruler so one coin flies off sideways while the other drops straight down. Students predict which lands first.", teacher: "Run the demo twice; take a show of hands before revealing. Ask: \"Why did they land together?\"", students: "Predict, observe and discuss with a partner why the sideways speed didn't matter." },
      { minutes: 10, title: "Mini-lesson: independent components", description: "Introduce horizontal ($a_x = 0$) and vertical ($a_y = -g$) motion as separate problems linked only by time. Resolve $u$ into $u\\cos\\theta$ and $u\\sin\\theta$.", teacher: "Model resolving a 20 m/s launch at 30° on the board, thinking aloud.", students: "Copy the two-column \"horizontal | vertical\" table and complete the components." },
      { minutes: 10, title: "Worked example: time, height, range", description: "Find time of flight, maximum height and range for $u = 20\\ \\text{m/s}$, $\\theta = 30^\\circ$, then derive $R = u^2 \\sin 2\\theta / g$.", teacher: "I do / we do: complete the time of flight, then hand height and range to the class step by step.", students: "Answer each next step on mini whiteboards; compare with a partner." },
      { minutes: 5, title: "Simulation check", description: "Use the PhET simulation to test the worked answer and vary the angle to find the maximum range.", teacher: "Ask students to call out angles; plot range against angle on the board.", students: "Predict range for each angle and spot that 30° and 60° give equal ranges." },
      { minutes: 15, title: "Tiered paired practice", description: "Bronze: horizontal launches from a cliff. Silver: angled launches on level ground. Gold: launch from a height, solving a quadratic for time.", teacher: "Circulate; stamp correct answers; pull a small group for re-teaching on components.", students: "Work in pairs, choosing a starting tier and moving up when confident." },
      { minutes: 5, title: "Plenary and exit ticket", description: "Revisit the coin demo with the new language, then complete the exit ticket.", teacher: "Cold-call two students to explain the demo using \"independent components\".", students: "Explain the demo and answer the exit ticket individually." },
    ],
    checksForUnderstanding: [
      "Hinge question after the mini-lesson: \"At the top of the flight, what is the acceleration?\" (Answer: 9.8 m/s² downward — not zero.)",
      "Mini whiteboards: write the horizontal and vertical components of a 15 m/s launch at 60°.",
      "Thumbs up/down: \"A heavier ball launched at the same speed and angle goes further.\" (False — mass doesn't appear in the equations.)",
      "Cold-call: \"Why do 30° and 60° give the same range?\"",
    ],
    differentiation: {
      support: ["Two-column horizontal/vertical template with the known quantities pre-filled.", "Formula card listing the SUVAT equations and $R = u^2 \\sin 2\\theta / g$.", "Bronze-tier questions use horizontal launches only (no resolving needed)."],
      challenge: ["Derive $R = u^2 \\sin 2\\theta / g$ from the component equations.", "Show algebraically that complementary angles give the same range.", "Gold tier: launch from a 10 m cliff — find the time of flight by solving a quadratic."],
    },
    homework: "Complete questions 1–6 on the projectile motion sheet (show the horizontal/vertical table for each) and use the PhET simulation to find the launch angle that maximises range from a 5 m high platform. Is it still 45°?",
    exitTicket: ["A ball is kicked at 25 m/s at 40° above the horizontal. Write its horizontal and vertical velocity components.", "What is the vertical acceleration of a projectile at the top of its path?", "Explain in one sentence why 45° gives the maximum range on level ground."],
  };
  insert("artifacts", { userId: teacher.id, type: "lesson_plan", title: lessonPlan.title, data: { input: lessonInput, plan: lessonPlan }, createdAt: ago(4, 3), updatedAt: ago(4, 3) });

  const paperInput = {
    source: "material",
    materialId: kinematicsNotes?.id,
    subject: "Physics",
    grade: "Grade 11",
    durationMin: 60,
    difficulty: "mixed",
    sections: [
      { type: "mcq", count: 6, marksEach: 1 },
      { type: "truefalse", count: 4, marksEach: 1 },
      { type: "short", count: 3, marksEach: 3 },
      { type: "long", count: 2, marksEach: 6 },
    ],
  };
  const paper = assemblePaper(paperInput, generatePaper(paperInput, { label: "Kinematics", sourceText: kinematicsNotes?.text ?? null }));
  paper.title = "Kinematics — Unit 1 Test";
  insert("artifacts", { userId: teacher.id, type: "question_paper", title: paper.title, data: { input: paperInput, paper }, createdAt: ago(2, 6), updatedAt: ago(2, 6) });

  const q = (number, question, expected, studentAnswer, score, maxScore, verdict, feedback) => ({ number, question, expected, studentAnswer, score, maxScore, verdict, feedback });
  const questions = [
    q("1", "Define displacement and state whether it is a scalar or a vector.", "Change in position of an object; a vector (has magnitude and direction).", "Displacement is how far something moves from where it started in a straight line. It is a vector.", 2, 2, "correct", "Good — you identified it as a vector and described the straight-line change in position."),
    q("2", "A car accelerates uniformly from 10 m/s to 30 m/s in 4 s. Find its acceleration.", "$a = (30 - 10)/4 = 5\\ \\text{m/s}^2$ — 1 mark method, 1 mark answer with unit.", "a = (30−10)/4 = 5", 1.5, 2, "partial", "Correct working and value, but the unit (m/s²) is missing — always include units in final answers."),
    q("3", "A stone is dropped from rest from a 45 m cliff. How long does it take to reach the ground? ($g = 10\\ \\text{m/s}^2$)", "$s = \\tfrac12 g t^2 \\Rightarrow 45 = 5t^2 \\Rightarrow t = 3\\ \\text{s}$.", "45 = ½ × 10 × t², t² = 9, t = 3 s", 3, 3, "correct", "Clear, well-set-out working with the correct equation choice."),
    q("4", "What does the area under a velocity–time graph represent?", "Displacement (distance travelled if motion is in one direction).", "The acceleration of the object", 0, 1, "incorrect", "The *slope* of a v–t graph is acceleration; the *area* under it is displacement. Revisit motion graphs in the Unit 1 notes."),
    q("5", "A ball is thrown horizontally at 8 m/s from a 20 m high wall. How far from the wall does it land? ($g = 10\\ \\text{m/s}^2$)", "Vertical: $20 = 5t^2 \\Rightarrow t = 2\\ \\text{s}$. Horizontal: $x = 8 \\times 2 = 16\\ \\text{m}$.", "t = 2 s because 20 = 5t². Then distance = 8 × 2 = 16 m", 4, 4, "correct", "Excellent — you treated the horizontal and vertical motions independently, which is exactly the key idea."),
    q("6", "Explain why a projectile launched at 45° travels furthest on level ground.", "$R = u^2 \\sin 2\\theta / g$; $\\sin 2\\theta$ is maximum (= 1) when $2\\theta = 90^\\circ$, i.e. $\\theta = 45^\\circ$. Mention no air resistance.", "Because 45 is halfway between 0 and 90 so it balances height and distance", 1, 3, "partial", "The intuition about balancing height and distance is reasonable, but use the range equation: sin 2θ is largest when θ = 45°."),
    q("7", "State Newton's first law of motion.", "An object stays at rest or moves with constant velocity unless acted on by a net (resultant) force.", "", 0, 2, "unanswered", "No answer found — this was a straightforward recall mark. Make sure you attempt every question."),
  ];
  const totalScore = Math.round(questions.reduce((s, x) => s + x.score, 0) * 10) / 10;
  const result = {
    studentName: "Rohan Gupta",
    questions,
    overallFeedback:
      "A solid attempt, Rohan. Your calculations are well set out and you clearly understand how to treat horizontal and vertical motion separately — question 5 was excellent. Marks were lost on units, on confusing the slope and area of a v–t graph, and on an unanswered recall question. Revise motion graphs and learn Newton's laws word for word.",
    strengths: ["Clear, step-by-step working in calculations", "Correctly splits projectile motion into independent components", "Good choice of equations of motion"],
    focusAreas: ["Motion graphs: slope vs area of a v–t graph", "Always include units in final answers", "Newton's first law — learn the precise wording", "Using the range equation to justify the 45° result"],
    legibility: "mostly_clear",
    totalScore,
    maxScore: questions.reduce((s, x) => s + x.maxScore, 0),
  };
  insert("artifacts", {
    userId: teacher.id,
    type: "answer_check",
    title: "Answer check — Rohan Gupta (Kinematics quiz)",
    data: { input: { strictness: "balanced", files: ["rohan-kinematics-p1.jpg", "rohan-kinematics-p2.jpg"] }, result },
    createdAt: ago(1, 2),
    updatedAt: ago(1, 2),
  });

}

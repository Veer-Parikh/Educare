// Live smoke test of every AI feature through the real API, against an in-memory
// MongoDB (your real database is never touched). Needs GEMINI_API_KEY in .env.
// Usage: npm run smoke:ai            (all)
//        npm run smoke:ai -- quiz,tutor   (subset: quiz,cards,studio,roadmap,tutor,grading,tools,play)
import { MongoMemoryReplSet } from "mongodb-memory-server";
const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" }, instanceOpts: [{ launchTimeout: 60_000 }] });
process.env.DATABASE_URL = repl.getUri("educare_ai");
process.env.NODE_ENV = "test";
process.env.UPLOAD_DIR = "test/.uploads";
const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const server = createApp().listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = async (m, p, { token, body, form } = {}) => {
  const h = { "x-timezone": "Asia/Kolkata" };
  if (token) h.Authorization = `Bearer ${token}`;
  let b;
  if (form) b = form;
  else if (body) {
    h["content-type"] = "application/json";
    b = JSON.stringify(body);
  }
  const r = await fetch(base + p, { method: m, headers: h, body: b });
  const t = await r.text();
  try {
    return { s: r.status, b: JSON.parse(t), raw: t };
  } catch {
    return { s: r.status, b: null, raw: t };
  }
};
const step = async (name, fn) => {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`OK   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s) ${out ?? ""}`);
  } catch (e) {
    console.log(`FAIL ${name} (${((Date.now() - t) / 1000).toFixed(1)}s) ${e.message}`);
  }
};
const must = (r, code) => {
  if (r.s !== code) throw new Error(`HTTP ${r.s}: ${r.raw.slice(0, 300)}`);
  return r.b;
};
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const want = (k) => !only || only.has(k);

const T = must(await call("POST", "/auth/register", { body: { name: "Tara Teacher", email: "t@school.edu", password: "password123", role: "TEACHER" } }), 201);
const St = must(await call("POST", "/auth/register", { body: { name: "Sam Student", email: "s@school.edu", password: "password123", role: "STUDENT" } }), 201);
const cls = must(await call("POST", "/classes", { token: T.token, body: { name: "Biology 9", subject: "Biology" } }), 201).classroom;
must(await call("POST", "/classes/join", { token: St.token, body: { code: cls.code } }), 201);
const nf = new FormData();
nf.append("kind", "note");
nf.append("title", "Photosynthesis notes");
nf.append(
  "body",
  "Photosynthesis converts light energy into chemical energy. It occurs in chloroplasts. Light reactions in thylakoids produce ATP and NADPH and release O2 from water. The Calvin cycle in the stroma fixes CO2 into G3P using ATP and NADPH. Limiting factors: light intensity, CO2 concentration, temperature.",
);
const mat = must(await call("POST", `/classes/${cls.id}/materials`, { token: T.token, form: nf }), 201).material;

let quiz, asg, sub, paper;

if (want("quiz")) {
  await step("quiz from class material", async () => {
    const f = new FormData();
    f.append("source", "material");
    f.append("materialId", mat.id);
    f.append("count", "5");
    f.append("types", JSON.stringify(["mcq", "truefalse", "short"]));
    quiz = must(await call("POST", "/quizzes/generate", { token: St.token, form: f }), 201).quiz;
    return `${quiz.questions.length}q "${quiz.title}" types=${[...new Set(quiz.questions.map((q) => q.type))]}`;
  });
  await step("quiz attempt w/ AI short-answer grading", async () => {
    const answers = quiz.questions.map((q) => (q.type === "short" ? { questionId: q.id, text: "It happens in the chloroplast using light" } : { questionId: q.id, choiceIndex: q.answerIndex }));
    const r = must(await call("POST", `/quizzes/${quiz.id}/attempts`, { token: St.token, body: { answers } }), 201);
    return `score ${r.attempt.score}/${r.attempt.maxScore} fb="${(r.attempt.answers.find((a) => a.feedback)?.feedback || "").slice(0, 80)}"`;
  });
  await step("adaptive weak-spot quiz", async () => {
    const b = must(await call("POST", "/quizzes/adaptive", { token: St.token, body: { count: 4, concepts: ["Calvin cycle", "Light reactions"] } }), 201);
    return `${b.quiz.questions.length}q "${b.quiz.title}"`;
  });
}
if (want("cards")) {
  await step("flashcards from topic", async () => {
    const f = new FormData();
    f.append("source", "topic");
    f.append("topic", "Mitosis vs meiosis");
    f.append("count", "8");
    const b = must(await call("POST", "/decks/generate", { token: St.token, form: f }), 201);
    return `${b.added} cards "${b.deck.title}"`;
  });
}
if (want("studio")) {
  await step("study studio from pasted text", async () => {
    const f = new FormData();
    f.append("source", "text");
    f.append(
      "text",
      "The French Revolution (1789-1799) was a period of political and societal change in France. It began with the Estates General of 1789 and ended with the coup of 18 Brumaire in 1799 and the formation of the French Consulate. Many of its ideas are considered fundamental principles of liberal democracy. Causes included financial crisis, food scarcity, Enlightenment ideas and resentment of privilege.",
    );
    f.append("cardCount", "6");
    f.append("quizCount", "4");
    const b = must(await call("POST", "/studio", { token: St.token, form: f }), 201);
    return `"${b.studySet.title}" kp=${b.studySet.keyPoints.length} concepts=${b.studySet.concepts.length} deck=${!!b.studySet.deckId} quiz=${!!b.studySet.quizId} warnings=${b.warnings.length}`;
  });
}
if (want("roadmap")) {
  await step("roadmap generate", async () => {
    const b = must(await call("POST", "/roadmaps/generate", { token: St.token, body: { goal: "Learn data structures for coding interviews", level: "beginner", weeks: 4, hoursPerWeek: 6 } }), 201);
    return `${b.roadmap.milestones.length} weeks; trusted links=${b.roadmap.milestones.flatMap((m) => m.resources).filter((r) => r.url).length}`;
  });
}
if (want("tutor")) {
  await step("tutor SSE stream (class-grounded, socratic)", async () => {
    const c = must(await call("POST", "/tutor/conversations", { token: St.token, body: { mode: "socratic", classroomId: cls.id } }), 201).conversation;
    const f = new FormData();
    f.append("content", "Where does the Calvin cycle happen and what does it need?");
    const r = await fetch(`${base}/tutor/conversations/${c.id}/messages`, { method: "POST", headers: { Authorization: `Bearer ${St.token}` }, body: f });
    const text = await r.text();
    const deltas = (text.match(/event: delta/g) || []).length;
    const err = text.match(/event: error\ndata: (.*)/);
    if (!text.includes("event: done")) throw new Error(err ? err[1] : text.slice(0, 300));
    const full = [...text.matchAll(/event: delta\ndata: (.*)/g)].map((m) => JSON.parse(m[1]).text).join("");
    return `${deltas} chunks, cites=${/\[Material/.test(full)} "${full.slice(0, 140).replace(/\n/g, " ")}..."`;
  });
}
if (want("grading")) {
  await step("rubric suggestion", async () => {
    const b = must(await call("POST", "/assignments/suggest-rubric", { token: T.token, body: { title: "Essay: role of chloroplasts", instructions: "Explain the structure and function of chloroplasts in 300 words.", points: 20 } }), 200);
    return b.rubric.map((r) => `${r.title}:${r.points}`).join(", ");
  });
  await step("assignment + student pre-submit feedback", async () => {
    const f = new FormData();
    f.append("title", "Explain photosynthesis");
    f.append("instructions", "In 150-200 words, explain the light reactions and the Calvin cycle, and name two limiting factors.");
    f.append("rubric", JSON.stringify([{ title: "Light reactions", points: 4 }, { title: "Calvin cycle", points: 4 }, { title: "Limiting factors", points: 2 }]));
    asg = must(await call("POST", `/classes/${cls.id}/assignments`, { token: T.token, form: f }), 201).assignment;
    const d = new FormData();
    d.append("text", "Photosynthesis happens in plants. The light reactions make oxygen. The Calvin cycle makes sugar.");
    const b = must(await call("POST", `/assignments/${asg.id}/draft-feedback`, { token: St.token, form: d }), 200);
    return `checklist=${b.feedback.checklist.map((c) => c.status).join("/")} next="${b.feedback.nextSteps[0]?.slice(0, 70)}"`;
  });
  await step("AI draft grade (teacher)", async () => {
    const f = new FormData();
    f.append(
      "text",
      "Light reactions occur in the thylakoid membranes and split water, releasing O2 and making ATP and NADPH. The Calvin cycle in the stroma uses ATP and NADPH to fix CO2 into G3P. Limiting factors include light intensity and CO2 concentration.",
    );
    sub = must(await call("PUT", `/assignments/${asg.id}/submission`, { token: St.token, form: f }), 201).submission;
    const b = must(await call("POST", `/submissions/${sub.id}/ai-draft`, { token: T.token }), 200);
    const d = b.submission.aiDraft;
    return `score=${d.score}/${asg.points} rubric=${d.rubricScores.map((r) => r.score).join("+")} conf=${d.confidence} model=${d.model}`;
  });
}
if (want("tools")) {
  await step("lesson plan", async () => {
    const b = must(await call("POST", "/tools/lesson-plan", { token: T.token, body: { topic: "Photosynthesis", grade: "Grade 9", durationMin: 40 } }), 201);
    const p = b.artifact.data.plan;
    return `"${p.title}" segments=${p.agenda.length} minutes=${p.agenda.reduce((s, a) => s + a.minutes, 0)}`;
  });
  await step("question paper", async () => {
    const b = must(
      await call("POST", "/tools/question-paper", {
        token: T.token,
        body: { source: "topic", topic: "Cell biology", grade: "Grade 9", durationMin: 45, sections: [{ type: "mcq", count: 4, marksEach: 1 }, { type: "short", count: 2, marksEach: 3 }, { type: "long", count: 1, marksEach: 5 }] },
      }),
      201,
    );
    paper = b.artifact;
    const p = paper.data.paper;
    return `total=${p.totalMarks} sections=${p.sections.map((s) => s.questions.length).join("/")}`;
  });
  await step("paper -> quiz", async () => {
    const b = must(await call("POST", `/tools/question-paper/${paper.id}/to-quiz`, { token: T.token }), 201);
    return `${b.quiz.questions.length} questions`;
  });
  await step("answer-sheet check", async () => {
    const f = new FormData();
    f.append("answerKeyText", "Q1 (2 marks): Chloroplast. Q2 (3 marks): Light reactions produce ATP, NADPH and O2 in the thylakoids. Q3 (5 marks): Calvin cycle fixes CO2 in the stroma into G3P using ATP and NADPH; RuBisCO enzyme.");
    f.append("answerSheet", new Blob(["Q1. chloroplast\nQ2. light reactions make ATP and oxygen\nQ3. the calvin cycle uses carbon dioxide to make sugar"], { type: "text/plain" }), "sheet.txt");
    const b = must(await call("POST", "/tools/answer-check", { token: T.token, form: f }), 201);
    const r = b.artifact.data.result;
    return `${r.totalScore}/${r.maxScore} verdicts=${r.questions.map((q) => q.verdict).join(",")}`;
  });
  await step("class insights AI summary", async () => {
    const b = must(await call("POST", `/classes/${cls.id}/insights/summary`, { token: T.token }), 200);
    return `"${b.summary.slice(0, 100).replace(/\n/g, " ")}..."`;
  });
}
if (want("play")) {
  await step("space quick-quiz + guide", async () => {
    const q = must(await call("POST", "/play/quick-quiz", { token: St.token, body: { topic: "Mars", facts: ["Mars has two moons", "Olympus Mons is the largest volcano"], count: 3 } }), 200);
    const g = must(await call("POST", "/play/guide", { token: St.token, body: { kind: "planet", target: "Saturn" } }), 200);
    return `${q.questions.length}q; guide="${g.text.slice(0, 80)}"`;
  });
}

server.close();
await prisma.$disconnect();
await repl.stop();

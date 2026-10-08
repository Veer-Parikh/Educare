// End-to-end API test against an in-memory MongoDB replica set.
// AI is disabled here so the suite is deterministic; AI paths are checked for graceful 503s.
import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let repl;
let server;
let base;
let prisma;

async function call(method, path, { token, body, form } = {}) {
  const headers = { "x-timezone": "Asia/Kolkata" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const S = {}; // shared state across steps

before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const uri = repl.getUri("educare_test");
  Object.assign(process.env, {
    DATABASE_URL: uri,
    JWT_SECRET: "integration-test-secret",
    NODE_ENV: "test",
    GEMINI_API_KEY: "",
    CLOUDINARY_CLOUD_NAME: "",
    UPLOAD_DIR: "test/.uploads",
  });
  const { createApp } = await import("../src/app.js");
  ({ prisma } = await import("../src/lib/prisma.js"));
  // `prisma db push` stalls against mongodb-memory-server on Windows, so create
  // the unique indexes the app relies on directly.
  const unique = {
    users: [{ email: 1 }],
    classrooms: [{ code: 1 }],
    memberships: [{ classroomId: 1, userId: 1 }],
    submissions: [{ assignmentId: 1, studentId: 1 }],
    concept_mastery: [{ userId: 1, concept: 1 }],
  };
  for (const [collection, keys] of Object.entries(unique)) {
    await prisma.$runCommandRaw({
      createIndexes: collection,
      indexes: keys.map((key) => ({ key, name: `${Object.keys(key).join("_")}_unique`, unique: true })),
    });
  }
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await prisma?.$disconnect();
  await repl?.stop();
  const fs = await import("node:fs/promises");
  await fs.rm("test/.uploads", { recursive: true, force: true });
});

describe("auth", () => {
  it("reports health", async () => {
    const r = await call("GET", "/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.db, "ok");
  });

  it("registers teacher and students", async () => {
    const t = await call("POST", "/auth/register", { body: { name: "Asha Rao", email: "Asha@School.edu", password: "password123", role: "TEACHER", sapId: "1001" } });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal(t.body.user.email, "asha@school.edu");
    assert.equal(t.body.user.passwordHash, undefined);
    S.teacher = t.body;

    const a = await call("POST", "/auth/register", { body: { name: "Ben Student", email: "ben@school.edu", password: "password123", role: "STUDENT", sapId: "2001" } });
    const b = await call("POST", "/auth/register", { body: { name: "Cara Student", email: "cara@school.edu", password: "password123", role: "STUDENT" } });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    S.ben = a.body;
    S.cara = b.body;
  });

  it("rejects duplicates and bad input", async () => {
    const dup = await call("POST", "/auth/register", { body: { name: "X Y", email: "ben@school.edu", password: "password123", role: "STUDENT" } });
    assert.equal(dup.status, 409);
    const sap = await call("POST", "/auth/register", { body: { name: "X Y", email: "dup.sap@school.edu", password: "password123", role: "STUDENT", sapId: "2001" } });
    assert.equal(sap.status, 409);
    const weak = await call("POST", "/auth/register", { body: { name: "X Y", email: "weak.pass@school.edu", password: "short", role: "STUDENT" } });
    assert.equal(weak.status, 400);
    assert.match(weak.body.error, /password/i);
  });

  it("logs in by SAP ID or email", async () => {
    const bySap = await call("POST", "/auth/login", { body: { identifier: "2001", password: "password123" } });
    assert.equal(bySap.status, 200);
    const byEmail = await call("POST", "/auth/login", { body: { identifier: "ASHA@school.edu", password: "password123" } });
    assert.equal(byEmail.status, 200);
    const bad = await call("POST", "/auth/login", { body: { identifier: "2001", password: "wrong-password" } });
    assert.equal(bad.status, 401);
  });

  it("guards private routes", async () => {
    assert.equal((await call("GET", "/dashboard")).status, 401);
    assert.equal((await call("GET", "/dashboard", { token: "garbage" })).status, 401);
    const me = await call("GET", "/auth/me", { token: S.ben.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, "Ben Student");
  });
});

describe("classes", () => {
  it("only teachers create classes", async () => {
    const denied = await call("POST", "/classes", { token: S.ben.token, body: { name: "Physics" } });
    assert.equal(denied.status, 403);
    const c = await call("POST", "/classes", { token: S.teacher.token, body: { name: "Physics 101", subject: "Physics", theme: "sky" } });
    assert.equal(c.status, 201);
    assert.match(c.body.classroom.code, /^[A-Z2-9]{7}$/);
    S.class = c.body.classroom;
  });

  it("students join by code (case-insensitive, idempotent)", async () => {
    const before = await call("GET", `/classes/${S.class.id}`, { token: S.cara.token });
    assert.equal(before.status, 404);
    const j = await call("POST", "/classes/join", { token: S.ben.token, body: { code: S.class.code.toLowerCase() } });
    assert.equal(j.status, 201);
    const again = await call("POST", "/classes/join", { token: S.ben.token, body: { code: S.class.code } });
    assert.equal(again.status, 200);
    assert.equal(again.body.alreadyMember, true);
    assert.equal((await call("POST", "/classes/join", { token: S.cara.token, body: { code: S.class.code } })).status, 201);
    const list = await call("GET", "/classes", { token: S.ben.token });
    assert.equal(list.body.classes.length, 1);
    assert.equal(list.body.classes[0]._count.members, 2);
  });

  it("returns 404 for malformed ids instead of crashing", async () => {
    assert.equal((await call("GET", "/classes/not-an-id", { token: S.ben.token })).status, 404);
    assert.equal((await call("GET", "/assignments/123", { token: S.ben.token })).status, 404);
  });

  it("posts announcements and notifies students", async () => {
    const form = new FormData();
    form.append("body", "Lab safety briefing on Monday.");
    form.append("pinned", "true");
    const a = await call("POST", `/classes/${S.class.id}/announcements`, { token: S.teacher.token, form });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(a.body.announcement.pinned, true);
    const n = await call("GET", "/notifications", { token: S.ben.token });
    assert.ok(n.body.unread >= 1);
    assert.ok(n.body.notifications.some((x) => x.type === "announcement"));
  });

  it("adds a note material that is AI-ready", async () => {
    const form = new FormData();
    form.append("kind", "note");
    form.append("title", "Newton's laws summary");
    form.append("body", "First law: inertia. Second law: F = ma. Third law: action and reaction.");
    const m = await call("POST", `/classes/${S.class.id}/materials`, { token: S.teacher.token, form });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    assert.equal(m.body.material.textStatus, "ready");
    const list = await call("GET", `/classes/${S.class.id}/materials`, { token: S.ben.token });
    assert.equal(list.body.materials.length, 1);
    assert.equal(list.body.materials[0].text, undefined);
  });
});

describe("assignments", () => {
  it("creates an assignment with a rubric (points = rubric total)", async () => {
    const form = new FormData();
    form.append("title", "Lab report: pendulum");
    form.append("instructions", "Measure the period for 3 lengths and explain the relationship.");
    form.append("dueAt", new Date(Date.now() + 3 * 86_400_000).toISOString());
    form.append("rubric", JSON.stringify([
      { title: "Method", points: 10 },
      { title: "Analysis", description: "Correct T ∝ √L reasoning", points: 15 },
    ]));
    form.append("attachments", new Blob(["Worksheet text"], { type: "text/plain" }), "worksheet.txt");
    const r = await call("POST", `/classes/${S.class.id}/assignments`, { token: S.teacher.token, form });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.assignment.points, 25);
    assert.equal(r.body.assignment.rubric.length, 2);
    assert.equal(r.body.assignment.attachments.length, 1);
    S.assignment = r.body.assignment;
  });

  it("shows student status and accepts submission + resubmission", async () => {
    const list = await call("GET", `/classes/${S.class.id}/assignments`, { token: S.ben.token });
    assert.equal(list.body.assignments[0].myStatus, "assigned");

    const empty = await call("PUT", `/assignments/${S.assignment.id}/submission`, { token: S.ben.token, form: new FormData() });
    assert.equal(empty.status, 400);

    const form = new FormData();
    form.append("text", "Period grows with the square root of length.");
    form.append("attachments", new Blob(["data,1,2,3"], { type: "text/csv" }), "data.csv");
    const s = await call("PUT", `/assignments/${S.assignment.id}/submission`, { token: S.ben.token, form });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal(s.body.status, "submitted");
    assert.ok(s.body.reward.xp >= 20);
    S.submission = s.body.submission;

    const re = new FormData();
    re.append("text", "Updated: T = 2π√(L/g).");
    re.append("keepAttachments", JSON.stringify(S.submission.attachments.map((a) => a.key)));
    const s2 = await call("PUT", `/assignments/${S.assignment.id}/submission`, { token: S.ben.token, form: re });
    assert.equal(s2.status, 200);
    assert.equal(s2.body.submission.attachments.length, 1);
    assert.equal(s2.body.reward, null);
  });

  it("gives teachers a roster with statuses", async () => {
    const r = await call("GET", `/assignments/${S.assignment.id}/submissions`, { token: S.teacher.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.roster.length, 2);
    assert.equal(r.body.roster[0].status, "submitted");
    assert.equal(r.body.roster[1].status, "assigned");
    assert.equal((await call("GET", `/assignments/${S.assignment.id}/submissions`, { token: S.ben.token })).status, 403);
  });

  it("grades with validation and notifies the student", async () => {
    const tooHigh = await call("POST", `/submissions/${S.submission.id}/grade`, { token: S.teacher.token, body: { score: 99 } });
    assert.equal(tooHigh.status, 400);
    const crit = S.assignment.rubric;
    const g = await call("POST", `/submissions/${S.submission.id}/grade`, {
      token: S.teacher.token,
      body: { score: 21, feedback: "Great analysis.", rubricScores: [{ criterionId: crit[0].id, score: 8 }, { criterionId: crit[1].id, score: 13 }] },
    });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    assert.equal(g.body.submission.status, "graded");

    const view = await call("GET", `/assignments/${S.assignment.id}`, { token: S.ben.token });
    assert.equal(view.body.myStatus, "graded");
    assert.equal(view.body.submission.score, 21);
    assert.equal(view.body.submission.aiDraft, undefined);
    const n = await call("GET", "/notifications", { token: S.ben.token });
    assert.ok(n.body.notifications.some((x) => x.type === "grade"));

    const locked = await call("PUT", `/assignments/${S.assignment.id}/submission`, { token: S.ben.token, form: (() => { const f = new FormData(); f.append("text", "late edit"); return f; })() });
    assert.equal(locked.status, 400);
  });

  it("blocks late work when late submissions are off", async () => {
    const form = new FormData();
    form.append("title", "Closed worksheet");
    form.append("dueAt", new Date(Date.now() - 86_400_000).toISOString());
    form.append("allowLate", "false");
    const a = await call("POST", `/classes/${S.class.id}/assignments`, { token: S.teacher.token, form });
    assert.equal(a.status, 201);
    const sub = new FormData();
    sub.append("text", "too late");
    const r = await call("PUT", `/assignments/${a.body.assignment.id}/submission`, { token: S.cara.token, form: sub });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /deadline/i);
  });

  it("AI endpoints fail gracefully without a key", async () => {
    const r = await call("POST", `/submissions/${S.submission.id}/ai-draft`, { token: S.teacher.token });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /not configured/i);
  });
});

describe("quizzes & mastery", () => {
  it("teacher authors, publishes; student takes it without seeing answers", async () => {
    const q = await call("POST", "/quizzes", {
      token: S.teacher.token,
      body: {
        title: "Forces check-in",
        topic: "Forces",
        questions: [
          { type: "mcq", prompt: "Unit of force?", options: ["Joule", "Newton", "Watt", "Pascal"], answerIndex: 1, concept: "Units" },
          { type: "truefalse", prompt: "Mass and weight are the same.", answerIndex: 1, concept: "Mass vs weight" },
          { type: "short", prompt: "State Newton's second law.", answerText: "Force equals mass times acceleration", concept: "Second law" },
        ],
      },
    });
    assert.equal(q.status, 201, JSON.stringify(q.body));
    S.quiz = q.body.quiz;

    const noClass = await call("PATCH", `/quizzes/${S.quiz.id}`, { token: S.teacher.token, body: { published: true } });
    assert.equal(noClass.status, 400);
    const pub = await call("PATCH", `/quizzes/${S.quiz.id}`, { token: S.teacher.token, body: { published: true, classroomId: S.class.id } });
    assert.equal(pub.status, 200);

    const assigned = await call("GET", "/quizzes?scope=assigned", { token: S.ben.token });
    assert.equal(assigned.body.quizzes.length, 1);
    const view = await call("GET", `/quizzes/${S.quiz.id}`, { token: S.ben.token });
    assert.equal(view.status, 200);
    assert.equal(view.body.quiz.questions[0].answerIndex, undefined);
    assert.equal(view.body.quiz.questions[2].answerText, undefined);
  });

  it("grades an attempt (short answers fall back to keyword check) and updates mastery", async () => {
    const qs = S.quiz.questions;
    const r = await call("POST", `/quizzes/${S.quiz.id}/attempts`, {
      token: S.ben.token,
      body: {
        answers: [
          { questionId: qs[0].id, choiceIndex: 1 },
          { questionId: qs[1].id, choiceIndex: 0 },
          { questionId: qs[2].id, text: "Force equals mass times acceleration" },
        ],
        durationSec: 90,
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.attempt.maxScore, 4);
    assert.equal(r.body.attempt.score, 3);
    assert.equal(r.body.attempt.answers[1].correct, false);

    const m = await call("GET", "/mastery", { token: S.ben.token });
    assert.equal(m.body.concepts.length, 3);
    assert.ok(m.body.weak.some((c) => c.concept === "Mass vs weight"));

    const results = await call("GET", `/quizzes/${S.quiz.id}/results`, { token: S.teacher.token });
    assert.equal(results.body.summary.learners, 1);
    assert.equal(results.body.perQuestion[1].correctRate, 0);
    assert.equal(results.body.notAttempted.length, 1);
    assert.equal((await call("GET", `/quizzes/${S.quiz.id}/results`, { token: S.ben.token })).status, 403);
  });
});

describe("flashcards", () => {
  it("schedules reviews with FSRS and aggregates review XP", async () => {
    const d = await call("POST", "/decks", { token: S.cara.token, body: { title: "Cell biology" } });
    assert.equal(d.status, 201);
    const add = await call("POST", `/decks/${d.body.deck.id}/cards`, {
      token: S.cara.token,
      body: { cards: [{ front: "Powerhouse of the cell?", back: "Mitochondria" }, { front: "Site of photosynthesis?", back: "Chloroplast" }] },
    });
    assert.equal(add.body.added, 2);

    const q = await call("GET", "/review/queue", { token: S.cara.token });
    assert.equal(q.body.total, 2);
    assert.ok(q.body.cards[0].intervals["3"]);

    for (const c of q.body.cards) {
      const r = await call("POST", `/cards/${c.id}/review`, { token: S.cara.token, body: { rating: 4 } });
      assert.equal(r.status, 200);
      assert.ok(new Date(r.body.card.due) > new Date());
    }
    const after = await call("GET", "/review/queue", { token: S.cara.token });
    assert.equal(after.body.total, 0);

    const rows = await prisma.activity.findMany({ where: { userId: S.cara.user.id, type: "review" } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].meta.count, 2);

    assert.equal((await call("GET", `/decks/${d.body.deck.id}`, { token: S.ben.token })).status, 403);
  });
});

describe("engagement & analytics", () => {
  it("logs focus time and builds streaks", async () => {
    const f = await call("POST", "/activity/focus", { token: S.cara.token, body: { minutes: 25 } });
    assert.equal(f.status, 201);
    const s = await call("GET", "/activity/summary?days=30", { token: S.cara.token });
    assert.equal(s.body.streak, 1);
    assert.equal(s.body.weekFocusMinutes, 25);
    assert.ok(s.body.todayXp >= 29);
  });

  it("serves role-specific dashboards", async () => {
    const st = await call("GET", "/dashboard", { token: S.ben.token });
    assert.equal(st.status, 200, JSON.stringify(st.body));
    assert.equal(st.body.role, "STUDENT");
    assert.equal(st.body.recentGrades.length, 1);
    assert.ok(Array.isArray(st.body.weakConcepts));

    const t = await call("GET", "/dashboard", { token: S.teacher.token });
    assert.equal(t.status, 200, JSON.stringify(t.body));
    assert.equal(t.body.role, "TEACHER");
    assert.equal(t.body.stats.students, 2);
  });

  it("computes class insights, gradebook and leaderboard", async () => {
    const i = await call("GET", `/classes/${S.class.id}/insights`, { token: S.teacher.token });
    assert.equal(i.status, 200, JSON.stringify(i.body));
    assert.equal(i.body.summary.students, 2);
    assert.ok(i.body.weakConcepts.length === 0 || i.body.weakConcepts[0].total >= 2);
    assert.equal((await call("GET", `/classes/${S.class.id}/insights`, { token: S.ben.token })).status, 403);

    const g = await call("GET", `/classes/${S.class.id}/gradebook`, { token: S.teacher.token });
    assert.equal(g.status, 200);
    const ben = g.body.rows.find((r) => r.student.name === "Ben Student");
    assert.equal(ben.averagePct, 84);

    const l = await call("GET", `/classes/${S.class.id}/leaderboard`, { token: S.cara.token });
    assert.equal(l.status, 200);
    // Ben: submission 30 + quiz 14 = 44 XP; Cara: reviews 4 + focus 25 = 29 XP.
    assert.equal(l.body.leaderboard[0].user.name, "Ben Student");
    assert.equal(l.body.leaderboard[0].xp, 44);
    assert.equal(l.body.me.rank, 2);
  });

  it("schedules live sessions and exposes them on the agenda", async () => {
    const s = await call("POST", `/classes/${S.class.id}/sessions`, {
      token: S.teacher.token,
      body: { title: "Doubt clearing", startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMin: 45 },
    });
    assert.equal(s.status, 201);
    assert.match(s.body.session.meetingUrl, /^https:\/\/meet\.jit\.si\/EduCare-/);
    const a = await call("GET", "/dashboard/agenda", { token: S.ben.token });
    assert.ok(a.body.events.some((e) => e.type === "session"));
    assert.ok(a.body.events.some((e) => e.type === "assignment"));
  });

  it("tutor conversations work; messaging reports AI unavailable cleanly", async () => {
    const c = await call("POST", "/tutor/conversations", { token: S.ben.token, body: { mode: "socratic", classroomId: S.class.id } });
    assert.equal(c.status, 201);
    assert.equal(c.body.conversation.classroom.name, "Physics 101");
    const form = new FormData();
    form.append("content", "Why does a pendulum swing?");
    const m = await call("POST", `/tutor/conversations/${c.body.conversation.id}/messages`, { token: S.ben.token, form });
    assert.equal(m.status, 503);
    const denied = await call("POST", "/tutor/conversations", { token: S.teacher.token, body: { classroomId: "64b7f0c2a1b2c3d4e5f60718" } });
    assert.equal(denied.status, 404);
  });
});

describe("cleanup", () => {
  it("students can leave; deleting a class cascades", async () => {
    assert.equal((await call("DELETE", `/classes/${S.class.id}/members/${S.cara.user.id}`, { token: S.cara.token })).status, 200);
    assert.equal((await call("DELETE", `/classes/${S.class.id}`, { token: S.ben.token })).status, 403);
    assert.equal((await call("DELETE", `/classes/${S.class.id}`, { token: S.teacher.token })).status, 200);
    assert.equal((await call("GET", `/assignments/${S.assignment.id}`, { token: S.teacher.token })).status, 404);
    assert.equal(await prisma.submission.count(), 0);
    const quiz = await prisma.quiz.findUnique({ where: { id: S.quiz.id } });
    assert.equal(quiz.classroomId, null);
  });
});

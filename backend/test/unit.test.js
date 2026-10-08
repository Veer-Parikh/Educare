import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "mongodb://127.0.0.1:1/unit";
process.env.JWT_SECRET ??= "unit-test-secret-value";
process.env.NODE_ENV = "test";

const { dayKey, dayDiff, lastNDays } = await import("../src/lib/dates.js");
const { levelFor } = await import("../src/lib/gamification.js");
const { reviewCard, previewIntervals } = await import("../src/lib/srs.js");
const { normalizeQuestion } = await import("../src/ai/quiz.js");
const { joinCode, isObjectId } = await import("../src/lib/ids.js");
const { studentStatus } = await import("../src/modules/assignments.js");

test("dayKey respects timezone", () => {
  const d = new Date("2026-01-01T20:00:00Z");
  assert.equal(dayKey(d, "UTC"), "2026-01-01");
  assert.equal(dayKey(d, "Asia/Kolkata"), "2026-01-02");
  assert.equal(dayKey(d, "Not/AZone"), "2026-01-01");
});

test("dayDiff and lastNDays", () => {
  assert.equal(dayDiff("2026-02-28", "2026-03-01"), 1);
  assert.equal(dayDiff("2026-03-01", "2026-03-01"), 0);
  const days = lastNDays(7, "UTC", new Date("2026-03-10T12:00:00Z"));
  assert.equal(days.length, 7);
  assert.equal(days.at(-1), "2026-03-10");
  assert.equal(days[0], "2026-03-04");
});

test("level curve", () => {
  assert.deepEqual(levelFor(0), { level: 1, into: 0, next: 100 });
  assert.equal(levelFor(100).level, 2);
  assert.equal(levelFor(219).level, 2);
  assert.equal(levelFor(220).level, 3);
});

test("FSRS moves a new card forward and 'Easy' beats 'Again'", () => {
  const now = new Date("2026-05-01T10:00:00Z");
  const card = { due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null };
  const again = reviewCard(card, 1, now);
  const easy = reviewCard(card, 4, now);
  assert.ok(easy.due > again.due);
  assert.equal(easy.reps, 1);
  const labels = previewIntervals(card, now);
  assert.deepEqual(Object.keys(labels), ["1", "2", "3", "4"]);
});

test("normalizeQuestion keeps the right answer after shuffling", () => {
  for (let i = 0; i < 20; i++) {
    const q = normalizeQuestion({ type: "mcq", prompt: "2+2?", options: ["3", "4", "5", "6"], answerIndex: 1, explanation: "x", concept: "addition", difficulty: "easy" });
    assert.equal(q.options[q.answerIndex], "4");
  }
  assert.equal(normalizeQuestion({ type: "mcq", prompt: "bad", options: ["a", "a", "b", "c"], answerIndex: 0 }), null);
  assert.equal(normalizeQuestion({ type: "mcq", prompt: "bad", options: ["a", "b", "c", "d"], answerIndex: 9 }), null);
  const tf = normalizeQuestion({ type: "truefalse", prompt: "Sky is blue", options: [], answerText: "True", difficulty: "easy" });
  assert.deepEqual(tf.options, ["True", "False"]);
  assert.equal(tf.answerIndex, 0);
  assert.equal(normalizeQuestion({ type: "short", prompt: "Explain", options: [] }), null);
});

test("join codes and ids", () => {
  const code = joinCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{7}$/);
  assert.ok(isObjectId("64b7f0c2a1b2c3d4e5f60718"));
  assert.ok(!isObjectId("join"));
});

test("student assignment status", () => {
  const past = { dueAt: new Date(Date.now() - 1000) };
  const future = { dueAt: new Date(Date.now() + 60_000) };
  assert.equal(studentStatus(past, null), "missing");
  assert.equal(studentStatus(future, null), "assigned");
  assert.equal(studentStatus({ dueAt: null }, null), "assigned");
  assert.equal(studentStatus(past, { status: "submitted", late: true }), "late");
  assert.equal(studentStatus(past, { status: "graded", late: true }), "graded");
});

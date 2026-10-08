// In-browser stand-in for the EduCare API, used by demo mode.
//
// The database is a set of plain arrays (one per Prisma model) that lives in
// memory and is mirrored to localStorage after every write, so a demo survives
// reloads but never leaves the browser. Route handlers (./routes/*.js) are ports
// of the Express modules in backend/src/modules and return the same shapes.
//
// Conventions for route code:
//   - rows hold real Date objects; responses are JSON round-tripped like Express does
//   - import only relative paths (with ".js") or npm packages, so this runs in Node too
//   - throw the error helpers below; the router turns them into ApiError-like failures

const STORE_KEY = "educare.demo.db";
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Errors (mirror backend/src/lib/errors.js)
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (msg = "Bad request", details) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Please sign in to continue") => new HttpError(401, msg);
export const forbidden = (msg = "You don't have access to this") => new HttpError(403, msg);
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);

// ---------------------------------------------------------------------------
// Ids and dates (mirror backend/src/lib/ids.js and dates.js)
// ---------------------------------------------------------------------------

const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
let counter = Math.floor(Math.random() * 0xffffff);

/** 24-hex id shaped like a Mongo ObjectId (timestamp prefix keeps them roughly ordered). */
export function objectId() {
  counter = (counter + 1) % 0xffffff;
  return Math.floor(Date.now() / 1000).toString(16).padStart(8, "0") + hex(10) + counter.toString(16).padStart(6, "0");
}
export const isObjectId = (v) => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const shortId = () => Array.from({ length: 8 }, () => B64[Math.floor(Math.random() * 64)]).join("");

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function joinCode(length = 7) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function dayKey(date = new Date(), tz = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: isValidTimezone(tz) ? tz : "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function dayDiff(a, b) {
  const toUtc = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

export function lastNDays(n, tz = "UTC", now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * DAY), tz));
  return [...new Set(out)];
}

export const addDays = (date, days) => new Date(date.getTime() + days * DAY);

/** Resolve after a short, human-feeling pause (used to make AI calls feel real). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** Prisma defaults per collection, applied by insert(). */
const DEFAULTS = {
  users: () => ({ sapId: null, institution: null, bio: null, avatarUrl: null, timezone: null, xp: 0, streak: 0, longestStreak: 0, lastActiveDay: null, dailyGoalXp: 60 }),
  classrooms: () => ({ subject: null, section: null, description: null, theme: "amber", archived: false }),
  memberships: () => ({ joinedAt: new Date() }),
  announcements: () => ({ pinned: false, attachments: [] }),
  materials: () => ({ description: null, file: null, url: null, text: null, textStatus: "none", charCount: 0 }),
  assignments: () => ({ instructions: null, dueAt: null, points: 100, rubric: [], attachments: [], allowLate: true, aiFeedback: true }),
  submissions: () => ({ text: null, attachments: [], status: "submitted", late: false, submittedAt: new Date(), score: null, feedback: null, rubricScores: [], gradedAt: null, gradedById: null, aiDraft: null }),
  liveSessions: () => ({ description: null, durationMin: 60 }),
  quizzes: () => ({ classroomId: null, topic: null, description: null, difficulty: "mixed", source: "topic", questions: [], published: false, dueAt: null, timeLimitMin: null }),
  quizAttempts: () => ({ answers: [], durationSec: null, completedAt: new Date() }),
  conceptMastery: () => ({ subject: null, correct: 0, total: 0, lastSeenAt: new Date() }),
  decks: () => ({ description: null, subject: null }),
  cards: () => ({ hint: null, due: new Date(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null }),
  conversations: () => ({ classroomId: null, title: "New chat", mode: "explain", studySetId: null }),
  messages: () => ({ attachments: [] }),
  roadmaps: () => ({ summary: null, milestones: [] }),
  studySets: () => ({ sourceName: null, sourceText: null, keyPoints: [], concepts: [], questionsToPonder: [], deckId: null, quizId: null }),
  artifacts: () => ({}),
  notifications: () => ({ body: null, link: null, read: false }),
  activities: () => ({ minutes: null, meta: null }),
};

/** Collections without an updatedAt column in the Prisma schema. */
const NO_UPDATED_AT = new Set(["memberships", "liveSessions", "quizAttempts", "conceptMastery", "messages", "studySets", "notifications", "activities"]);
/** Collections without a createdAt column. */
const NO_CREATED_AT = new Set(["memberships", "quizAttempts", "conceptMastery"]);

export const COLLECTIONS = Object.keys(DEFAULTS);

/** The live database: `db.users`, `db.classrooms`, ... */
export const db = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadDb() {
  const raw = storage()?.getItem(STORE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw, (_k, v) => (typeof v === "string" && DATE_RE.test(v) ? new Date(v) : v));
    for (const c of COLLECTIONS) db[c] = Array.isArray(data[c]) ? data[c] : [];
    return db.users.length > 0;
  } catch {
    return false;
  }
}

export function saveDb() {
  try {
    storage()?.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded or storage blocked: the demo keeps working in memory */
  }
}

export function clearDb() {
  for (const c of COLLECTIONS) db[c] = [];
  try {
    storage()?.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

/** Insert a row with Prisma-style defaults, id and timestamps. Returns the row. */
/** Drop undefined values so they leave defaults/existing fields alone, like Prisma. */
const defined = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined));

export function insert(collection, data) {
  const now = new Date();
  const row = { id: objectId(), ...DEFAULTS[collection](), ...defined(data) };
  if (!NO_CREATED_AT.has(collection)) row.createdAt ??= now;
  if (!NO_UPDATED_AT.has(collection)) row.updatedAt ??= row.createdAt ?? now;
  db[collection].push(row);
  return row;
}

/** Shallow-merge `patch` into a row (in place) and bump updatedAt. Returns the row. */
export function update(collection, row, patch) {
  Object.assign(row, defined(patch));
  if (!NO_UPDATED_AT.has(collection)) row.updatedAt = new Date();
  return row;
}

/** Remove every row matching `pred`. Returns the number removed. */
export function remove(collection, pred) {
  const before = db[collection].length;
  db[collection] = db[collection].filter((r) => !pred(r));
  return before - db[collection].length;
}

export const byId = (collection, id) => db[collection].find((r) => r.id === id) ?? null;

/** Find a row by id or throw a 404 named `what`. */
export function findOr404(collection, id, what) {
  const row = isObjectId(id) ? byId(collection, id) : null;
  if (!row) throw notFound(what);
  return row;
}

/** Sort helper: `rows.sort(by("createdAt", "desc"))`. Handles Dates, numbers, strings and nulls (nulls last). */
export function by(key, dir = "asc") {
  const sign = dir === "desc" ? -1 : 1;
  return (a, b) => {
    const x = typeof key === "function" ? key(a) : a[key];
    const y = typeof key === "function" ? key(b) : b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * sign;
  };
}

// ---------------------------------------------------------------------------
// Users, access and gamification (mirror backend/src/lib/access.js, gamification.js)
// ---------------------------------------------------------------------------

/** Pick fields from a user row, like Prisma `select: { id: true, name: true, ... }`. Defaults to id, name, avatarUrl. */
export const pickUser = (u, ...fields) => (u ? Object.fromEntries((fields.length ? fields : ["id", "name", "avatarUrl"]).map((k) => [k, u[k] ?? null])) : null);

/** backend `userSummary` select: { id, name, email, role, avatarUrl, sapId }. */
export const userSummary = (u) => pickUser(u, "id", "name", "email", "role", "avatarUrl", "sapId");

/** A full user row as Prisma returns it (passwordHash is omitted globally). */
export const publicUser = (u) => {
  if (!u) return null;
  const { passwordHash: _omit, ...rest } = u;
  return rest;
};

export function currentStreak(user, tz) {
  if (!user.lastActiveDay) return 0;
  return dayDiff(user.lastActiveDay, dayKey(new Date(), tz)) <= 1 ? user.streak : 0;
}

export function levelFor(totalXp) {
  let level = 1;
  let need = 100;
  let remaining = totalXp;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = Math.round(need * 1.2);
  }
  return { level, into: remaining, next: need };
}

/** Shape returned to the client for the signed-in user (backend presentUser). */
export function presentUser(user, tz = "UTC") {
  const { passwordHash: _omit, ...rest } = user;
  return { ...rest, currentStreak: currentStreak(user, tz), level: levelFor(user.xp) };
}

export const XP = {
  review: 2,
  quizBase: 10,
  quizPerCorrect: 2,
  submit: 20,
  submitOnTimeBonus: 10,
  focusPerMinute: 1,
  focusMaxPerSession: 120,
  tutorMessage: 1,
  tutorDailyCap: 20,
  studio: 15,
  roadmapMilestone: 20,
  gameBase: 5,
  gamePerCorrect: 2,
  gameDailyCap: 60,
};

export function xpToday(userId, tz, type) {
  const day = dayKey(new Date(), tz);
  return db.activities.filter((a) => a.userId === userId && a.day === day && (!type || a.type === type)).reduce((s, a) => s + a.xp, 0);
}

/** Record an XP-earning action and advance the streak. Same contract as the backend. */
export function awardXp(userId, type, xp, { tz = "UTC", minutes, meta, aggregate = false, dailyCap } = {}) {
  const day = dayKey(new Date(), tz);
  let amount = Math.max(0, Math.round(xp));
  if (dailyCap) amount = Math.max(0, Math.min(amount, dailyCap - xpToday(userId, tz, type)));

  if (aggregate) {
    const existing = db.activities.find((a) => a.userId === userId && a.day === day && a.type === type);
    if (existing) {
      existing.xp += amount;
      existing.meta = { ...(existing.meta ?? {}), count: (existing.meta?.count ?? 1) + 1 };
    } else insert("activities", { userId, type, xp: amount, day, meta: { count: 1, ...(meta ?? {}) } });
  } else insert("activities", { userId, type, xp: amount, day, minutes: minutes ?? null, meta: meta ?? null });

  const user = byId("users", userId);
  let streak = user.streak;
  let leveledStreak = false;
  if (user.lastActiveDay !== day) {
    streak = user.lastActiveDay && dayDiff(user.lastActiveDay, day) === 1 ? user.streak + 1 : 1;
    leveledStreak = true;
    update("users", user, { streak, lastActiveDay: day, longestStreak: Math.max(user.longestStreak, streak) });
  }
  if (amount > 0) update("users", user, { xp: user.xp + amount });
  return { xp: amount, streak, leveledStreak };
}

export function notify(userIds, { type, title, body, link }) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    insert("notifications", { userId, type, title: title.slice(0, 200), body: body?.slice(0, 500) ?? null, link: link ?? null });
  }
}

export function classAccess(classroomId, user, { teacher = false } = {}) {
  const classroom = isObjectId(classroomId) ? byId("classrooms", classroomId) : null;
  if (!classroom) throw notFound("Class");
  const isTeacher = classroom.teacherId === user.id;
  const isMember = isTeacher || db.memberships.some((m) => m.classroomId === classroomId && m.userId === user.id);
  if (!isMember) throw notFound("Class");
  if (teacher && !isTeacher) throw forbidden("Only this class's teacher can do that.");
  return { classroom, isTeacher };
}

export function myClassIds(user) {
  if (user.role === "TEACHER") return db.classrooms.filter((c) => c.teacherId === user.id).map((c) => c.id);
  return db.memberships.filter((m) => m.userId === user.id).map((m) => m.classroomId);
}

export const classStudentIds = (classroomId) => db.memberships.filter((m) => m.classroomId === classroomId).map((m) => m.userId);

export function requireRole(user, role) {
  if (user.role !== role) throw forbidden(role === "TEACHER" ? "Only teachers can do this." : "Only students can do this.");
}

// ---------------------------------------------------------------------------
// Request parsing (multipart forms arrive as string fields, like multer)
// ---------------------------------------------------------------------------

/** Parse a JSON-encoded form field (backend jsonField). */
export function jsonField(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw badRequest("Malformed JSON in form field");
  }
}

export const toBool = (v, fallback) => (v === undefined || v === null || v === "" ? fallback : v === true || v === "true");
export const toNum = (v, fallback) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));
export const optText = (v) => (typeof v === "string" && v.trim() ? v.trim() : v == null || v === "" ? undefined : v);
/** For PATCH bodies: "" or null clears the field, undefined leaves it alone. */
export const nullableText = (v) => (v === undefined ? undefined : typeof v === "string" && !v.trim() ? null : v === null ? null : String(v).trim());

export function requireText(v, label, max = 5000) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw badRequest(`${label} is required`);
  return s.slice(0, max);
}

/**
 * Turn an uploaded File into a FileRef. Small files become data URLs so they
 * survive reloads; larger ones get an object URL for this browser session.
 */
export async function fileRef(file) {
  const ref = { url: "", name: file.name || "file", mimeType: file.type || "application/octet-stream", size: file.size ?? 0, key: `demo:${shortId()}` };
  if (typeof FileReader !== "undefined" && file.size <= 750_000) {
    ref.url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }
  if (!ref.url && typeof URL !== "undefined" && URL.createObjectURL) {
    try {
      ref.url = URL.createObjectURL(file);
    } catch {
      /* not a Blob (Node smoke tests) */
    }
  }
  if (!ref.url) ref.url = `#${encodeURIComponent(ref.name)}`;
  return ref;
}

/** Read text out of an uploaded file when it's plain text; otherwise null. */
export async function fileText(file) {
  if (!file) return null;
  const textual = /^text\//.test(file.type || "") || /\.(txt|md|csv|json)$/i.test(file.name || "");
  if (!textual || typeof file.text !== "function") return null;
  try {
    return (await file.text()).slice(0, 60_000);
  } catch {
    return null;
  }
}

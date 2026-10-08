// Port of backend/src/modules/classes.js (classes router + announcementRouter).
import {
  badRequest,
  by,
  byId,
  classAccess,
  classStudentIds,
  db,
  fileRef,
  findOr404,
  forbidden,
  insert,
  joinCode,
  notFound,
  notify,
  pickUser,
  remove,
  requireRole,
  toBool,
  update,
  userSummary,
} from "../core.js";
import { route } from "../router.js";

export const THEMES = ["amber", "sky", "violet", "emerald", "rose", "slate", "orange", "teal"];

// ---- validation (mirrors the zod schemas; messages formatted "path: message") ----

const fail = (path, msg) => badRequest(`${path}: ${msg}`);

function str(v, path, { min = 0, max, minMsg = `String must contain at least ${min} character(s)` } = {}) {
  if (typeof v !== "string") throw fail(path, v === undefined ? "Required" : "Expected string");
  const s = v.trim();
  if (s.length < min) throw fail(path, minMsg);
  if (max && s.length > max) throw fail(path, `String must contain at most ${max} character(s)`);
  return s;
}
/** zOptText: "" -> undefined. */
const optStr = (v, path, max) => (v === undefined || v === null || (typeof v === "string" && !v.trim()) ? undefined : str(v, path, { max }));
/** zNullableText: "" or null -> null, undefined -> undefined. */
const nullStr = (v, path, max) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : str(v, path, { max }));
function theme(v) {
  if (v === undefined) return undefined;
  if (!THEMES.includes(v)) throw fail("theme", `Invalid enum value. Expected ${THEMES.map((t) => `'${t}'`).join(" | ")}, received '${v}'`);
  return v;
}
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function uniqueCode() {
  for (let i = 0; i < 8; i++) {
    const code = joinCode();
    if (!db.classrooms.some((c) => c.code === code)) return code;
  }
  throw new Error("Could not allocate a class code");
}

/** classInclude: { teacher: userSummary, _count: { members, assignments, materials } } */
const presentClass = (c) => ({
  ...c,
  teacher: userSummary(byId("users", c.teacherId)),
  _count: {
    members: db.memberships.filter((m) => m.classroomId === c.id).length,
    assignments: db.assignments.filter((a) => a.classroomId === c.id).length,
    materials: db.materials.filter((m) => m.classroomId === c.id).length,
  },
});

// ---- classes ---------------------------------------------------------------

route("GET", "/classes", (req) => {
  const archived = req.query.archived === "true";
  const mine =
    req.user.role === "TEACHER"
      ? (c) => c.teacherId === req.user.id
      : (c) => db.memberships.some((m) => m.classroomId === c.id && m.userId === req.user.id);
  const classes = db.classrooms.filter((c) => c.archived === archived && mine(c)).sort(by("updatedAt", "desc"));
  return { classes: classes.map(presentClass) };
});

route("POST", "/classes", (req) => {
  requireRole(req.user, "TEACHER");
  const b = req.body ?? {};
  const data = strip({
    name: str(b.name, "name", { min: 2, max: 80, minMsg: "Give the class a name" }),
    subject: optStr(b.subject, "subject", 80),
    section: optStr(b.section, "section", 40),
    description: optStr(b.description, "description", 1000),
    theme: theme(b.theme),
  });
  const classroom = insert("classrooms", { ...data, code: uniqueCode(), teacherId: req.user.id });
  return { classroom: presentClass(classroom) };
});

route("POST", "/classes/join", (req) => {
  requireRole(req.user, "STUDENT");
  const code = str(req.body?.code, "code", { min: 4, max: 12 }).toUpperCase();
  const classroom = db.classrooms.find((c) => c.code === code);
  if (!classroom) throw notFound("Class with that code");
  if (classroom.archived) throw badRequest("This class is archived and no longer accepting students.");

  const existing = db.memberships.find((m) => m.classroomId === classroom.id && m.userId === req.user.id);
  if (!existing) {
    insert("memberships", { classroomId: classroom.id, userId: req.user.id });
    notify([classroom.teacherId], {
      type: "class.joined",
      title: `${req.user.name} joined ${classroom.name}`,
      link: `/app/classes/${classroom.id}/people`,
    });
  }
  return { classroom, alreadyMember: Boolean(existing) };
});

route("GET", "/classes/:classId", (req) => {
  const { classroom, isTeacher } = classAccess(req.params.classId, req.user);
  return { classroom: presentClass(classroom), isTeacher };
});

route("PATCH", "/classes/:classId", (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const b = req.body ?? {};
  if (b.archived !== undefined && typeof b.archived !== "boolean") throw fail("archived", "Expected boolean");
  const data = strip({
    name: b.name === undefined ? undefined : str(b.name, "name", { min: 2, max: 80 }),
    subject: nullStr(b.subject, "subject", 80),
    section: nullStr(b.section, "section", 40),
    description: nullStr(b.description, "description", 1000),
    theme: theme(b.theme),
    archived: b.archived,
  });
  update("classrooms", classroom, data);
  return { classroom: presentClass(classroom) };
});

route("DELETE", "/classes/:classId", (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const id = classroom.id;
  // Prisma referential actions: cascade class-owned rows, SetNull on quizzes and tutor chats.
  const assignmentIds = new Set(db.assignments.filter((a) => a.classroomId === id).map((a) => a.id));
  remove("submissions", (s) => assignmentIds.has(s.assignmentId));
  remove("assignments", (a) => a.classroomId === id);
  remove("memberships", (m) => m.classroomId === id);
  remove("announcements", (a) => a.classroomId === id);
  remove("materials", (m) => m.classroomId === id);
  remove("liveSessions", (s) => s.classroomId === id);
  for (const q of db.quizzes) if (q.classroomId === id) update("quizzes", q, { classroomId: null });
  for (const c of db.conversations) if (c.classroomId === id) update("conversations", c, { classroomId: null });
  remove("classrooms", (c) => c.id === id);
  return { ok: true };
});

route("POST", "/classes/:classId/code", (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  update("classrooms", classroom, { code: uniqueCode() });
  return { classroom: presentClass(classroom) };
});

// ---- people ---------------------------------------------------------------

route("GET", "/classes/:classId/members", (req) => {
  const { classroom } = classAccess(req.params.classId, req.user);
  const students = db.memberships
    .filter((m) => m.classroomId === classroom.id)
    .sort(by("joinedAt"))
    .map((m) => {
      const u = byId("users", m.userId);
      return { ...pickUser(u, "id", "name", "email", "role", "avatarUrl", "sapId", "xp"), joinedAt: m.joinedAt };
    });
  return { teacher: userSummary(byId("users", classroom.teacherId)), students };
});

route("DELETE", "/classes/:classId/members/:userId", (req) => {
  const { classroom, isTeacher } = classAccess(req.params.classId, req.user);
  const self = req.params.userId === req.user.id;
  if (!isTeacher && !self) throw forbidden();
  if (isTeacher && self) throw badRequest("Teachers can't leave their own class. Archive or delete it instead.");
  const count = remove("memberships", (m) => m.classroomId === classroom.id && m.userId === req.params.userId);
  if (!count) throw notFound("Member");
  return { ok: true };
});

// ---- announcements ---------------------------------------------------------

/** announcementInclude: { author: userSummary } */
const presentAnnouncement = (a) => ({ ...a, author: userSummary(byId("users", a.authorId)) });

route("GET", "/classes/:classId/announcements", (req) => {
  classAccess(req.params.classId, req.user);
  const announcements = db.announcements
    .filter((a) => a.classroomId === req.params.classId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
    .slice(0, 100);
  return { announcements: announcements.map(presentAnnouncement) };
});

route("POST", "/classes/:classId/announcements", async (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const b = req.body ?? {};
  const body = str(b.body, "body", { min: 1, max: 5000, minMsg: "Write something first" });
  if (b.pinned !== undefined && !["true", "false", true, false].includes(b.pinned)) throw fail("pinned", "Expected boolean");
  const pinned = toBool(b.pinned, undefined);
  const files = (req.files?.attachments ?? []).slice(0, 5);
  const attachments = await Promise.all(files.map(fileRef));
  const announcement = insert("announcements", strip({ body, pinned, attachments, classroomId: classroom.id, authorId: req.user.id }));
  notify(classStudentIds(classroom.id), {
    type: "announcement",
    title: `New announcement in ${classroom.name}`,
    body: body.slice(0, 140),
    link: `/app/classes/${classroom.id}`,
  });
  return { announcement: presentAnnouncement(announcement) };
});

function ownAnnouncement(req) {
  const a = findOr404("announcements", req.params.id, "Announcement");
  classAccess(a.classroomId, req.user, { teacher: true });
  return a;
}

route("PATCH", "/announcements/:id", (req) => {
  requireRole(req.user, "TEACHER");
  const a = ownAnnouncement(req);
  const b = req.body ?? {};
  if (b.pinned !== undefined && typeof b.pinned !== "boolean") throw fail("pinned", "Expected boolean");
  const data = strip({ body: b.body === undefined ? undefined : str(b.body, "body", { min: 1, max: 5000 }), pinned: b.pinned });
  update("announcements", a, data);
  return { announcement: presentAnnouncement(a) };
});

route("DELETE", "/announcements/:id", (req) => {
  requireRole(req.user, "TEACHER");
  const a = ownAnnouncement(req);
  remove("announcements", (r) => r.id === a.id);
  return { ok: true };
});

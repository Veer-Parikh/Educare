// Port of backend/src/modules/sessions.js.
import { badRequest, by, byId, classAccess, classStudentIds, db, findOr404, insert, notify, optText, remove, requireRole, userSummary } from "../core.js";
import { route } from "../router.js";

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "Class";

const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");

/** Unguessable Jitsi room so no meeting provider account or secret is required. */
const jitsiRoom = (name) => `https://meet.jit.si/EduCare-${slug(name)}-${hex(10)}`;

/** include: { host: userSummary } */
const present = (s) => ({ ...s, host: userSummary(byId("users", s.hostId)) });

route("GET", "/classes/:classId/sessions", (req) => {
  classAccess(req.params.classId, req.user);
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const all = req.query.all === "true";
  const sessions = db.liveSessions
    .filter((s) => s.classroomId === req.params.classId && (all || s.startsAt >= since))
    .sort(by("startsAt"))
    .slice(0, 50);
  return { sessions: sessions.map(present) };
});

function optStr(v, path, max) {
  const s = optText(v);
  if (s === undefined) return undefined;
  if (typeof s !== "string") throw badRequest(`${path}: Expected string`);
  if (s.length > max) throw badRequest(`${path}: String must contain at most ${max} character(s)`);
  return s;
}

route("POST", "/classes/:classId/sessions", (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const b = req.body ?? {};

  if (typeof b.title !== "string") throw badRequest("title: Required");
  const title = b.title.trim();
  if (title.length < 2) throw badRequest("title: String must contain at least 2 character(s)");
  if (title.length > 120) throw badRequest("title: String must contain at most 120 character(s)");
  const description = optStr(b.description, "description", 2000);
  const startsAt = new Date(b.startsAt ?? NaN); // z.coerce.date()
  if (b.startsAt == null || Number.isNaN(+startsAt)) throw badRequest("startsAt: Invalid date");
  const durationMin = b.durationMin === undefined ? 60 : Number(b.durationMin);
  if (!Number.isInteger(durationMin)) throw badRequest("durationMin: Expected integer");
  if (durationMin < 10) throw badRequest("durationMin: Number must be greater than or equal to 10");
  if (durationMin > 480) throw badRequest("durationMin: Number must be less than or equal to 480");
  const meetingUrl = optStr(b.meetingUrl, "meetingUrl", 2000);
  if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) throw badRequest("Meeting link must start with http(s)://");

  const session = insert("liveSessions", {
    title,
    description: description ?? null,
    startsAt,
    durationMin,
    meetingUrl: meetingUrl || jitsiRoom(classroom.name),
    classroomId: classroom.id,
    hostId: req.user.id,
  });
  notify(classStudentIds(classroom.id), {
    type: "session",
    title: `Live session scheduled: ${session.title}`,
    body: `${classroom.name} · ${session.startsAt.toISOString()}`,
    link: `/app/classes/${classroom.id}/live`,
  });
  return { session: present(session) };
});

route("DELETE", "/sessions/:id", (req) => {
  requireRole(req.user, "TEACHER");
  const session = findOr404("liveSessions", req.params.id, "Session");
  classAccess(session.classroomId, req.user, { teacher: true });
  remove("liveSessions", (s) => s.id === session.id);
  return { ok: true };
});

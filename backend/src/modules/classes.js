import { Router } from "express";
import { z } from "zod";
import { prisma, userSummary } from "../lib/prisma.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { parse, zBool, zNullableText, zOptText } from "../lib/http.js";
import { joinCode } from "../lib/ids.js";
import { classAccess, classStudentIds, findOr404 } from "../lib/access.js";
import { notify } from "../lib/notify.js";
import { deleteFiles, saveFiles } from "../lib/storage.js";
import { studentOnly, teacherOnly } from "../middleware/auth.js";
import { uploader } from "../middleware/upload.js";

const router = Router();

export const THEMES = ["amber", "sky", "violet", "emerald", "rose", "slate", "orange", "teal"];

const classSchema = z.object({
  name: z.string().trim().min(2, "Give the class a name").max(80),
  subject: zOptText(80),
  section: zOptText(40),
  description: zOptText(1000),
  theme: z.enum(THEMES).optional(),
});

const classPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  subject: zNullableText(80),
  section: zNullableText(40),
  description: zNullableText(1000),
  theme: z.enum(THEMES).optional(),
  archived: z.boolean().optional(),
});

async function uniqueCode() {
  for (let i = 0; i < 8; i++) {
    const code = joinCode();
    if (!(await prisma.classroom.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not allocate a class code");
}

const classInclude = {
  teacher: userSummary,
  _count: { select: { members: true, assignments: true, materials: true } },
};

// ---- classes ---------------------------------------------------------------

router.get("/", async (req, res) => {
  const archived = req.query.archived === "true";
  const where =
    req.user.role === "TEACHER"
      ? { teacherId: req.user.id, archived }
      : { archived, members: { some: { userId: req.user.id } } };
  const classes = await prisma.classroom.findMany({ where, include: classInclude, orderBy: { updatedAt: "desc" } });
  res.json({ classes });
});

router.post("/", teacherOnly, async (req, res) => {
  const data = parse(classSchema, req.body);
  const classroom = await prisma.classroom.create({
    data: { ...data, code: await uniqueCode(), teacherId: req.user.id },
    include: classInclude,
  });
  res.status(201).json({ classroom });
});

router.post("/join", studentOnly, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(12).transform((c) => c.toUpperCase()) }), req.body);
  const classroom = await prisma.classroom.findUnique({ where: { code } });
  if (!classroom) throw notFound("Class with that code");
  if (classroom.archived) throw badRequest("This class is archived and no longer accepting students.");

  const existing = await prisma.membership.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: req.user.id } },
  });
  if (!existing) {
    await prisma.membership.create({ data: { classroomId: classroom.id, userId: req.user.id } });
    notify([classroom.teacherId], {
      type: "class.joined",
      title: `${req.user.name} joined ${classroom.name}`,
      link: `/app/classes/${classroom.id}/people`,
    });
  }
  res.status(existing ? 200 : 201).json({ classroom, alreadyMember: Boolean(existing) });
});

router.get("/:classId", async (req, res) => {
  const { isTeacher } = await classAccess(req.params.classId, req.user);
  const classroom = await prisma.classroom.findUnique({ where: { id: req.params.classId }, include: classInclude });
  res.json({ classroom, isTeacher });
});

router.patch("/:classId", teacherOnly, async (req, res) => {
  await classAccess(req.params.classId, req.user, { teacher: true });
  const data = parse(classPatchSchema, req.body);
  const classroom = await prisma.classroom.update({ where: { id: req.params.classId }, data, include: classInclude });
  res.json({ classroom });
});

router.delete("/:classId", teacherOnly, async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const [materials, assignments, announcements] = await Promise.all([
    prisma.material.findMany({ where: { classroomId: classroom.id }, select: { file: true } }),
    prisma.assignment.findMany({
      where: { classroomId: classroom.id },
      select: { attachments: true, submissions: { select: { attachments: true } } },
    }),
    prisma.announcement.findMany({ where: { classroomId: classroom.id }, select: { attachments: true } }),
  ]);
  await prisma.classroom.delete({ where: { id: classroom.id } });
  // Storage cleanup after the DB delete succeeds.
  deleteFiles([
    ...materials.map((m) => m.file).filter(Boolean),
    ...assignments.flatMap((a) => [...a.attachments, ...a.submissions.flatMap((s) => s.attachments)]),
    ...announcements.flatMap((a) => a.attachments),
  ]);
  res.json({ ok: true });
});

router.post("/:classId/code", teacherOnly, async (req, res) => {
  await classAccess(req.params.classId, req.user, { teacher: true });
  const classroom = await prisma.classroom.update({
    where: { id: req.params.classId },
    data: { code: await uniqueCode() },
    include: classInclude,
  });
  res.json({ classroom });
});

// ---- people ---------------------------------------------------------------

router.get("/:classId/members", async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user);
  const [teacher, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: classroom.teacherId }, ...userSummary }),
    prisma.membership.findMany({
      where: { classroomId: classroom.id },
      include: { user: { select: { ...userSummary.select, xp: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);
  res.json({
    teacher,
    students: memberships.map((m) => ({ ...m.user, joinedAt: m.joinedAt })),
  });
});

router.delete("/:classId/members/:userId", async (req, res) => {
  const { classroom, isTeacher } = await classAccess(req.params.classId, req.user);
  const self = req.params.userId === req.user.id;
  if (!isTeacher && !self) throw forbidden();
  if (isTeacher && self) throw badRequest("Teachers can't leave their own class. Archive or delete it instead.");
  const { count } = await prisma.membership.deleteMany({ where: { classroomId: classroom.id, userId: req.params.userId } });
  if (!count) throw notFound("Member");
  res.json({ ok: true });
});

// ---- announcements ---------------------------------------------------------

const announcementInclude = { author: userSummary };

router.get("/:classId/announcements", async (req, res) => {
  await classAccess(req.params.classId, req.user);
  const announcements = await prisma.announcement.findMany({
    where: { classroomId: req.params.classId },
    include: announcementInclude,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  res.json({ announcements });
});

router.post("/:classId/announcements", teacherOnly, uploader("any", 5).array("attachments", 5), async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const data = parse(z.object({ body: z.string().trim().min(1, "Write something first").max(5000), pinned: zBool.optional() }), req.body);
  const attachments = await saveFiles(req.files, "announcements");
  const announcement = await prisma.announcement.create({
    data: { ...data, attachments, classroomId: classroom.id, authorId: req.user.id },
    include: announcementInclude,
  });
  notify(await classStudentIds(classroom.id), {
    type: "announcement",
    title: `New announcement in ${classroom.name}`,
    body: data.body.slice(0, 140),
    link: `/app/classes/${classroom.id}`,
  });
  res.status(201).json({ announcement });
});

export const announcementRouter = Router();

async function ownAnnouncement(req) {
  const a = await findOr404(prisma.announcement, req.params.id, "Announcement");
  await classAccess(a.classroomId, req.user, { teacher: true });
  return a;
}

announcementRouter.patch("/:id", teacherOnly, async (req, res) => {
  await ownAnnouncement(req);
  const data = parse(z.object({ body: z.string().trim().min(1).max(5000).optional(), pinned: z.boolean().optional() }), req.body);
  const announcement = await prisma.announcement.update({ where: { id: req.params.id }, data, include: announcementInclude });
  res.json({ announcement });
});

announcementRouter.delete("/:id", teacherOnly, async (req, res) => {
  const a = await ownAnnouncement(req);
  await prisma.announcement.delete({ where: { id: a.id } });
  deleteFiles(a.attachments);
  res.json({ ok: true });
});

export default router;

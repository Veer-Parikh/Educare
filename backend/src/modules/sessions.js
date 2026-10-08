import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma, userSummary } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { parse, zOptText } from "../lib/http.js";
import { classAccess, classStudentIds, findOr404 } from "../lib/access.js";
import { notify } from "../lib/notify.js";
import { teacherOnly } from "../middleware/auth.js";

export const classSessionsRouter = Router({ mergeParams: true });
const router = Router();

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "Class";

/** Unguessable Jitsi room so no meeting provider account or secret is required. */
const jitsiRoom = (name) => `https://meet.jit.si/EduCare-${slug(name)}-${randomBytes(5).toString("hex")}`;

classSessionsRouter.get("/", async (req, res) => {
  await classAccess(req.params.classId, req.user);
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const sessions = await prisma.liveSession.findMany({
    where: { classroomId: req.params.classId, ...(req.query.all === "true" ? {} : { startsAt: { gte: since } }) },
    include: { host: userSummary },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  res.json({ sessions });
});

classSessionsRouter.post("/", teacherOnly, async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const data = parse(
    z.object({
      title: z.string().trim().min(2).max(120),
      description: zOptText(2000),
      startsAt: z.coerce.date(),
      durationMin: z.coerce.number().int().min(10).max(480).default(60),
      meetingUrl: zOptText(2000),
    }),
    req.body,
  );
  if (data.meetingUrl && !/^https?:\/\//i.test(data.meetingUrl)) throw badRequest("Meeting link must start with http(s)://");

  const session = await prisma.liveSession.create({
    data: {
      ...data,
      meetingUrl: data.meetingUrl || jitsiRoom(classroom.name),
      classroomId: classroom.id,
      hostId: req.user.id,
    },
    include: { host: userSummary },
  });
  notify(await classStudentIds(classroom.id), {
    type: "session",
    title: `Live session scheduled: ${session.title}`,
    body: `${classroom.name} · ${session.startsAt.toISOString()}`,
    link: `/app/classes/${classroom.id}/live`,
  });
  res.status(201).json({ session });
});

router.delete("/:id", teacherOnly, async (req, res) => {
  const session = await findOr404(prisma.liveSession, req.params.id, "Session");
  await classAccess(session.classroomId, req.user, { teacher: true });
  await prisma.liveSession.delete({ where: { id: session.id } });
  res.json({ ok: true });
});

export default router;

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { isObjectId } from "../lib/ids.js";
import { notFound } from "../lib/errors.js";

const router = Router();

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId: req.user.id, read: false } }),
  ]);
  res.json({ notifications, unread });
});

router.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
  res.json({ ok: true });
});

router.post("/:id/read", async (req, res) => {
  if (!isObjectId(req.params.id)) throw notFound("Notification");
  const { count } = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
  if (!count) throw notFound("Notification");
  res.json({ ok: true });
});

export default router;

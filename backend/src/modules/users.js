import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { badRequest, conflict } from "../lib/errors.js";
import { parse, zNullableText } from "../lib/http.js";
import { saveFile } from "../lib/storage.js";
import { uploader } from "../middleware/upload.js";
import { presentUser } from "./auth.js";

const router = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: zNullableText(500),
  sapId: zNullableText(32),
  institution: zNullableText(120),
  dailyGoalXp: z.coerce.number().int().min(10).max(1000).optional(),
});

router.patch("/me", async (req, res) => {
  const data = parse(profileSchema, req.body);
  if (data.sapId && data.sapId !== req.user.sapId) {
    const taken = await prisma.user.findFirst({ where: { sapId: data.sapId, NOT: { id: req.user.id } }, select: { id: true } });
    if (taken) throw conflict("This SAP ID is already registered.");
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: presentUser(user, req.tz) });
});

router.post("/me/avatar", uploader("image", 1).single("avatar"), async (req, res) => {
  if (!req.file) throw badRequest("Choose an image.");
  const ref = await saveFile(req.file, "avatars");
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: ref.url } });
  res.json({ user: presentUser(user, req.tz) });
});

export default router;

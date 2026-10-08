import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { conflict, unauthorized, badRequest } from "../lib/errors.js";
import { parse, zOptText } from "../lib/http.js";
import { isValidTimezone } from "../lib/dates.js";
import { currentStreak, levelFor } from "../lib/gamification.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";

const router = Router();
const SALT_ROUNDS = 10;
// Compared against when the account doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("educare-timing-guard", SALT_ROUNDS);

const email = z.email("Enter a valid email").transform((v) => v.trim().toLowerCase());
const password = z.string().min(8, "Password must be at least 8 characters").max(128);

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email,
  password,
  role: z.enum(["TEACHER", "STUDENT"]),
  sapId: zOptText(32),
  institution: zOptText(120),
  timezone: z.string().optional(),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or SAP ID").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});

/** Shape returned to the client for the signed-in user. */
export function presentUser(user, tz = "UTC") {
  const { passwordHash: _omit, ...rest } = user;
  return { ...rest, currentStreak: currentStreak(user, tz), level: levelFor(user.xp) };
}

router.post("/register", authLimiter, async (req, res) => {
  const data = parse(registerSchema, req.body);

  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    throw conflict("An account with this email already exists.");
  }
  if (data.sapId && (await prisma.user.findFirst({ where: { sapId: data.sapId }, select: { id: true } }))) {
    throw conflict("This SAP ID is already registered.");
  }

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      sapId: data.sapId,
      institution: data.institution,
      timezone: isValidTimezone(data.timezone) ? data.timezone : undefined,
      passwordHash: await bcrypt.hash(data.password, SALT_ROUNDS),
    },
  });

  res.status(201).json({ token: signToken(user), user: presentUser(user, user.timezone) });
});

router.post("/login", authLimiter, async (req, res) => {
  const { identifier, password: pw } = parse(loginSchema, req.body);
  const byEmail = identifier.includes("@");

  const user = byEmail
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() }, omit: { passwordHash: false } })
    : await prisma.user.findFirst({ where: { sapId: identifier }, omit: { passwordHash: false } });

  const ok = await bcrypt.compare(pw, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized("Incorrect email/SAP ID or password.");

  res.json({ token: signToken(user), user: presentUser(user, user.timezone ?? "UTC") });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: presentUser(req.user, req.tz) });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(
    z.object({ currentPassword: z.string().min(1), newPassword: password }),
    req.body,
  );
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, omit: { passwordHash: false } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect.");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, SALT_ROUNDS) } });
  res.json({ ok: true });
});

export default router;

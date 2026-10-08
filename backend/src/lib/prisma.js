import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

// Single shared client. passwordHash is omitted from every query unless a
// caller explicitly opts back in with `omit: { passwordHash: false }`.
export const prisma = new PrismaClient({
  omit: { user: { passwordHash: true } },
  log: env.isProd ? ["error"] : ["warn", "error"],
});

/** Public-safe user projection for embedding in other payloads. */
export const userSummary = {
  select: { id: true, name: true, email: true, role: true, avatarUrl: true, sapId: true },
};

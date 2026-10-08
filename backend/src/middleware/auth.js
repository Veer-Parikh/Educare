import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { isValidTimezone } from "../lib/dates.js";

export async function requireAuth(req, _res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw unauthorized(err.name === "TokenExpiredError" ? "Your session expired. Please sign in again." : "Invalid session. Please sign in again.");
  }

  const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
  if (!user) throw unauthorized("This account no longer exists.");

  const headerTz = req.get("x-timezone");
  if (isValidTimezone(headerTz)) {
    req.tz = headerTz;
    if (headerTz !== user.timezone) {
      prisma.user.update({ where: { id: user.id }, data: { timezone: headerTz } }).catch(() => {});
    }
  } else {
    req.tz = isValidTimezone(user.timezone) ? user.timezone : "UTC";
  }

  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw forbidden(roles.includes("TEACHER") ? "Only teachers can do this." : "Only students can do this.");
    }
    next();
  };

export const teacherOnly = requireRole("TEACHER");
export const studentOnly = requireRole("STUDENT");

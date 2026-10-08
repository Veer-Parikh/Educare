import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

const base = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res, _next, options) =>
    res.status(options.statusCode).json({ error: "Too many requests. Please slow down and try again shortly." }),
};

const userKey = (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip));

export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 30 });

export const apiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 300, keyGenerator: userKey });

/** Generation endpoints are expensive; budget them per user. */
export const aiLimiter = rateLimit({ ...base, windowMs: 10 * 60 * 1000, limit: 40, keyGenerator: userKey });

export const chatLimiter = rateLimit({ ...base, windowMs: 10 * 60 * 1000, limit: 80, keyGenerator: userKey });

import { Router } from "express";
import { requireAuth } from "./middleware/auth.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { aiInfo } from "./lib/gemini.js";
import { storageDriver } from "./lib/storage.js";
import { prisma } from "./lib/prisma.js";

import authRouter from "./modules/auth.js";
import usersRouter from "./modules/users.js";
import classesRouter, { announcementRouter } from "./modules/classes.js";
import classMaterialsRouter, { materialRouter } from "./modules/materials.js";
import assignmentsRouter, { classAssignmentsRouter, submissionRouter } from "./modules/assignments.js";
import sessionsRouter, { classSessionsRouter } from "./modules/sessions.js";
import insightsRouter from "./modules/insights.js";
import quizzesRouter, { masteryRouter } from "./modules/quizzes.js";
import { cardRouter, deckRouter, reviewRouter } from "./modules/flashcards.js";
import tutorRouter from "./modules/tutor.js";
import studioRouter from "./modules/studio.js";
import roadmapsRouter from "./modules/roadmaps.js";
import toolsRouter, { artifactRouter } from "./modules/tools.js";
import dashboardRouter from "./modules/dashboard.js";
import notificationsRouter from "./modules/notifications.js";
import activityRouter from "./modules/activity.js";
import playRouter from "./modules/play.js";

const api = Router();

api.get("/health", async (_req, res) => {
  let db = "ok";
  try {
    await prisma.$runCommandRaw({ ping: 1 });
  } catch {
    db = "unreachable";
  }
  res.status(db === "ok" ? 200 : 503).json({ status: db === "ok" ? "ok" : "degraded", db, time: new Date().toISOString() });
});

api.get("/meta", (_req, res) => {
  res.json({ ai: aiInfo(), storage: storageDriver, version: "2.0.0" });
});

api.use("/auth", authRouter);

// Everything below requires a signed-in user.
api.use(requireAuth, apiLimiter);

api.use("/users", usersRouter);
api.use("/classes/:classId/materials", classMaterialsRouter);
api.use("/classes/:classId/assignments", classAssignmentsRouter);
api.use("/classes/:classId/sessions", classSessionsRouter);
api.use("/classes/:classId", insightsRouter);
api.use("/classes", classesRouter);
api.use("/announcements", announcementRouter);
api.use("/materials", materialRouter);
api.use("/assignments", assignmentsRouter);
api.use("/submissions", submissionRouter);
api.use("/sessions", sessionsRouter);
api.use("/quizzes", quizzesRouter);
api.use("/mastery", masteryRouter);
api.use("/decks", deckRouter);
api.use("/cards", cardRouter);
api.use("/review", reviewRouter);
api.use("/tutor", tutorRouter);
api.use("/studio", studioRouter);
api.use("/roadmaps", roadmapsRouter);
api.use("/tools", toolsRouter);
api.use("/artifacts", artifactRouter);
api.use("/dashboard", dashboardRouter);
api.use("/notifications", notificationsRouter);
api.use("/activity", activityRouter);
api.use("/play", playRouter);

export default api;

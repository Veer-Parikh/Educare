import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { uploadRoot } from "./lib/storage.js";
import api from "./routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      // Uploaded images/PDFs are embedded by the frontend, which may live on another origin.
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || env.CLIENT_ORIGIN.includes(origin) || (!env.isProd && LOCALHOST.test(origin))) return cb(null, true);
        cb(null, false);
      },
      exposedHeaders: ["RateLimit", "RateLimit-Policy"],
    }),
  );
  app.use(
    compression({
      // Never buffer server-sent events.
      filter: (req, res) => !String(res.getHeader("Content-Type") ?? "").includes("text/event-stream") && compression.filter(req, res),
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));
  if (!env.isTest) app.use(morgan(env.isProd ? "combined" : "dev"));

  app.use("/uploads", express.static(uploadRoot, { maxAge: "7d", index: false, fallthrough: false }));
  app.use("/api", api);
  app.use("/api", notFoundHandler);

  // Single-service deploys: serve the built frontend when it's present.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

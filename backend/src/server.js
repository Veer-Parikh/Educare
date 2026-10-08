import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { aiInfo } from "./lib/gemini.js";
import { storageDriver } from "./lib/storage.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  const ai = aiInfo();
  console.log(`\n  EduCare API  →  http://localhost:${env.PORT}/api`);
  console.log(`  AI: ${ai.enabled ? ai.models.join(" → ") : "disabled (set GEMINI_API_KEY)"}`);
  console.log(`  Storage: ${storageDriver}\n`);
});

// AI generations (answer-sheet checks, question papers) can take a few minutes.
server.requestTimeout = 6 * 60 * 1000;
server.headersTimeout = 65 * 1000;

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

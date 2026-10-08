// Run the API against a throwaway in-memory MongoDB, pre-seeded with demo data.
// Great for trying EduCare without setting up a database. Data is lost on exit.
//
//   npm run demo
//
// Uses GEMINI_API_KEY / Cloudinary settings from .env if present.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

console.log("Starting in-memory MongoDB…");
const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" }, instanceOpts: [{ launchTimeout: 60_000 }] });
process.env.DATABASE_URL = repl.getUri("educare_demo");
process.env.JWT_SECRET ||= "demo-mode-secret-change-me";

execFileSync(process.execPath, [path.join(here, "seed.js")], { stdio: "inherit", env: process.env });

await import("../src/server.js");

const stop = async () => {
  await repl.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

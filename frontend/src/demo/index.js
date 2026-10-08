// Demo mode entry point: a backend that runs entirely in the browser.
//
// Demo sessions use tokens of the form "demo.<userId>". lib/api.js sends every
// request carrying such a token here instead of to the network, so the whole app
// works with no server. Data persists in localStorage until the demo is reset,
// and is shared between the demo teacher and student (post as one, see it as the other).

import { byId, clearDb, db, HttpError, isValidTimezone, loadDb, presentUser, saveDb, sleep, unauthorized } from "./core.js";
import { match } from "./router.js";
import { DEMO_EMAILS, seed } from "./seed.js";

import "./routes/auth.js";
import "./routes/classes.js";
import "./routes/materials.js";
import "./routes/sessions.js";
import "./routes/notifications.js";
import "./routes/activity.js";
import "./routes/dashboard.js";
import "./routes/assignments.js";
import "./routes/insights.js";
import "./routes/quizzes.js";
import "./routes/flashcards.js";
import "./routes/play.js";
import "./routes/tutor.js";
import "./routes/studio.js";
import "./routes/roadmaps.js";
import "./routes/tools.js";

export const DEMO_TOKEN_PREFIX = "demo.";

let ready = false;
function ensureDb() {
  if (ready) return;
  if (!loadDb()) {
    seed();
    saveDb();
  }
  ready = true;
}

function tz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Sign in as the demo teacher or student. Returns the same shape as POST /auth/login. */
export function startDemo(role) {
  ensureDb();
  const user = db.users.find((u) => u.email === DEMO_EMAILS[role]);
  if (!user) throw new HttpError(500, "Demo data is missing. Reset the demo and try again.");
  return { token: `${DEMO_TOKEN_PREFIX}${user.id}`, user: presentUser(user, tz()) };
}

/** Wipe demo data and re-seed it from scratch. */
export function resetDemo() {
  clearDb();
  seed();
  saveDb();
  ready = true;
}

function resolveUser(token) {
  const id = token?.startsWith(DEMO_TOKEN_PREFIX) ? token.slice(DEMO_TOKEN_PREFIX.length) : null;
  const user = id ? byId("users", id) : null;
  if (!user) throw unauthorized("Your demo session ended. Please start the demo again.");
  return user;
}

/** multipart FormData -> { fields, files } the way multer would see it. */
function readForm(form) {
  const fields = {};
  const files = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "object" && v !== null && "size" in v && "type" in v) (files[k] ??= []).push(v);
    else fields[k] = v;
  }
  return { fields, files };
}

function buildReq(method, path, { body, form, token }) {
  const url = new URL(path, "http://demo.local");
  const found = match(method, url.pathname);
  if (!found) throw new HttpError(404, `Not found: ${method} ${url.pathname}`);
  const { fields, files } = form ? readForm(form) : { fields: body ?? {}, files: {} };
  const timezone = isValidTimezone(tz()) ? tz() : "UTC";
  const user = found.route.auth ? resolveUser(token) : null;
  return {
    route: found.route,
    req: { method, path: url.pathname, params: found.params, query: Object.fromEntries(url.searchParams), body: fields, files, user, tz: timezone },
  };
}

/** JSON round-trip, exactly like Express's res.json (Dates -> ISO strings, undefined dropped). */
const wire = (value) => (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value)));

/** Handle one JSON request. Resolves with the response body or throws HttpError-like { status, message }. */
export async function handle(method, path, opts = {}) {
  ensureDb();
  const { route, req } = buildReq(method, path, opts);
  await sleep(60 + Math.random() * 120); // feel like a network round trip
  if (opts.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
  try {
    return wire(await route.handler(req));
  } finally {
    if (method !== "GET") saveDb();
  }
}

/** Handle a server-sent-events request, calling onEvent(event, data) as the backend would stream it. */
export async function stream(path, form, { token, onEvent, signal }) {
  ensureDb();
  const { route, req } = buildReq("POST", path, { form, token });
  if (!route.stream) throw new HttpError(400, "Not a streaming endpoint");
  req.signal = signal;
  try {
    await route.handler(req, (event, data) => {
      if (signal?.aborted) return;
      onEvent(event, wire(data));
    });
  } finally {
    saveDb();
  }
}

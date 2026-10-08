// Port of backend/src/modules/auth.js and users.js.
import { badRequest, conflict, db, fileRef, nullableText, presentUser, toNum, unauthorized, update } from "../core.js";
import { route } from "../router.js";

route("GET", "/meta", () => ({ ai: { enabled: true, model: "demo", demo: true }, storage: "browser", version: "2.0.0-demo" }), { auth: false });
route("GET", "/health", () => ({ status: "ok", db: "ok", time: new Date().toISOString() }), { auth: false });

// Demo accounts sign in through startDemo(); these exist so the real endpoints fail gracefully.
route("POST", "/auth/login", () => {
  throw unauthorized("Demo mode: use the Teacher or Student demo buttons to sign in.");
}, { auth: false });
route("POST", "/auth/register", () => {
  throw badRequest("Registration isn't available in demo mode.");
}, { auth: false });

route("GET", "/auth/me", (req) => ({ user: presentUser(req.user, req.tz) }));

route("POST", "/auth/change-password", (req) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword) throw badRequest("Enter your current password.");
  if (!newPassword || String(newPassword).length < 8) throw badRequest("newPassword: Password must be at least 8 characters");
  return { ok: true };
});

route("PATCH", "/users/me", (req) => {
  const b = req.body ?? {};
  const patch = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (name.length < 2) throw badRequest("name: Too small");
    patch.name = name.slice(0, 80);
  }
  for (const [k, max] of [["bio", 500], ["sapId", 32], ["institution", 120]]) {
    const v = nullableText(b[k]);
    if (v !== undefined) patch[k] = v === null ? null : v.slice(0, max);
  }
  if (b.dailyGoalXp !== undefined) patch.dailyGoalXp = Math.min(1000, Math.max(10, Math.round(toNum(b.dailyGoalXp, req.user.dailyGoalXp))));
  if (patch.sapId && patch.sapId !== req.user.sapId && db.users.some((u) => u.sapId === patch.sapId && u.id !== req.user.id)) {
    throw conflict("This SAP ID is already registered.");
  }
  update("users", req.user, patch);
  return { user: presentUser(req.user, req.tz) };
});

route("POST", "/users/me/avatar", async (req) => {
  const file = req.files.avatar?.[0];
  if (!file) throw badRequest("Choose an image.");
  const ref = await fileRef(file);
  update("users", req.user, { avatarUrl: ref.url });
  return { user: presentUser(req.user, req.tz) };
});

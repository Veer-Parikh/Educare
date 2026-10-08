// Port of backend/src/modules/notifications.js.
import { by, db, isObjectId, notFound } from "../core.js";
import { route } from "../router.js";

route("GET", "/notifications", (req) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const mine = db.notifications.filter((n) => n.userId === req.user.id);
  return {
    notifications: [...mine].sort(by("createdAt", "desc")).slice(0, limit),
    unread: mine.filter((n) => !n.read).length,
  };
});

route("POST", "/notifications/read-all", (req) => {
  for (const n of db.notifications) if (n.userId === req.user.id && !n.read) n.read = true;
  return { ok: true };
});

route("POST", "/notifications/:id/read", (req) => {
  if (!isObjectId(req.params.id)) throw notFound("Notification");
  const n = db.notifications.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!n) throw notFound("Notification");
  n.read = true; // notifications have no updatedAt column
  return { ok: true };
});

// Port of backend/src/modules/materials.js.
import { badRequest, by, byId, classAccess, classStudentIds, db, fileRef, fileText, findOr404, insert, notify, optText, remove, requireRole, userSummary } from "../core.js";
import { route } from "../router.js";

const MAX_TEXT_CHARS = 60_000;
const KINDS = ["file", "link", "note"];

/** listSelect: the material without `text` / `uploaderId`, plus `uploader: userSummary`. */
const LIST_FIELDS = ["id", "classroomId", "title", "description", "kind", "file", "url", "textStatus", "charCount", "createdAt"];
const present = (m, withText = false) => ({
  ...Object.fromEntries(LIST_FIELDS.map((k) => [k, m[k] ?? null])),
  uploader: userSummary(byId("users", m.uploaderId)),
  ...(withText ? { text: m.text ?? null } : {}),
});

/** zOptText(max): "" -> undefined, trimmed, max length enforced. */
function opt(v, path, max) {
  const s = optText(v);
  if (s === undefined) return undefined;
  if (typeof s !== "string") throw badRequest(`${path}: Expected string`);
  if (s.length > max) throw badRequest(`${path}: String must contain at most ${max} character(s)`);
  return s;
}

route("GET", "/classes/:classId/materials", (req) => {
  classAccess(req.params.classId, req.user);
  const materials = db.materials.filter((m) => m.classroomId === req.params.classId).sort(by("createdAt", "desc"));
  return { materials: materials.map((m) => present(m)) };
});

route("POST", "/classes/:classId/materials", async (req) => {
  requireRole(req.user, "TEACHER");
  const { classroom } = classAccess(req.params.classId, req.user, { teacher: true });
  const b = req.body ?? {};
  const kind = b.kind === undefined || b.kind === "" ? "file" : b.kind;
  if (!KINDS.includes(kind)) throw badRequest(`kind: Invalid enum value. Expected 'file' | 'link' | 'note', received '${kind}'`);
  const data = {
    title: opt(b.title, "title", 160),
    description: opt(b.description, "description", 2000),
    url: opt(b.url, "url", 2000),
    body: opt(b.body, "body", 100_000),
  };

  const base = { classroomId: classroom.id, uploaderId: req.user.id, description: data.description ?? null };
  let material;

  if (kind === "file") {
    const upload = req.files?.file?.[0];
    if (!upload) throw badRequest("Attach a file.");
    const file = await fileRef(upload);
    // The backend extracts text (or transcribes with Gemini); the demo reads plain-text files and
    // otherwise stores a short placeholder so the material can still ground the tutor.
    const name = upload.name || "file";
    const title = data.title || name.replace(/\.[^.]+$/, "");
    const text = ((await fileText(upload)) || `${title}\n\nUploaded file "${name}" (${file.mimeType}). In demo mode the file's contents aren't extracted, so this placeholder stands in for its text.`).slice(0, MAX_TEXT_CHARS);
    material = insert("materials", { ...base, kind: "file", title, file, text, charCount: text.length, textStatus: "ready" });
  } else if (kind === "link") {
    if (!data.url || !/^https?:\/\//i.test(data.url)) throw badRequest("Enter a valid link starting with http(s)://");
    material = insert("materials", { ...base, kind: "link", title: data.title || data.url, url: data.url, textStatus: "none" });
  } else {
    if (!data.body || data.body.length < 10) throw badRequest("Write the note content.");
    if (!data.title) throw badRequest("Give the note a title.");
    material = insert("materials", { ...base, kind: "note", title: data.title, text: data.body, charCount: data.body.length, textStatus: "ready" });
  }

  notify(classStudentIds(classroom.id), {
    type: "material",
    title: `New material in ${classroom.name}`,
    body: material.title,
    link: `/app/classes/${classroom.id}/materials`,
  });
  return { material: present(material) };
});

route("GET", "/materials/:id", (req) => {
  const material = findOr404("materials", req.params.id, "Material");
  classAccess(material.classroomId, req.user);
  return { material: present(material, true) };
});

route("DELETE", "/materials/:id", (req) => {
  requireRole(req.user, "TEACHER");
  const material = findOr404("materials", req.params.id, "Material");
  classAccess(material.classroomId, req.user, { teacher: true });
  remove("materials", (m) => m.id === material.id);
  return { ok: true };
});

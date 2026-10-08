import { Router } from "express";
import { z } from "zod";
import { prisma, userSummary } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { parse, zOptText } from "../lib/http.js";
import { classAccess, classStudentIds, findOr404 } from "../lib/access.js";
import { extractLocalText, fileToParts, MAX_TEXT_CHARS } from "../lib/extract.js";
import { generateText } from "../lib/gemini.js";
import { env } from "../config/env.js";
import { notify } from "../lib/notify.js";
import { deleteFile, saveFile } from "../lib/storage.js";
import { teacherOnly } from "../middleware/auth.js";
import { uploader } from "../middleware/upload.js";

const router = Router({ mergeParams: true });

const listSelect = {
  id: true,
  classroomId: true,
  title: true,
  description: true,
  kind: true,
  file: true,
  url: true,
  textStatus: true,
  charCount: true,
  createdAt: true,
  uploader: userSummary,
};

const createSchema = z.object({
  kind: z.enum(["file", "link", "note"]).default("file"),
  title: zOptText(160),
  description: zOptText(2000),
  url: zOptText(2000),
  body: zOptText(100_000),
});

/** Transcribe images / scanned PDFs with Gemini so they can ground the tutor. Runs after the response. */
async function transcribeInBackground(materialId, buffer, mimeType, name) {
  try {
    const parts = await fileToParts(buffer, mimeType, name);
    if (!parts.length) throw new Error("unsupported");
    const { text } = await generateText({
      system: "You convert study materials into faithful plain-text transcripts for later search and tutoring.",
      parts,
      prompt:
        "Transcribe all readable text in this material. Describe diagrams, charts and figures in one or two sentences each in [brackets]. Preserve headings and lists. Use LaTeX ($...$) for math. Output only the transcript.",
      temperature: 0.1,
      thinking: "off",
      timeoutMs: 180_000,
    });
    const clean = text.slice(0, MAX_TEXT_CHARS);
    await prisma.material.update({ where: { id: materialId }, data: { text: clean, charCount: clean.length, textStatus: "ready" } });
  } catch (err) {
    console.warn(`[materials] transcription failed for ${materialId}:`, err.message);
    await prisma.material.update({ where: { id: materialId }, data: { textStatus: "failed" } }).catch(() => {});
  }
}

router.get("/", async (req, res) => {
  await classAccess(req.params.classId, req.user);
  const materials = await prisma.material.findMany({
    where: { classroomId: req.params.classId },
    select: listSelect,
    orderBy: { createdAt: "desc" },
  });
  res.json({ materials });
});

router.post("/", teacherOnly, uploader("any", 1).single("file"), async (req, res) => {
  const { classroom } = await classAccess(req.params.classId, req.user, { teacher: true });
  const data = parse(createSchema, req.body);

  const base = { classroomId: classroom.id, uploaderId: req.user.id, description: data.description };
  let material;
  let pendingTranscription = null;

  if (data.kind === "file") {
    if (!req.file) throw badRequest("Attach a file.");
    const file = await saveFile(req.file, "materials");
    const text = await extractLocalText(req.file.buffer, req.file.mimetype);
    const canTranscribe = env.aiEnabled && (req.file.mimetype.startsWith("image/") || req.file.mimetype === "application/pdf");
    const textStatus = text.length > 200 ? "ready" : canTranscribe ? "pending" : "none";
    material = await prisma.material.create({
      data: {
        ...base,
        kind: "file",
        title: data.title || req.file.originalname.replace(/\.[^.]+$/, ""),
        file,
        text: textStatus === "ready" ? text : null,
        charCount: textStatus === "ready" ? text.length : 0,
        textStatus,
      },
      select: listSelect,
    });
    if (textStatus === "pending") pendingTranscription = [material.id, req.file.buffer, req.file.mimetype, req.file.originalname];
  } else if (data.kind === "link") {
    if (!data.url || !/^https?:\/\//i.test(data.url)) throw badRequest("Enter a valid link starting with http(s)://");
    material = await prisma.material.create({
      data: { ...base, kind: "link", title: data.title || data.url, url: data.url, textStatus: "none" },
      select: listSelect,
    });
  } else {
    if (!data.body || data.body.length < 10) throw badRequest("Write the note content.");
    if (!data.title) throw badRequest("Give the note a title.");
    material = await prisma.material.create({
      data: { ...base, kind: "note", title: data.title, text: data.body, charCount: data.body.length, textStatus: "ready" },
      select: listSelect,
    });
  }

  res.status(201).json({ material });

  if (pendingTranscription) transcribeInBackground(...pendingTranscription);
  notify(await classStudentIds(classroom.id), {
    type: "material",
    title: `New material in ${classroom.name}`,
    body: material.title,
    link: `/app/classes/${classroom.id}/materials`,
  });
});

export const materialRouter = Router();

materialRouter.get("/:id", async (req, res) => {
  const material = await findOr404(prisma.material, req.params.id, "Material", {
    select: { ...listSelect, text: true },
  });
  await classAccess(material.classroomId, req.user);
  res.json({ material });
});

materialRouter.delete("/:id", teacherOnly, async (req, res) => {
  const material = await findOr404(prisma.material, req.params.id, "Material", { select: { id: true, classroomId: true, file: true } });
  await classAccess(material.classroomId, req.user, { teacher: true });
  await prisma.material.delete({ where: { id: material.id } });
  if (material.file) deleteFile(material.file);
  res.json({ ok: true });
});

export default router;

import { prisma } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { classAccess, findOr404 } from "../lib/access.js";
import { extractLocalText, fileToParts, MAX_TEXT_CHARS } from "../lib/extract.js";
import { readFile } from "../lib/storage.js";

/** Largest source we send to the model in one request (chars). */
const PROMPT_TEXT_BUDGET = 180_000;

const clip = (text, max = PROMPT_TEXT_BUDGET) =>
  text.length > max ? `${text.slice(0, max)}\n\n[...source truncated...]` : text;

/**
 * Normalise the four ways a learner can point AI at content into Gemini parts.
 *
 * @param {{ source: "topic"|"text"|"material"|"file", topic?: string, text?: string, materialId?: string }} input
 * @param {object} user
 * @param {Express.Multer.File} [file]
 * @returns {Promise<{ label: string, parts: object[], sourceText: string|null, material?: object }>}
 */
export async function resolveSource(input, user, file) {
  switch (input.source) {
    case "topic": {
      const topic = input.topic?.trim();
      if (!topic) throw badRequest("Enter a topic.");
      return { label: topic, parts: [], sourceText: null };
    }
    case "text": {
      const text = input.text?.trim() ?? "";
      if (text.length < 40) throw badRequest("Paste at least a few sentences of text.");
      return { label: input.topic?.trim() || text.split("\n")[0].slice(0, 60), parts: [{ text: `SOURCE TEXT:\n${clip(text)}` }], sourceText: text.slice(0, MAX_TEXT_CHARS) };
    }
    case "material": {
      const material = await findOr404(prisma.material, input.materialId, "Material");
      await classAccess(material.classroomId, user);
      if (material.text) {
        return {
          label: material.title,
          parts: [{ text: `SOURCE MATERIAL "${material.title}":\n${clip(material.text)}` }],
          sourceText: material.text,
          material,
        };
      }
      if (material.file) {
        const buffer = await readFile(material.file);
        const parts = await fileToParts(buffer, material.file.mimeType, material.file.name);
        if (parts.length) return { label: material.title, parts, sourceText: null, material };
      }
      throw badRequest("This material has no readable content yet.");
    }
    case "file": {
      if (!file) throw badRequest("Attach a file.");
      const text = await extractLocalText(file.buffer, file.mimetype);
      const label = input.topic?.trim() || file.originalname.replace(/\.[^.]+$/, "");
      // Prefer extracted text when the document has a real text layer; otherwise
      // send the file itself so the model can read scans, handwriting and images.
      if (text.length > 300) return { label, parts: [{ text: `SOURCE DOCUMENT "${file.originalname}":\n${clip(text)}` }], sourceText: text };
      const parts = await fileToParts(file.buffer, file.mimetype, file.originalname);
      if (!parts.length) throw badRequest("That file type can't be read. Try a PDF, image, DOCX or text file.");
      return { label, parts, sourceText: text || null };
    }
    default:
      throw badRequest("Unknown source.");
  }
}

/**
 * Class materials as grounding context for the tutor.
 * Splits the budget evenly so one huge PDF doesn't crowd out the rest.
 */
export async function classMaterialsContext(classroomId, budget = 120_000) {
  const materials = await prisma.material.findMany({
    where: { classroomId, textStatus: "ready" },
    select: { id: true, title: true, text: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  if (!materials.length) return { context: "", sources: [] };
  const per = Math.floor(budget / materials.length);
  const context = materials.map((m) => `### Material: ${m.title}\n${clip(m.text ?? "", per)}`).join("\n\n");
  return { context, sources: materials.map((m) => ({ id: m.id, title: m.title })) };
}

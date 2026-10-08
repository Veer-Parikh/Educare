import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

/** Hard cap on stored text per source; keeps documents well under Mongo's 16MB limit. */
export const MAX_TEXT_CHARS = 300_000;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** MIME types Gemini can read directly as inline data. */
export const GEMINI_NATIVE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

const clean = (text) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

/**
 * Pull plain text out of a document without calling the LLM.
 * Returns "" for formats we can't read locally (images, scanned PDFs) —
 * callers can fall back to Gemini for those.
 */
export async function extractLocalText(buffer, mimeType) {
  try {
    if (mimeType === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return clean(Array.isArray(text) ? text.join("\n\n") : text);
    }
    if (mimeType === DOCX) {
      const { value } = await mammoth.extractRawText({ buffer });
      return clean(value);
    }
    if (mimeType?.startsWith("text/") || mimeType === "application/json") {
      return clean(buffer.toString("utf8"));
    }
  } catch (err) {
    console.warn("[extract] local extraction failed:", err.message);
  }
  return "";
}

/**
 * Convert a file into Gemini content parts. Text-bearing documents are sent as
 * text (cheaper, works for DOCX); images and PDFs are sent natively so the model
 * can read handwriting, diagrams and scans.
 */
export async function fileToParts(buffer, mimeType, name = "file") {
  if (mimeType === DOCX) {
    const text = await extractLocalText(buffer, mimeType);
    return text ? [{ text: `--- ${name} ---\n${text}` }] : [];
  }
  if (GEMINI_NATIVE.has(mimeType)) {
    return [{ inlineData: { mimeType, data: buffer.toString("base64") } }];
  }
  return [];
}

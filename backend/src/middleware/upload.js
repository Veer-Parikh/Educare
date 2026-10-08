import multer from "multer";
import { badRequest } from "../lib/errors.js";

export const MAX_FILE_MB = 15;

const DOCUMENTS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
]);

const IMAGES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"]);

const kinds = {
  any: (m) => DOCUMENTS.has(m) || IMAGES.has(m),
  image: (m) => IMAGES.has(m),
  // What Gemini can read (natively or after local extraction).
  readable: (m) =>
    IMAGES.has(m) ||
    [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/csv",
    ].includes(m),
};

/** Browsers sometimes send .md files as octet-stream; recover from the extension. */
function normalizeMime(file) {
  const name = (file.originalname || "").toLowerCase();
  if (file.mimetype === "application/octet-stream" || !file.mimetype) {
    if (name.endsWith(".md")) file.mimetype = "text/markdown";
    else if (name.endsWith(".txt")) file.mimetype = "text/plain";
    else if (name.endsWith(".pdf")) file.mimetype = "application/pdf";
  }
  if (file.mimetype === "image/jpg") file.mimetype = "image/jpeg";
}

/**
 * @param {"any"|"image"|"readable"} kind which file types are accepted
 * @param {number} maxFiles
 */
export function uploader(kind = "any", maxFiles = 6) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: maxFiles, fields: 40 },
    fileFilter: (_req, file, cb) => {
      normalizeMime(file);
      if (kinds[kind](file.mimetype)) cb(null, true);
      else cb(badRequest(`Unsupported file type: ${file.originalname}`));
    },
  });
}

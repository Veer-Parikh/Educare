import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";
import { formatZodError } from "../lib/http.js";
import { env } from "../config/env.js";
import { MAX_FILE_MB } from "./upload.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `File is too large (max ${MAX_FILE_MB} MB).`,
  LIMIT_FILE_COUNT: "Too many files attached.",
  LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    // Streaming responses handle their own errors; just make sure the socket closes.
    return res.end();
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const { message, details } = formatZodError(err);
    return res.status(400).json({ error: message, details });
  }
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: MULTER_MESSAGES[err.code] ?? err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "That already exists." });
    if (err.code === "P2025") return res.status(404).json({ error: "Not found." });
    if (err.code === "P2023") return res.status(400).json({ error: "Invalid id." });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body." });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
  // http-errors style (e.g. express.static 404s).
  const status = err?.status ?? err?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) return res.status(status).json({ error: err.message || "Request failed." });

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: "Something went wrong on our side.", ...(env.isProd ? {} : { debug: err?.message }) });
}

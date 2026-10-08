import { z } from "zod";
import { badRequest } from "./errors.js";

export function formatZodError(error) {
  const details = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  const first = details[0];
  const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : "Invalid input";
  return { message, details };
}

/** Parse `data` with `schema`, throwing a 400 with readable details on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const { message, details } = formatZodError(result.error);
    throw badRequest(message, details);
  }
  return result.data;
}

/** Multipart form fields arrive as strings; this reads a JSON-encoded field. */
export function jsonField(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw badRequest("Malformed JSON in form field");
  }
}

// ---- common field schemas -------------------------------------------------

export const zObjectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

/** Accepts "true"/"false" strings from multipart forms as well as booleans. */
export const zBool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

/** Optional trimmed string where "" means "not provided". */
export const zOptText = (max = 5000) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

/** Nullable variant for PATCH bodies: "" or null clears the field. */
export const zNullableText = (max = 5000) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const zDate = z.coerce.date();

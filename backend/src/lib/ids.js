import { randomBytes, randomInt } from "node:crypto";

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (value) => typeof value === "string" && OBJECT_ID.test(value);

/** Short random id for embedded documents (questions, milestones, rubric rows). */
export const shortId = () => randomBytes(6).toString("base64url");

// No 0/O/1/I/L to keep codes easy to read aloud and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function joinCode(length = 7) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

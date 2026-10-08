import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError, badRequest, unavailable } from "./errors.js";

const client = env.aiEnabled ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;
const MODELS = [...new Set([env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS])];

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function statusOf(err) {
  return typeof err?.status === "number" ? err.status : typeof err?.code === "number" ? err.code : undefined;
}

function isRetryable(err) {
  const status = statusOf(err);
  if (status) return RETRYABLE.has(status);
  // Network failures / timeouts have no status.
  return err?.name === "AbortError" || err?.name === "TimeoutError" || /fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(err?.message ?? "");
}

function toHttpError(err) {
  if (err instanceof HttpError) return err;
  const status = statusOf(err);
  if (status === 400) return badRequest("The AI couldn't process this input. Try a smaller or different file.");
  if (status === 401 || status === 403) return unavailable("The AI service rejected our credentials. Check GEMINI_API_KEY.");
  return unavailable("The AI service is busy right now. Please try again in a moment.");
}

export function assertEnabled() {
  if (!client) throw unavailable("AI features are not configured on this server (missing GEMINI_API_KEY).");
}

/** Map an abstract thinking level onto each model family's knobs. */
function thinkingConfig(model, level) {
  if (!level || level === "default") return undefined;
  if (/^gemini-2\.5-(flash|flash-lite)/.test(model)) {
    return { thinkingBudget: level === "off" ? 0 : level === "low" ? 1024 : 8192 };
  }
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: level === "high" ? 8192 : 1024 };
  if (/^gemini-3/.test(model)) return { thinkingLevel: level === "high" ? "high" : "low" };
  return undefined;
}

// ---- circuit breaker ---------------------------------------------------------
// Models that are rate-limited, retired or overloaded are benched for a while so
// later requests go straight to a healthy model instead of paying retry latency.
const benchedUntil = new Map();

/** Gemini includes a RetryInfo hint (e.g. "retryDelay": "37s") on 429s. */
function retryDelayMs(err) {
  const m = String(err?.message ?? "").match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.min(Number(m[1]) * 1000, 120_000) : null;
}

function bench(model, ms, why) {
  benchedUntil.set(model, Date.now() + ms);
  console.warn(`[gemini] ${model} ${why}; benched for ${Math.round(ms / 1000)}s`);
}

/** Healthy models first (in configured order), then benched ones soonest-available first. */
function modelOrder() {
  const now = Date.now();
  const until = (m) => benchedUntil.get(m) ?? 0;
  return [...MODELS.filter((m) => until(m) <= now), ...MODELS.filter((m) => until(m) > now).sort((a, b) => until(a) - until(b))];
}

/**
 * Classify a failure for `model`. Returns "next" to move to the next model,
 * "retry" to try the same model again, or throws for non-recoverable errors.
 */
function onModelError(model, err, attempt) {
  if (err instanceof HttpError) throw err;
  const status = statusOf(err);
  if (status === 404) return bench(model, 10 * 60_000, "is unavailable for this key"), "next";
  if (status === 429) return bench(model, retryDelayMs(err) ?? 30_000, "is rate-limited"), "next";
  if (!isRetryable(err)) throw toHttpError(err);
  if (attempt >= 1) return bench(model, 15_000, `failed twice (${status ?? err.name})`), "next";
  return "retry";
}

async function withFallback(run) {
  assertEnabled();
  let lastErr;
  for (const model of modelOrder()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await run(model);
        benchedUntil.delete(model);
        return result;
      } catch (err) {
        lastErr = err;
        if (onModelError(model, err, attempt) === "next") break;
        await sleep(400);
      }
    }
  }
  throw toHttpError(lastErr);
}

/** Zod schema -> JSON Schema subset accepted by Gemini's responseJsonSchema. */
function toGeminiSchema(schema) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" });
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "additionalProperties") continue;
        // z.number().int() emits the safe-integer range; it's noise for the model.
        if ((k === "minimum" || k === "maximum") && Math.abs(v) === Number.MAX_SAFE_INTEGER) continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json);
}

const schemaCache = new WeakMap();
function geminiSchemaFor(schema) {
  if (!schemaCache.has(schema)) schemaCache.set(schema, toGeminiSchema(schema));
  return schemaCache.get(schema);
}

function parseJson(text) {
  const cleaned = String(text ?? "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Model did not return JSON");
  }
}

function responseText(res) {
  const text = res?.text;
  if (!text) {
    const reason = res?.promptFeedback?.blockReason || res?.candidates?.[0]?.finishReason;
    if (reason && reason !== "STOP") throw badRequest("The AI declined to answer this request. Try rephrasing it.");
    throw new Error("Empty response from model");
  }
  return text;
}

const buildContents = ({ prompt, parts, contents }) =>
  contents ?? [{ role: "user", parts: [...(parts ?? []), ...(prompt ? [{ text: prompt }] : [])] }];

/**
 * Generate structured JSON validated against a Zod schema.
 * @returns {Promise<{ data: any, model: string }>}
 */
export async function generateJSON({ system, prompt, parts, contents, schema, temperature = 0.5, thinking = "low", timeoutMs = 120_000 }) {
  const responseJsonSchema = geminiSchemaFor(schema);
  return withFallback(async (model) => {
    const res = await client.models.generateContent({
      model,
      contents: buildContents({ prompt, parts, contents }),
      config: {
        systemInstruction: system,
        temperature,
        responseMimeType: "application/json",
        responseJsonSchema,
        thinkingConfig: thinkingConfig(model, thinking),
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    let raw;
    try {
      raw = parseJson(responseText(res));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw Object.assign(new Error(err.message), { status: 502 });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[gemini] ${model} returned JSON that failed validation:`, parsed.error.issues.slice(0, 3));
      throw Object.assign(new Error("Invalid structured output"), { status: 502 });
    }
    return { data: parsed.data, model };
  });
}

/** Generate free-form text (markdown). */
export async function generateText({ system, prompt, parts, contents, temperature = 0.7, thinking = "low", timeoutMs = 90_000 }) {
  return withFallback(async (model) => {
    const res = await client.models.generateContent({
      model,
      contents: buildContents({ prompt, parts, contents }),
      config: {
        systemInstruction: system,
        temperature,
        thinkingConfig: thinkingConfig(model, thinking),
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    return { text: responseText(res).trim(), model };
  });
}

/**
 * Stream text chunks. Falls back to the next model only if the failure happens
 * before the first token, so users never see a response restart mid-way.
 */
export async function* streamText({ system, contents, temperature = 0.7, thinking = "low", signal }) {
  assertEnabled();
  let lastErr;
  for (const model of modelOrder()) {
    let started = false;
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: system,
          temperature,
          thinkingConfig: thinkingConfig(model, thinking),
          abortSignal: signal,
        },
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          started = true;
          yield text;
        }
      }
      benchedUntil.delete(model);
      return;
    } catch (err) {
      lastErr = err;
      if (started || signal?.aborted) throw toHttpError(err);
      // A stream is never retried on the same model: users are waiting on first token.
      onModelError(model, err, 1);
    }
  }
  throw toHttpError(lastErr);
}

export const aiInfo = () => ({ enabled: env.aiEnabled, models: MODELS });

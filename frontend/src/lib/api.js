// Thin fetch wrapper for the EduCare API.
// - attaches the bearer token and the browser's timezone (used for streaks)
// - normalises errors into ApiError with the server's human-readable message
// - supports JSON bodies, FormData uploads and server-sent-event streams

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "educare.token";

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — keep the in-memory token */
  }
}
export const getToken = () => token;

const timezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
})();

function headers(extra = {}) {
  const h = { "X-Timezone": timezone, ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parseError(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const fallback = res.status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.";
  return new ApiError(res.status, data?.error || fallback, data?.details);
}

async function request(method, path, { body, form, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      signal,
      headers: headers(body !== undefined ? { "Content-Type": "application/json" } : {}),
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "Can't reach the server. Check your connection and that the API is running.");
  }
  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/register")) onUnauthorized();
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path, opts) => request("GET", path, opts),
  post: (path, body, opts) => request("POST", path, { ...opts, body }),
  put: (path, body, opts) => request("PUT", path, { ...opts, body }),
  patch: (path, body, opts) => request("PATCH", path, { ...opts, body }),
  del: (path, opts) => request("DELETE", path, opts),
  /** multipart/form-data; `method` defaults to POST */
  upload: (path, form, { method = "POST", ...opts } = {}) => request(method, path, { ...opts, form }),
};

/**
 * Build FormData from a plain object. Arrays/objects are JSON-encoded, File/Blob
 * values are appended as files, and `files` maps field names to File arrays.
 */
export function toForm(fields = {}, files = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (v instanceof Blob) form.append(k, v);
    else if (typeof v === "object" && !(v instanceof Date)) form.append(k, JSON.stringify(v));
    else if (v instanceof Date) form.append(k, v.toISOString());
    else form.append(k, String(v));
  }
  for (const [field, list] of Object.entries(files)) {
    for (const f of [].concat(list ?? [])) if (f) form.append(field, f);
  }
  return form;
}

/**
 * POST a form and consume a server-sent-event stream.
 * @param {string} path
 * @param {FormData} form
 * @param {{ onEvent: (event: string, data: any) => void, signal?: AbortSignal }} handlers
 */
export async function streamSSE(path, form, { onEvent, signal }) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method: "POST", headers: headers({ Accept: "text/event-stream" }), body: form, signal });
  } catch (err) {
    if (err.name === "AbortError") return;
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.status === 401) onUnauthorized();
  if (!res.ok) throw await parseError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (err.name === "AbortError") return;
      throw err;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const data = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue; // heartbeat comment
      try {
        onEvent(event, JSON.parse(data.join("\n")));
      } catch {
        onEvent(event, data.join("\n"));
      }
    }
  }
}

/** Resolve API-relative upload URLs (local storage driver) against the API origin. */
export const fileUrl = (url) => (url && url.startsWith("/") ? `${BASE}${url}` : url);

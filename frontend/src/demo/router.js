// Minimal Express-like router for the demo API.
//
//   route("GET", "/classes/:classId", (req) => ({ classroom }))
//   sse("POST", "/tutor/conversations/:id/messages", async (req, emit) => { emit("delta", { text }) })
//
// `req` = { method, path, params, query, body, files, user, tz }
//   - query: plain object of query-string values (strings)
//   - body:  the JSON body, or the string fields of a multipart form (JSON-encoded
//            objects stay strings, exactly like multer; use jsonField())
//   - files: { [fieldName]: File[] } for multipart uploads
//   - user:  the signed-in user row (null only on routes registered with { auth: false })
// A handler returns the JSON response body (or null for 204). Throw HttpError for failures.

const routes = [];

function compile(pattern) {
  const parts = pattern.split("/").filter(Boolean);
  return {
    parts,
    statics: parts.filter((p) => !p.startsWith(":")).length,
  };
}

/** Register a JSON route. Options: { auth = true } */
export function route(method, pattern, handler, { auth = true } = {}) {
  routes.push({ method, pattern, handler, auth, stream: false, ...compile(pattern) });
}

/** Register a server-sent-events route; the handler receives (req, emit). */
export function sse(method, pattern, handler, { auth = true } = {}) {
  routes.push({ method, pattern, handler, auth, stream: true, ...compile(pattern) });
}

/** Find the best route for a request; static segments beat params. */
export function match(method, pathname) {
  const segs = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let best = null;
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(":")) params[p.slice(1)] = segs[i];
      else if (p !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok && (!best || r.statics > best.route.statics)) best = { route: r, params };
  }
  return best;
}

export const allRoutes = () => routes.map((r) => `${r.method} ${r.pattern}`);

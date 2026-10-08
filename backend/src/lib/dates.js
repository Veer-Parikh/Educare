const tzCache = new Map();

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string" || tz.length > 64) return false;
  if (tzCache.has(tz)) return tzCache.get(tz);
  let ok = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    ok = false;
  }
  tzCache.set(tz, ok);
  return ok;
}

/** Calendar day (YYYY-MM-DD) of `date` in timezone `tz`. */
export function dayKey(date = new Date(), tz = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimezone(tz) ? tz : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Difference in whole days between two YYYY-MM-DD keys (b - a). */
export function dayDiff(a, b) {
  const toUtc = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** The last `n` day keys ending today (oldest first). */
export function lastNDays(n, tz = "UTC", now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * 86_400_000), tz));
  return [...new Set(out)];
}

export const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

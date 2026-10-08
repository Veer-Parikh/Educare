import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, differenceInCalendarDays } from "date-fns";

export const cn = (...inputs) => twMerge(clsx(inputs));

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

const HONORIFICS = /^(dr|mr|mrs|ms|miss|prof|sir|madam|mx)\.?$/i;

/** Friendly short name: "Aarav Shah" -> "Aarav", "Dr. Kavya Iyer" -> "Dr. Iyer". */
export function shortName(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && HONORIFICS.test(parts[0])) return `${parts[0].replace(/\.?$/, ".")} ${parts[parts.length - 1]}`;
  return parts[0] ?? "";
}

export const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);

/** "in 3 days" / "2 hours ago" */
export const fromNow = (v) => {
  const d = toDate(v);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "";
};

/** Human deadline label: "Today, 5:00 PM", "Tomorrow, 9:00 AM", "Mon 12 Oct, 5:00 PM" */
export function dueLabel(v) {
  const d = toDate(v);
  if (!d) return "No due date";
  const time = format(d, "p");
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  if (isYesterday(d)) return `Yesterday, ${time}`;
  const days = differenceInCalendarDays(d, new Date());
  if (Math.abs(days) < 7) return `${format(d, "EEEE")}, ${time}`;
  return format(d, d.getFullYear() === new Date().getFullYear() ? "EEE d MMM, p" : "d MMM yyyy, p");
}

export const shortDate = (v) => {
  const d = toDate(v);
  return d ? format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy") : "";
};

export const dateTime = (v) => {
  const d = toDate(v);
  return d ? format(d, "d MMM yyyy, p") : "";
};

/** Value for <input type="datetime-local"> in local time. */
export const toLocalInput = (v) => {
  const d = toDate(v);
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const pct = (v, digits = 0) => (v == null || Number.isNaN(v) ? "—" : `${Number(v).toFixed(digits)}%`);

export const plural = (n, word, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

export const formatBytes = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export const minutes = (sec) => {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

/** Class theme -> tailwind classes. Keep literal strings so Tailwind can see them. */
export const CLASS_THEMES = {
  amber: { dot: "bg-amber-400", soft: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200", band: "from-amber-300 to-orange-400", ring: "ring-amber-400" },
  sky: { dot: "bg-sky-400", soft: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200", band: "from-sky-300 to-indigo-400", ring: "ring-sky-400" },
  violet: { dot: "bg-violet-400", soft: "bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-200", band: "from-violet-300 to-fuchsia-400", ring: "ring-violet-400" },
  emerald: { dot: "bg-emerald-400", soft: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200", band: "from-emerald-300 to-teal-500", ring: "ring-emerald-400" },
  rose: { dot: "bg-rose-400", soft: "bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-200", band: "from-rose-300 to-pink-500", ring: "ring-rose-400" },
  slate: { dot: "bg-slate-400", soft: "bg-slate-100 text-slate-900 dark:bg-slate-400/15 dark:text-slate-200", band: "from-slate-300 to-slate-500", ring: "ring-slate-400" },
  orange: { dot: "bg-orange-400", soft: "bg-orange-100 text-orange-900 dark:bg-orange-400/15 dark:text-orange-200", band: "from-orange-300 to-red-400", ring: "ring-orange-400" },
  teal: { dot: "bg-teal-400", soft: "bg-teal-100 text-teal-900 dark:bg-teal-400/15 dark:text-teal-200", band: "from-teal-300 to-cyan-500", ring: "ring-teal-400" },
};
export const classTheme = (name) => CLASS_THEMES[name] ?? CLASS_THEMES.amber;

export const ASSIGNMENT_STATUS = {
  assigned: { label: "Assigned", tone: "neutral" },
  submitted: { label: "Turned in", tone: "info" },
  late: { label: "Turned in late", tone: "warning" },
  missing: { label: "Missing", tone: "danger" },
  graded: { label: "Graded", tone: "success" },
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Download text as a file (CSV exports etc.). */
export function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

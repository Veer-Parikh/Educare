import { BookOpen, CirclePlay, Dumbbell, FileText, GraduationCap, Hammer, Newspaper } from "lucide-react";

export const LEVELS = [
  { value: "beginner", label: "Beginner", tone: "success" },
  { value: "intermediate", label: "Intermediate", tone: "info" },
  { value: "advanced", label: "Advanced", tone: "violet" },
];

export const levelInfo = (v) => LEVELS.find((l) => l.value === v) ?? LEVELS[0];

export const RESOURCE_TYPES = {
  video: { label: "Video", icon: CirclePlay },
  article: { label: "Article", icon: Newspaper },
  book: { label: "Book", icon: BookOpen },
  course: { label: "Course", icon: GraduationCap },
  practice: { label: "Practice", icon: Dumbbell },
  docs: { label: "Docs", icon: FileText },
  project: { label: "Project", icon: Hammer },
};

/** Direct link when the server vetted one; otherwise a search that will find it. */
export function resourceHref(r) {
  if (r.url) return { href: r.url, search: false };
  const q = encodeURIComponent(r.title);
  return r.type === "video"
    ? { href: `https://www.youtube.com/results?search_query=${q}`, search: "YouTube" }
    : { href: `https://www.google.com/search?q=${q}`, search: "Google" };
}

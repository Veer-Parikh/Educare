// Shared bits for the quiz pages: labels, score helpers, meters and the adaptive-quiz hook.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Dialog as D } from "radix-ui";
import {
  BookOpen,
  ClipboardPaste,
  FileQuestion,
  FileUp,
  Lightbulb,
  ListChecks,
  PencilLine,
  Sparkles,
  Target,
  TextCursorInput,
  ToggleLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AiWorking } from "@/components/AiWorking";

export const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "mixed", label: "Mixed" },
];

export const DIFFICULTY_META = {
  easy: { label: "Easy", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  hard: { label: "Hard", tone: "danger" },
  mixed: { label: "Mixed", tone: "neutral" },
};

export const TYPE_META = {
  mcq: { label: "Multiple choice", short: "MCQ", icon: ListChecks },
  truefalse: { label: "True / False", short: "True/False", icon: ToggleLeft },
  short: { label: "Short answer", short: "Short", icon: TextCursorInput },
};

export const SOURCE_META = {
  topic: { label: "From a topic", icon: Lightbulb },
  text: { label: "From notes", icon: ClipboardPaste },
  material: { label: "From class material", icon: BookOpen },
  file: { label: "From a file", icon: FileUp },
  adaptive: { label: "Adaptive practice", icon: Target },
  manual: { label: "Hand-written", icon: PencilLine },
  studio: { label: "From Study Studio", icon: Sparkles },
  paper: { label: "From a question paper", icon: FileQuestion },
};
export const sourceMeta = (s) => SOURCE_META[s] ?? SOURCE_META.topic;

/** 7.5 -> "7.5", 7 -> "7" */
export const fmtScore = (n) => (n == null ? "—" : String(Math.round(Number(n) * 10) / 10));

export const ratioPct = (score, max) => (max ? (score / max) * 100 : 0);

/** Severity bucket for a 0-1 ratio: good >= 75%, warn >= 50%, else bad. */
export function severity(ratio) {
  if (ratio == null) return "none";
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.5) return "warn";
  return "bad";
}

export const SEVERITY = {
  good: {
    fill: "bg-emerald-500 dark:bg-emerald-400",
    track: "bg-emerald-100 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "text-emerald-500 dark:text-emerald-400",
    tone: "success",
  },
  warn: {
    fill: "bg-amber-500 dark:bg-amber-400",
    track: "bg-amber-100 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    ring: "text-amber-500 dark:text-amber-400",
    tone: "warning",
  },
  bad: {
    fill: "bg-rose-500 dark:bg-rose-400",
    track: "bg-rose-100 dark:bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-300",
    ring: "text-rose-500 dark:text-rose-400",
    tone: "danger",
  },
  none: { fill: "bg-border-strong", track: "bg-subtle", text: "text-muted", ring: "text-border-strong", tone: "neutral" },
};

/**
 * Horizontal meter for a 0-1 ratio. The fill carries severity; the track is a
 * lighter step of the same hue so the state reads across the whole bar.
 */
export function Meter({ value, label, className, height = "h-2" }) {
  const sev = SEVERITY[severity(value)];
  const v = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className={cn("w-full overflow-hidden rounded-full", height, sev.track, className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", sev.fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Blocking overlay shown while an AI request runs (the request can't be cancelled server-side). */
export function AiOverlay({ open, title, steps }) {
  return (
    <D.Root open={open}>
      <D.Portal>
        <D.Overlay className="anim-fade fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="anim-pop fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          <D.Title className="sr-only">{title}</D.Title>
          <AiWorking title={title} steps={steps} className="shadow-lift" />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const ADAPTIVE_STEPS = ["Looking at what you've missed", "Choosing concepts to target", "Writing fresh questions", "Double-checking answers"];

/**
 * POST /quizzes/adaptive and open the new quiz. A 400 means there's nothing weak
 * to practise yet — that's shown as a friendly note instead of an error.
 */
export function useAdaptiveQuiz() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/quizzes/adaptive", body),
    onSuccess: ({ quiz, concepts }) => {
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Practice quiz ready", concepts?.length ? { description: `Targeting ${concepts.slice(0, 3).join(", ")}${concepts.length > 3 ? "…" : ""}` } : undefined);
      navigate(`/app/quizzes/${quiz.id}`);
    },
    onError: (err) => {
      if (err?.status === 400) toast.info(err.message);
      else toast.error(err?.message || "Couldn't build a practice quiz. Please try again.");
    },
  });
}

/** Unique concept labels (case-insensitive), in first-seen order. */
export function uniqueConcepts(list) {
  const seen = new Map();
  for (const c of list) {
    const label = c?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()];
}

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_STEPS = ["Reading your source", "Finding the key ideas", "Drafting", "Checking quality"];

/**
 * Friendly progress state for AI generations (which take ~5-30s).
 * Cycles through `steps` so the wait feels purposeful.
 */
export function AiWorking({ title = "Working on it…", steps = DEFAULT_STEPS, className, compact }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 3500);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className={cn("ai-surface flex flex-col items-center justify-center rounded-2xl border border-border text-center", compact ? "px-4 py-6" : "px-6 py-14", className)}>
      <span className="relative mb-4 grid size-12 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
        <span className="relative grid size-12 place-items-center rounded-full bg-brand-500 text-[#16140f]">
          <Sparkles className="size-5" />
        </span>
      </span>
      <p className="font-semibold">{title}</p>
      <ol className="mt-3 space-y-1 text-sm">
        {steps.map((s, idx) => (
          <li key={s} className={cn("transition-colors", idx < i ? "text-muted line-through decoration-brand-500/60" : idx === i ? "font-medium text-fg" : "text-faint")}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Small inline "AI" marker for AI-powered surfaces. */
export function AiTag({ className, children = "AI" }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-900 dark:bg-brand-500/15 dark:text-brand-200", className)}>
      <Sparkles className="size-3" />
      {children}
    </span>
  );
}

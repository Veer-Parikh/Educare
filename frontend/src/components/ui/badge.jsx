import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-subtle text-muted border-border",
  brand: "bg-brand-100 text-brand-900 border-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:border-brand-500/25",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/12 dark:text-emerald-300 dark:border-emerald-500/25",
  warning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/12 dark:text-amber-300 dark:border-amber-500/25",
  danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/12 dark:text-rose-300 dark:border-rose-500/25",
  info: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-500/12 dark:text-sky-300 dark:border-sky-500/25",
  violet: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-500/12 dark:text-violet-300 dark:border-violet-500/25",
  ink: "bg-ink text-on-ink border-transparent",
};

export function Badge({ tone = "neutral", className, children, dot, ...props }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium [&_svg]:size-3.5", tones[tone], className)}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

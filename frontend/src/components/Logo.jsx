import { cn } from "@/lib/utils";

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden="true">
      {/* Ink tile with a sunflower spark; inverts to a sunflower tile in dark mode. */}
      <rect width="64" height="64" rx="16" className="fill-[#16140f] dark:fill-brand-500" />
      <path d="M32 11c1.6 9.4 5.2 14.4 17 17-11.8 2.6-15.4 7.6-17 17-1.6-9.4-5.2-14.4-17-17 11.8-2.6 15.4-7.6 17-17z" className="fill-brand-500 dark:fill-[#16140f]" />
      <circle cx="47" cy="47" r="4" className="fill-brand-500 dark:fill-[#16140f]" />
    </svg>
  );
}

export function Logo({ className, markClassName, compact }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      {!compact ? (
        <span className="font-display text-[1.35rem] font-bold leading-none tracking-tight">
          Edu<span className="text-brand-600 dark:text-brand-400">Care</span>
        </span>
      ) : null}
    </span>
  );
}

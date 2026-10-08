import { cn } from "@/lib/utils";

export function Spinner({ className }) {
  return (
    <svg className={cn("size-5 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner({ label = "Loading…" }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-muted">
      <div className="flex items-center gap-3 text-sm">
        <Spinner /> {label}
      </div>
    </div>
  );
}

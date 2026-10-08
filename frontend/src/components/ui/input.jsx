import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-faint shadow-[0_1px_0_rgb(0_0_0/0.02)] transition-colors hover:border-border-strong focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/20 disabled:opacity-60 aria-[invalid=true]:border-rose-400";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(field, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(field, "min-h-20 resize-y py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <select ref={ref} className={cn(field, "h-10 appearance-none pr-9")} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
    </div>
  );
});

export function Label({ className, ...props }) {
  return <label className={cn("text-[13px] font-medium text-fg", className)} {...props} />;
}

/** Label + control + hint/error, with ids wired for accessibility. */
export function Field({ label, hint, error, optional, className, children, htmlFor }) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const control = typeof children === "function" ? children({ id, "aria-invalid": Boolean(error) || undefined }) : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={id} className="flex items-baseline justify-between">
          <span>{label}</span>
          {optional ? <span className="text-xs font-normal text-faint">Optional</span> : null}
        </Label>
      ) : null}
      {control}
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

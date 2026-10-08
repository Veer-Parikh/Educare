import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-border-strong transition-colors data-[state=checked]:bg-brand-500 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export function Progress({ value = 0, className, barClassName }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-subtle", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out", barClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Circular progress. `value` 0-100. */
export function Ring({ value = 0, size = 56, stroke = 6, className, trackClassName = "text-subtle", barClassName = "text-brand-500", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", barClassName)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong/70 text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {Icon ? (
        <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-subtle text-muted">
          <Icon className="size-5" />
        </span>
      ) : null}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Segmented control (single choice). options: [{ value, label, icon?, hint? }] */
export function Segmented({ value, onChange, options, className, size = "md" }) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-xl border border-border bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Kbd({ children, className }) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] font-medium text-muted", className)}>{children}</kbd>;
}

export function Divider({ label, className }) {
  if (!label) return <div className={cn("h-px bg-border", className)} />;
  return (
    <div className={cn("flex items-center gap-3 text-xs text-faint", className)}>
      <div className="h-px flex-1 bg-border" />
      {label}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

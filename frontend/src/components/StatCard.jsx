import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({ icon: Icon, label, value, hint, to, tone = "neutral", className, children }) {
  const toneCls = {
    neutral: "bg-subtle text-fg",
    brand: "bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  }[tone];
  const content = (
    <Card interactive={Boolean(to)} className={cn("h-full p-4", className)}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className={cn("grid size-9 place-items-center rounded-xl", toneCls)}>
            <Icon className="size-[18px]" />
          </span>
        ) : null}
        <p className="text-sm text-muted">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      {children}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl focus-visible:outline-offset-4">
      {content}
    </Link>
  ) : (
    content
  );
}

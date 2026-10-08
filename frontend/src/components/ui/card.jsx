import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef(function Card({ className, interactive, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-soft",
        interactive && "transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift",
        className,
      )}
      {...props}
    />
  );
});

export function CardHeader({ className, title, description, action, icon: Icon, children }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-fg">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          {title ? <h3 className="truncate text-[15px] font-semibold tracking-tight">{title}</h3> : null}
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}

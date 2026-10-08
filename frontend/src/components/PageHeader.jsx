import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, eyebrow, actions, back, className, children }) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back ? (
          <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition hover:text-fg">
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-pretty text-[15px] text-muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

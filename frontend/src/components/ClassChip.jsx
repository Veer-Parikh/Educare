import { Link } from "react-router";
import { classTheme, cn } from "@/lib/utils";

export function ClassDot({ theme, className }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", classTheme(theme).dot, className)} />;
}

/** Compact class label, optionally linking to the class. */
export function ClassChip({ classroom, link = true, className }) {
  if (!classroom) return null;
  const inner = (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-muted", link && "hover:text-fg", className)}>
      <ClassDot theme={classroom.theme} />
      <span className="truncate">{classroom.name}</span>
    </span>
  );
  return link ? (
    <Link to={`/app/classes/${classroom.id}`} onClick={(e) => e.stopPropagation()} className="max-w-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

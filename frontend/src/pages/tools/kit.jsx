// Page-level helpers shared by the teacher tool pages and the library.
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Copy, Download, FileQuestion, NotebookPen, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { downloadText, fromNow } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { slugify } from "./views";

export const TYPE_META = {
  lesson_plan: { label: "Lesson plan", plural: "Lesson plans", icon: NotebookPen, tool: "/app/tools/lesson", tone: "brand" },
  question_paper: { label: "Question paper", plural: "Question papers", icon: FileQuestion, tool: "/app/tools/paper", tone: "violet" },
  answer_check: { label: "Answer check", plural: "Answer checks", icon: ClipboardCheck, tool: "/app/tools/answer-check", tone: "success" },
};

export async function copyMarkdown(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied as Markdown — paste into Docs, Notion or an email");
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}

/** Copy / download / print actions for a generated document. Hidden when printing. */
export function DocActions({ title, markdown, onPrint = () => window.print(), children }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {children}
      <Button variant="secondary" size="sm" onClick={() => copyMarkdown(markdown())}>
        <Copy /> Copy
      </Button>
      <Button variant="secondary" size="sm" onClick={() => downloadText(`${slugify(title)}.md`, markdown(), "text/markdown")}>
        <Download /> .md
      </Button>
      <Button variant="secondary" size="sm" onClick={onPrint}>
        <Printer /> Print / PDF
      </Button>
    </div>
  );
}

/** The user's recent items of one type, linking to the library. */
export function RecentItems({ type, title = "Recent", limit = 6 }) {
  const { data, isLoading } = useQuery({ queryKey: ["artifacts", type], queryFn: () => api.get(`/artifacts?type=${type}`) });
  const items = (data?.artifacts ?? []).slice(0, limit);
  const Icon = TYPE_META[type]?.icon;
  if (!isLoading && !items.length) return null;
  return (
    <Card className="no-print">
      <CardHeader
        title={title}
        action={
          <Button variant="ghost" size="xs" asChild>
            <Link to="/app/library">Library</Link>
          </Button>
        }
      />
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="-mx-2">
            {items.map((a) => (
              <li key={a.id}>
                <Link to={`/app/library/${a.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-subtle">
                  {Icon ? <Icon className="size-4 shrink-0 text-faint" /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
                  <span className="shrink-0 text-xs text-faint">{fromNow(a.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Print with a temporary state applied first (e.g. answer key visible), then restore it. */
export function printWith(apply, restore) {
  apply();
  // Let React paint the new state before the print dialog snapshots the page.
  requestAnimationFrame(() =>
    setTimeout(() => {
      window.print();
      restore?.();
    }, 60),
  );
}

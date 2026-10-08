import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, fromNow, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { TYPE_META } from "./kit";

export default function LibraryPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { isTeacher } = useAuth();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["artifacts", "all"], queryFn: () => api.get("/artifacts") });
  const del = useMutation({
    mutationFn: (id) => api.del(`/artifacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["artifacts"] });
      toast.success("Deleted");
    },
  });

  const all = data?.artifacts ?? [];
  const items = all.filter((a) => (type === "all" || a.type === type) && (!q || a.title.toLowerCase().includes(q.toLowerCase())));
  const tools = Object.entries(TYPE_META).filter(([t]) => isTeacher || t === "answer_check");

  return (
    <div>
      <PageHeader title="Library" description="Everything you've generated — lesson plans, question papers and answer checks — saved automatically." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[{ value: "all", label: "All" }, ...Object.entries(TYPE_META).map(([value, m]) => ({ value, label: m.plural, icon: m.icon }))]}
          className="flex-wrap"
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" className="pl-9" aria-label="Search library" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => {
            const m = TYPE_META[a.type] ?? TYPE_META.lesson_plan;
            const Icon = m.icon;
            return (
              <Card key={a.id} interactive className="group relative p-4">
                <Link to={`/app/library/${a.id}`} className="absolute inset-0 rounded-2xl" aria-label={`Open ${a.title}`} />
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-muted">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">{a.title}</p>
                    <p className="mt-1 text-xs text-muted" title={shortDate(a.createdAt)}>
                      {fromNow(a.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="relative z-10 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete ${a.title}`}
                    onClick={async () => {
                      if (await confirm({ title: `Delete "${a.title}"?`, confirmLabel: "Delete", danger: true })) del.mutate(a.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Badge tone={m.tone} className="mt-3">
                  {m.label}
                </Badge>
              </Card>
            );
          })}
        </div>
      ) : all.length ? (
        <EmptyState compact icon={Search} title="No matches" description="Try a different search or filter." />
      ) : (
        <EmptyState
          icon={Library}
          title="Your library is empty"
          description="Anything you create with the AI tools is saved here automatically."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {tools.map(([t, m]) => {
                const Icon = m.icon;
                return (
                  <Button key={t} variant="secondary" size="sm" asChild>
                    <Link to={m.tool}>
                      <Icon /> {m.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          }
        />
      )}
      <p className={cn("mt-6 text-center text-xs text-faint", !all.length && "hidden")}>{all.length} items</p>
    </div>
  );
}

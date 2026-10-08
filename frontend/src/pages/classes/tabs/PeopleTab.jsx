import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Search, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { plural, shortDate } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";

function InviteCard({ classroom }) {
  const [copied, setCopied] = useState(null);
  const link = `${window.location.origin}/app/classes?join=${classroom.code}`;
  const copy = (what, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    toast.success(what === "code" ? "Code copied" : "Invite link copied");
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <Card className="ai-surface">
      <CardContent className="p-5">
        <p className="text-sm font-semibold">Invite students</p>
        <p className="mt-1 text-sm text-muted">Share the code, or send the link — it opens the join screen with the code filled in.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => copy("code", classroom.code)} className="font-mono tracking-widest">
            {classroom.code} {copied === "code" ? <Check className="text-emerald-500" /> : <Copy />}
          </Button>
          <Button variant="secondary" onClick={() => copy("link", link)}>
            <Link2 /> {copied === "link" ? "Copied" : "Copy invite link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PeopleTab({ classroom, isTeacher }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["class", classroom.id, "members"], queryFn: () => api.get(`/classes/${classroom.id}/members`) });
  const remove = useMutation({
    mutationFn: (userId) => api.del(`/classes/${classroom.id}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", classroom.id] });
      toast.success("Student removed");
    },
  });

  const students = (data?.students ?? []).filter((s) => !q || `${s.name} ${s.email} ${s.sapId ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader
          icon={Users}
          title="Students"
          description={data ? plural(data.students.length, "student") : undefined}
          action={
            data?.students.length > 6 ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-40 pl-8" aria-label="Search students" />
              </div>
            ) : null
          }
        />
        <CardContent className="pt-3">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : students.length ? (
            <ul className="divide-y divide-border">
              {students.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted">
                      {isTeacher ? s.email : null}
                      {isTeacher && s.sapId ? ` · SAP ${s.sapId}` : null}
                      {!isTeacher ? `Joined ${shortDate(s.joinedAt)}` : null}
                    </p>
                  </div>
                  <Badge tone="neutral" className="tabular-nums">
                    {s.xp} XP
                  </Badge>
                  {isTeacher ? (
                    <Tip content="Remove from class">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${s.name}`}
                        onClick={async () => {
                          if (await confirm({ title: `Remove ${s.name}?`, description: "They'll lose access to this class. Their past submissions are kept.", confirmLabel: "Remove", danger: true })) remove.mutate(s.id);
                        }}
                      >
                        <UserMinus />
                      </Button>
                    </Tip>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Users} title={q ? "No matches" : "No students yet"} description={q ? undefined : isTeacher ? "Share the class code to get started." : undefined} />
          )}
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            {data?.teacher ? <Avatar name={data.teacher.name} src={data.teacher.avatarUrl} size="md" /> : null}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">Teacher</p>
              <p className="truncate font-medium">{data?.teacher?.name}</p>
              <p className="truncate text-xs text-muted">{data?.teacher?.email}</p>
            </div>
          </CardContent>
        </Card>
        {isTeacher ? <InviteCard classroom={classroom} /> : null}
      </aside>
    </div>
  );
}

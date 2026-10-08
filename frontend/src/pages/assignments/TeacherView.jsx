import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Clock, Gauge, MoreHorizontal, Pencil, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ASSIGNMENT_STATUS, cn, fromNow, pct, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { StatCard } from "@/components/StatCard";
import { AssignmentFormDialog } from "./AssignmentFormDialog";
import { GradeDialog } from "./GradeDialog";
import { AssignmentMeta, InstructionsCard, RubricCard } from "./shared";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "todo", label: "To grade" },
  { value: "graded", label: "Graded" },
  { value: "missing", label: "Not in" },
];

export default function TeacherView({ data }) {
  const { assignment, stats } = data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [gradeIndex, setGradeIndex] = useState(null);
  const [bulk, setBulk] = useState(null);

  const roster = useQuery({ queryKey: ["assignment", assignment.id, "roster"], queryFn: () => api.get(`/assignments/${assignment.id}/submissions`) });
  const rows = roster.data?.roster ?? [];

  // Deep link: ?grade=<studentId> opens that student's grading dialog.
  useEffect(() => {
    const sid = params.get("grade");
    if (!sid || !rows.length) return;
    const i = rows.findIndex((r) => r.student.id === sid);
    if (i !== -1) setGradeIndex(i);
    params.delete("grade");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const del = useMutation({
    mutationFn: () => api.del(`/assignments/${assignment.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", assignment.classroomId, "assignments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Assignment deleted");
      navigate(`/app/classes/${assignment.classroomId}/classwork`);
    },
  });

  const draftAll = async () => {
    let drafted = 0;
    setBulk({ drafted: 0 });
    try {
      for (let round = 0; round < 10; round++) {
        const r = await api.post(`/assignments/${assignment.id}/ai-draft-all`);
        drafted += r.drafted;
        setBulk({ drafted });
        if (!r.hasMore || r.drafted === 0) break;
      }
      toast.success(drafted ? `Drafted ${plural(drafted, "grade")} — review each before returning` : "Every submission already has a draft");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulk(null);
      qc.invalidateQueries({ queryKey: ["assignment", assignment.id, "roster"] });
    }
  };

  const visible = rows
    .map((r, i) => ({ ...r, i }))
    .filter((r) =>
      filter === "all" ? true : filter === "todo" ? r.status === "submitted" || r.status === "late" : filter === "graded" ? r.status === "graded" : r.status === "missing" || r.status === "assigned",
    );
  const needsDraft = rows.filter((r) => r.submission && r.submission.status === "submitted" && !r.submission.aiDraft).length;

  return (
    <div>
      <PageHeader
        back={{ to: `/app/classes/${assignment.classroomId}/classwork`, label: assignment.classroom.name }}
        title={assignment.title}
        actions={
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Assignment options">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>
                Edit assignment
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={Trash2}
                danger
                onSelect={async () => {
                  if (await confirm({ title: "Delete this assignment?", description: "All student submissions and grades for it will be deleted.", confirmLabel: "Delete", danger: true })) del.mutate();
                }}
              >
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        }
      >
        <div className="mt-3">
          <AssignmentMeta assignment={assignment} />
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Users} tone="sky" label="Turned in" value={`${stats.submitted}/${stats.students}`} />
        <StatCard icon={CheckCircle2} tone="emerald" label="Graded" value={stats.graded} />
        <StatCard icon={Clock} tone="orange" label="Late" value={stats.late} />
        <StatCard icon={Gauge} tone="brand" label="Average" value={pct(stats.averagePct)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            icon={ClipboardCheck}
            title="Submissions"
            action={
              needsDraft ? (
                <Button size="sm" variant="secondary" onClick={draftAll} loading={Boolean(bulk)}>
                  <Sparkles /> {bulk ? `Drafting… ${bulk.drafted}` : `AI-draft ${needsDraft}`}
                </Button>
              ) : null
            }
          />
          <CardContent className="pt-3">
            <Segmented size="sm" value={filter} onChange={setFilter} options={FILTERS} className="mb-3" />
            {roster.isLoading ? (
              <Skeleton className="h-48" />
            ) : !rows.length ? (
              <EmptyState compact icon={Users} title="No students in this class yet" />
            ) : visible.length ? (
              <ul className="divide-y divide-border">
                {visible.map((r) => {
                  const st = ASSIGNMENT_STATUS[r.status];
                  return (
                    <li key={r.student.id}>
                      <button onClick={() => setGradeIndex(r.i)} className="flex w-full items-center gap-3 py-3 text-left transition hover:opacity-80">
                        <Avatar name={r.student.name} src={r.student.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.student.name}</p>
                          <p className="text-xs text-muted">{r.submission ? `Turned in ${fromNow(r.submission.submittedAt)}` : "Nothing turned in"}</p>
                        </div>
                        {r.submission?.aiDraft && r.status !== "graded" ? (
                          <Badge tone="brand">
                            <Sparkles /> {r.submission.aiDraft.score}
                          </Badge>
                        ) : null}
                        {r.status === "graded" ? (
                          <span className="text-sm font-semibold tabular-nums">
                            {r.submission.score}
                            <span className="font-normal text-muted">/{assignment.points}</span>
                          </span>
                        ) : (
                          <Badge tone={st.tone}>{st.label}</Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={cn("py-6 text-center text-sm text-muted")}>Nothing here.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <InstructionsCard assignment={assignment} />
          <RubricCard rubric={assignment.rubric} />
        </div>
      </div>

      <AssignmentFormDialog open={editing} onOpenChange={setEditing} assignment={assignment} />
      {gradeIndex !== null ? (
        <GradeDialog open onOpenChange={(o) => !o && setGradeIndex(null)} assignment={assignment} roster={rows} index={gradeIndex} onNavigate={(i) => setGradeIndex(Math.max(0, Math.min(rows.length - 1, i)))} />
      ) : null}
    </div>
  );
}

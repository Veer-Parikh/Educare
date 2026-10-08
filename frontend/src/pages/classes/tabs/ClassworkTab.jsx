import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, ListChecks, Plus, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { ASSIGNMENT_STATUS, cn, dueLabel, pct, plural } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { AssignmentFormDialog } from "@/pages/assignments/AssignmentFormDialog";

function AssignmentRow({ a, isTeacher }) {
  const status = ASSIGNMENT_STATUS[a.myStatus];
  const overdue = a.dueAt && new Date(a.dueAt) < Date.now();
  return (
    <li>
      <Link to={`/app/assignments/${a.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-surface-2">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", a.myStatus === "graded" || a.myStatus === "submitted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-subtle text-muted")}>
          {a.myStatus === "graded" || a.myStatus === "submitted" ? <CheckCircle2 className="size-5" /> : <ClipboardList className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{a.title}</p>
          <p className="text-xs text-muted">
            {a.dueAt ? `Due ${dueLabel(a.dueAt)}` : "No due date"} · {a.points} pts{a.rubric?.length ? " · rubric" : ""}
          </p>
        </div>
        {isTeacher ? (
          <div className="hidden w-40 shrink-0 sm:block">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>
                {a.stats.submitted}/{a.stats.students} turned in
              </span>
              <span>{a.stats.graded} graded</span>
            </div>
            <Progress value={a.stats.students ? (a.stats.submitted / a.stats.students) * 100 : 0} className="h-1.5" />
          </div>
        ) : status ? (
          <Badge tone={status.tone}>{a.myStatus === "graded" && a.mySubmission?.score != null ? `${a.mySubmission.score}/${a.points}` : status.label}</Badge>
        ) : null}
        {isTeacher && overdue && a.stats.submitted - a.stats.graded > 0 ? <Badge tone="warning">{a.stats.submitted - a.stats.graded} to grade</Badge> : null}
      </Link>
    </li>
  );
}

function QuizList({ classroom, isTeacher }) {
  const { data } = useQuery({
    queryKey: ["quizzes", isTeacher ? "mine" : "assigned"],
    queryFn: () => api.get(`/quizzes?scope=${isTeacher ? "mine" : "assigned"}`),
  });
  const quizzes = (data?.quizzes ?? []).filter((q) => q.classroom?.id === classroom.id && (isTeacher ? q.published : true));
  return (
    <Card>
      <CardHeader
        icon={ListChecks}
        title="Class quizzes"
        description={isTeacher ? "Published to this class" : "Auto-graded practice from your teacher"}
        action={
          isTeacher ? (
            <Button size="xs" variant="secondary" asChild>
              <Link to="/app/quizzes">
                <Sparkles /> Create
              </Link>
            </Button>
          ) : null
        }
      />
      <CardContent className="pt-2">
        {quizzes.length ? (
          <ul className="divide-y divide-border">
            {quizzes.map((q) => (
              <li key={q.id}>
                <Link to={isTeacher ? `/app/quizzes/${q.id}/results` : `/app/quizzes/${q.id}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{q.title}</p>
                    <p className="text-xs text-muted">
                      {plural(q.questionCount, "question")}
                      {q.dueAt ? ` · due ${dueLabel(q.dueAt)}` : ""}
                      {isTeacher ? ` · ${plural(q._count.attempts, "attempt")}` : ""}
                    </p>
                  </div>
                  {!isTeacher ? q.myBest ? <Badge tone="success">Best {pct(q.myBest.pct * 100)}</Badge> : <Badge tone="brand">To do</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-muted">{isTeacher ? "Generate a quiz, then publish it to this class." : "No quizzes yet."}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClassworkTab({ classroom, isTeacher }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["class", classroom.id, "assignments"],
    queryFn: () => api.get(`/classes/${classroom.id}/assignments`),
  });
  const assignments = data?.assignments ?? [];
  const todo = assignments.filter((a) => ["assigned", "missing"].includes(a.myStatus));
  const done = assignments.filter((a) => ["submitted", "late", "graded"].includes(a.myStatus));
  const graded = assignments.filter((a) => a.myStatus === "graded" && a.mySubmission?.score != null);
  const avg = graded.length ? (graded.reduce((s, a) => s + a.mySubmission.score / a.points, 0) / graded.length) * 100 : null;

  const section = (title, list) =>
    list.length ? (
      <Card className="overflow-hidden">
        <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">
          {title} · {list.length}
        </p>
        <ul className="divide-y divide-border">
          {list.map((a) => (
            <AssignmentRow key={a.id} a={a} isTeacher={isTeacher} />
          ))}
        </ul>
      </Card>
    ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {isTeacher ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{plural(assignments.length, "assignment")}</p>
            <Button onClick={() => setCreating(true)}>
              <Plus /> New assignment
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : !assignments.length ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description={isTeacher ? "Post one with a rubric — AI can draft grades from it later." : "Your teacher hasn't posted any work yet."}
            action={isTeacher ? <Button onClick={() => setCreating(true)}>New assignment</Button> : null}
          />
        ) : isTeacher ? (
          section("All assignments", assignments)
        ) : (
          <>
            {section("To do", todo)}
            {section("Done", done)}
          </>
        )}
      </div>

      <aside className="space-y-4">
        {!isTeacher && graded.length ? (
          <Card className="p-5">
            <p className="text-sm text-muted">Your average in this class</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{pct(avg)}</p>
            <p className="mt-1 text-xs text-muted">Across {plural(graded.length, "graded assignment")}</p>
          </Card>
        ) : null}
        <QuizList classroom={classroom} isTeacher={isTeacher} />
      </aside>

      {isTeacher ? <AssignmentFormDialog open={creating} onOpenChange={setCreating} classId={classroom.id} onSaved={(a) => navigate(`/app/assignments/${a.id}`)} /> : null}
    </div>
  );
}

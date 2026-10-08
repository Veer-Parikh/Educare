import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Table2 } from "lucide-react";
import { api } from "@/lib/api";
import { ASSIGNMENT_STATUS, cn, csvEscape, downloadText, pct, shortDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";

const CELL = {
  graded: "",
  submitted: "text-sky-700 dark:text-sky-300",
  late: "text-amber-700 dark:text-amber-300",
  missing: "text-rose-600 dark:text-rose-400",
  assigned: "text-faint",
};

function TeacherGradebook({ classroom }) {
  const { data, isLoading } = useQuery({ queryKey: ["class", classroom.id, "gradebook"], queryFn: () => api.get(`/classes/${classroom.id}/gradebook`) });
  if (isLoading) return <Skeleton className="h-80 rounded-2xl" />;
  if (!data.rows.length) return <EmptyState icon={Table2} title="No students yet" />;
  if (!data.assignments.length && !data.quizzes.length) return <EmptyState icon={Table2} title="Nothing to grade yet" description="Columns appear as you post assignments and publish quizzes." />;

  const exportCsv = () => {
    const header = ["Student", "Email", ...data.assignments.map((a) => `${a.title} (/${a.points})`), ...data.quizzes.map((q) => `${q.title} (%)`), "Average %"];
    const lines = data.rows.map((r) => [r.student.name, r.student.email, ...r.cells.map((c) => (c.score ?? (c.status === "missing" ? "missing" : ""))), ...r.quizCells.map((q) => q.pct ?? ""), r.averagePct ?? ""]);
    downloadText(`${classroom.name.replace(/\W+/g, "-")}-grades.csv`, [header, ...lines].map((l) => l.map(csvEscape).join(",")).join("\n"), "text/csv");
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {["graded", "submitted", "late", "missing"].map((s) => (
            <Badge key={s} tone={ASSIGNMENT_STATUS[s].tone}>
              {ASSIGNMENT_STATUS[s].label}
            </Badge>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download /> Export CSV
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                <th className="sticky left-0 z-10 min-w-48 bg-surface-2 px-4 py-3 font-medium">Student</th>
                <th className="px-3 py-3 text-right font-medium">Avg</th>
                {data.assignments.map((a) => (
                  <th key={a.id} className="min-w-28 px-3 py-3 font-medium">
                    <Link to={`/app/assignments/${a.id}`} className="line-clamp-2 hover:text-fg">
                      {a.title}
                    </Link>
                    <span className="block font-normal text-faint">
                      /{a.points}
                      {a.dueAt ? ` · ${shortDate(a.dueAt)}` : ""}
                    </span>
                  </th>
                ))}
                {data.quizzes.map((q) => (
                  <th key={q.id} className="min-w-28 px-3 py-3 font-medium">
                    <Link to={`/app/quizzes/${q.id}/results`} className="line-clamp-2 hover:text-fg">
                      {q.title}
                    </Link>
                    <span className="block font-normal text-faint">Quiz %</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((r) => (
                <tr key={r.student.id} className="hover:bg-surface-2/60">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.student.name} src={r.student.avatarUrl} size="xs" />
                      <span className="truncate font-medium">{r.student.name}</span>
                    </div>
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", r.averagePct != null && r.averagePct < 50 && "text-rose-600 dark:text-rose-400")}>{pct(r.averagePct)}</td>
                  {r.cells.map((c) => (
                    <td key={c.assignmentId} className={cn("px-3 py-2.5 tabular-nums", CELL[c.status])}>
                      <Tip content={ASSIGNMENT_STATUS[c.status]?.label}>
                        <Link to={`/app/assignments/${c.assignmentId}${c.status === "submitted" || c.status === "late" ? `?grade=${r.student.id}` : ""}`} className="hover:underline">
                          {c.score != null ? c.score : c.status === "missing" ? "Missing" : c.status === "assigned" ? "—" : "To grade"}
                        </Link>
                      </Tip>
                    </td>
                  ))}
                  {r.quizCells.map((q) => (
                    <td key={q.quizId} className="px-3 py-2.5 tabular-nums">
                      {q.pct != null ? `${Math.round(q.pct)}%` : <span className="text-faint">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StudentGrades({ classroom }) {
  const { data, isLoading } = useQuery({ queryKey: ["class", classroom.id, "assignments"], queryFn: () => api.get(`/classes/${classroom.id}/assignments`) });
  if (isLoading) return <Skeleton className="h-60 rounded-2xl" />;
  const rows = data?.assignments ?? [];
  if (!rows.length) return <EmptyState icon={Table2} title="No grades yet" />;
  const graded = rows.filter((a) => a.mySubmission?.score != null);
  const totalPts = graded.reduce((s, a) => s + a.points, 0);
  const earned = graded.reduce((s, a) => s + a.mySubmission.score, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted">Overall</p>
          <p className="text-3xl font-semibold tabular-nums">{totalPts ? pct((earned / totalPts) * 100, 1) : "—"}</p>
        </div>
        <p className="text-right text-sm text-muted">
          {earned} / {totalPts} points
          <br />
          {graded.length} of {rows.length} graded
        </p>
      </Card>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((a) => {
            const st = ASSIGNMENT_STATUS[a.myStatus];
            return (
              <li key={a.id}>
                <Link to={`/app/assignments/${a.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted">{a.dueAt ? `Due ${shortDate(a.dueAt)}` : "No due date"}</p>
                  </div>
                  {a.mySubmission?.score != null ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {a.mySubmission.score}
                      <span className="font-normal text-muted">/{a.points}</span>
                    </span>
                  ) : (
                    <Badge tone={st?.tone}>{st?.label}</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export default function GradesTab({ classroom, isTeacher }) {
  return isTeacher ? <TeacherGradebook classroom={classroom} /> : <StudentGrades classroom={classroom} />;
}

import { useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Gauge, ListChecks, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { api, toForm } from "@/lib/api";
import { cn, fromNow, pct, plural } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { StatCard } from "@/components/StatCard";
import { Markdown } from "@/components/Markdown";
import { AiWorking } from "@/components/AiWorking";

const RISK = {
  high: { tone: "danger", label: "At risk" },
  medium: { tone: "warning", label: "Watch" },
  low: { tone: "success", label: "On track" },
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="font-medium">{label}</p>
      <p className="text-muted">{plural(payload[0].value, "student")}</p>
    </div>
  );
}

function Briefing({ classId }) {
  const brief = useMutation({ mutationFn: () => api.post(`/classes/${classId}/insights/summary`) });
  return (
    <Card className="ai-surface">
      <CardHeader
        icon={Sparkles}
        title="AI briefing"
        description="A coach's read of your class data, with next steps"
        action={
          <Button size="sm" variant={brief.data ? "secondary" : "primary"} onClick={() => brief.mutate()} loading={brief.isPending}>
            {brief.data ? "Refresh" : "Generate"}
          </Button>
        }
      />
      <CardContent>
        {brief.isPending ? (
          <AiWorking compact title="Reading your class data…" steps={["Looking at submissions", "Checking quiz results", "Spotting who needs help", "Writing suggestions"]} />
        ) : brief.data ? (
          <Markdown>{brief.data.summary}</Markdown>
        ) : (
          <p className="text-sm text-muted">Get a short, data-grounded summary: who needs attention, what to reteach, and what to try this week.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function InsightsTab({ classroom }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["class", classroom.id, "insights"], queryFn: () => api.get(`/classes/${classroom.id}/insights`) });

  const practice = useMutation({
    mutationFn: (concepts) =>
      api.upload("/quizzes/generate", toForm({ source: "topic", topic: `${classroom.subject ? `${classroom.subject}: ` : ""}${concepts.join(", ")}`, count: 8, difficulty: "mixed", types: ["mcq", "truefalse"], title: `Reteach: ${concepts.slice(0, 3).join(", ")}` })),
    onSuccess: ({ quiz }) => navigate(`/app/quizzes/${quiz.id}/edit`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }
  const s = data.summary;
  if (!s.students) return <EmptyState icon={Users} title="No students yet" description="Insights appear once students join and start submitting work." />;

  const flagged = data.students.filter((x) => x.risk !== "low");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Gauge} tone="brand" label="Class average" value={pct(s.averagePct)} hint={`${plural(s.assignments, "assignment")} · ${plural(s.quizzes, "quiz", "quizzes")}`} />
        <StatCard icon={CheckCircle2} tone="emerald" label="Submission rate" value={pct(s.submissionRatePct)} hint="For past-due work" />
        <StatCard icon={Clock} tone="sky" label="On time" value={pct(s.onTimeRatePct)} hint="Of submissions" />
        <StatCard icon={AlertTriangle} tone={s.atRisk ? "rose" : "emerald"} label="Need attention" value={s.atRisk + s.watch} hint={`${s.atRisk} at risk · ${s.watch} to watch`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader icon={Users} title="Students" description="Sorted by risk — reasons come from missing work, grades, quizzes and activity" />
          <CardContent className="pt-3">
            <div className="scroll-thin -mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-faint">
                    <th className="pb-2 font-medium">Student</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Avg</th>
                    <th className="pb-2 text-right font-medium">Missing</th>
                    <th className="pb-2 text-right font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.students.map((row) => (
                    <tr key={row.student.id} className="align-top">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.student.name} src={row.student.avatarUrl} size="xs" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.student.name}</p>
                            {row.reasons.length ? <p className="text-xs text-muted">{row.reasons.join(" · ")}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={RISK[row.risk].tone}>{RISK[row.risk].label}</Badge>
                      </td>
                      <td className="py-3 text-right tabular-nums">{pct(row.averagePct)}</td>
                      <td className={cn("py-3 text-right tabular-nums", row.missing ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted")}>{row.missing}</td>
                      <td className="py-3 text-right text-xs text-muted">{row.lastActiveAt ? fromNow(row.lastActiveAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Briefing classId={classroom.id} />
          <Card>
            <CardHeader icon={BarChart3} title="Score distribution" description="Students by average grade" />
            <CardContent>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.distribution} margin={{ left: -24, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="band" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <Tooltip cursor={{ fill: "var(--subtle)" }} content={<ChartTooltip />} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--color-brand-500)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={Target}
            title="Weakest concepts"
            description="From class quiz answers"
            action={
              data.weakConcepts.length ? (
                <Button size="xs" variant="secondary" loading={practice.isPending} onClick={() => practice.mutate(data.weakConcepts.slice(0, 4).map((c) => c.concept))}>
                  <Sparkles /> Reteach quiz
                </Button>
              ) : null
            }
          />
          <CardContent className="pt-3">
            {data.weakConcepts.length ? (
              <ul className="space-y-3">
                {data.weakConcepts.map((c) => (
                  <li key={c.concept}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{c.concept}</span>
                      <span className="tabular-nums text-muted">
                        {pct(c.accuracyPct)} · {c.total} answers
                      </span>
                    </div>
                    <Progress value={c.accuracyPct} className="h-1.5" barClassName={c.accuracyPct < 50 ? "bg-rose-500" : c.accuracyPct < 75 ? "bg-amber-500" : "bg-emerald-500"} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Publish a quiz to this class to see concept-level understanding.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={ListChecks} title="Hardest questions" description="Lowest correct rate across the class" />
          <CardContent className="pt-3">
            {data.hardestQuestions.length ? (
              <ul className="divide-y divide-border">
                {data.hardestQuestions.map((q, i) => (
                  <li key={i} className="flex items-start gap-3 py-3">
                    <span className={cn("mt-0.5 w-12 shrink-0 text-right text-sm font-semibold tabular-nums", q.correctPct < 50 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400")}>{pct(q.correctPct)}</span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm">{q.prompt}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {q.quizTitle}
                        {q.concept ? ` · ${q.concept}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Needs at least two answers per question.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader icon={TrendingUp} title="Assignments" />
        <CardContent className="pt-3">
          {data.assignments.length ? (
            <div className="scroll-thin -mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-faint">
                    <th className="pb-2 font-medium">Assignment</th>
                    <th className="pb-2 text-right font-medium">Turned in</th>
                    <th className="pb-2 text-right font-medium">Graded</th>
                    <th className="pb-2 text-right font-medium">Late</th>
                    <th className="pb-2 text-right font-medium">Missing</th>
                    <th className="pb-2 text-right font-medium">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.assignments.map((a) => (
                    <tr key={a.id} className="cursor-pointer transition hover:bg-surface-2" onClick={() => navigate(`/app/assignments/${a.id}`)}>
                      <td className="py-2.5 pr-3 font-medium">{a.title}</td>
                      <td className="py-2.5 text-right tabular-nums">{a.submitted}</td>
                      <td className="py-2.5 text-right tabular-nums">{a.graded}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{a.late}</td>
                      <td className={cn("py-2.5 text-right tabular-nums", a.missing ? "text-rose-600 dark:text-rose-400" : "text-muted")}>{a.missing ?? "—"}</td>
                      <td className="py-2.5 text-right tabular-nums">{pct(a.averagePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No assignments yet.</p>
          )}
        </CardContent>
      </Card>
      {flagged.length === 0 ? <p className="text-center text-sm text-muted">Everyone's on track right now.</p> : null}
    </div>
  );
}

import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChartColumn, ChevronRight, Download, Eye, Lock, Pencil, Percent, Repeat, Target, TriangleAlert, Trophy, UserCheck, Users, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { cn, csvEscape, dateTime, downloadText, dueLabel, minutes, pct, plural, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ClassChip } from "@/components/ClassChip";
import { Markdown } from "@/components/Markdown";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";
import { Meter, SEVERITY, fmtScore, ratioPct, severity } from "./quiz-shared";

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "quiz";

function ResultsSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-4 h-8 w-64" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function QuestionBreakdown({ items }) {
  return (
    <Card>
      <CardHeader icon={ChartColumn} title="Question breakdown" description="Share of learners who got each question right on their best attempt — hardest first." />
      <CardContent>
        <ol className="divide-y divide-border">
          {items.map((p) => {
            const correct = p.correctRate == null ? 0 : Math.round(p.correctRate * p.answered);
            return (
              <li key={p.id} className="py-4 first:pt-1 last:pb-1">
                <div className="flex items-start gap-3">
                  <span className="grid h-7 min-w-9 shrink-0 place-items-center rounded-lg bg-subtle px-1.5 text-xs font-semibold tabular-nums text-muted">Q{p.n}</span>
                  <div className="min-w-0 flex-1">
                    <Markdown className="line-clamp-3 text-sm">{p.prompt}</Markdown>
                    {p.correctRate == null ? (
                      <p className="mt-2 text-xs text-muted">No answers yet.</p>
                    ) : (
                      <>
                        <Tip content={`${correct} of ${plural(p.answered, "learner")} correct`}>
                          <div className="mt-2.5 flex items-center gap-3">
                            <Meter value={p.correctRate} label={`Question ${p.n}: ${Math.round(p.correctRate * 100)}% correct`} className="flex-1" />
                            <span className={cn("w-11 shrink-0 text-right text-sm font-semibold tabular-nums", SEVERITY[severity(p.correctRate)].text)}>{Math.round(p.correctRate * 100)}%</span>
                          </div>
                        </Tip>
                        <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-muted">
                          <span>
                            {correct} of {p.answered} correct
                          </span>
                          {p.concept ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{p.concept}</span>
                            </>
                          ) : null}
                        </p>
                      </>
                    )}
                    {p.commonWrong ? (
                      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-rose-50/70 px-3 py-2 text-xs text-rose-900 dark:bg-rose-500/10 dark:text-rose-200">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <span className="font-medium">Most common wrong answer</span> <span className="opacity-80">({plural(p.commonWrong.count, "learner")})</span>
                          <Markdown className="mt-0.5 text-xs text-inherit [&_p]:my-0">{p.commonWrong.option ?? "—"}</Markdown>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function LearnersTable({ quizId, rows }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={Users} title="Learners" description="Best attempt per learner, highest score first. Open one to see every answer." />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border bg-surface-2 text-left text-xs text-muted">
              <th scope="col" className="w-10 py-2.5 pl-5 pr-2 font-medium">
                #
              </th>
              <th scope="col" className="px-2 py-2.5 font-medium">
                Learner
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">
                Score
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">
                %
              </th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">
                Time
              </th>
              <th scope="col" className="hidden px-2 py-2.5 font-medium md:table-cell">
                Completed
              </th>
              <th scope="col" className="w-10 py-2.5 pl-2 pr-4">
                <span className="sr-only">Review</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const p = ratioPct(a.score, a.maxScore);
              const name = a.user?.name ?? "Unknown learner";
              const to = `/app/quizzes/${quizId}?attempt=${a.id}`;
              return (
                <tr key={a.id} className="group border-b border-border last:border-b-0 hover:bg-surface-2/60">
                  <td className="py-3 pl-5 pr-2 text-xs tabular-nums text-muted">{i === 0 && rows.length > 1 ? <Trophy className="size-4 text-brand-600 dark:text-brand-400" aria-label="Top score" /> : i + 1}</td>
                  <td className="max-w-0 px-2 py-3">
                    <Link to={to} state={{ learner: name }} className="flex min-w-0 items-center gap-2.5 rounded-md hover:underline">
                      <Avatar name={name} src={a.user?.avatarUrl} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="block truncate text-xs text-muted">{a.user?.sapId || a.user?.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">
                    {fmtScore(a.score)}
                    <span className="text-muted">/{fmtScore(a.maxScore)}</span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Badge tone={SEVERITY[severity(p / 100)].tone} className="tabular-nums">
                      {Math.round(p)}%
                    </Badge>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-3 text-right tabular-nums text-muted sm:table-cell">{a.durationSec != null ? minutes(a.durationSec) : "—"}</td>
                  <td className="hidden whitespace-nowrap px-2 py-3 text-muted md:table-cell">
                    <Tip content={dateTime(a.completedAt)}>
                      <span>{shortDate(a.completedAt)}</span>
                    </Tip>
                  </td>
                  <td className="py-3 pl-2 pr-4 text-right">
                    <Button variant="ghost" size="icon-xs" asChild>
                      <Link to={to} state={{ learner: name }} aria-label={`Review ${name}'s attempt`}>
                        <ChevronRight />
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConceptSummary({ concepts }) {
  return (
    <Card>
      <CardHeader icon={Target} title="Concepts to revisit" description="Accuracy per concept across learners' best attempts, weakest first." />
      <CardContent>
        {concepts.length ? (
          <ul className="space-y-3.5">
            {concepts.slice(0, 8).map((c) => (
              <li key={c.label}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{c.label}</span>
                  <span className={cn("shrink-0 text-xs font-semibold tabular-nums", SEVERITY[severity(c.accuracy)].text)}>{Math.round(c.accuracy * 100)}%</span>
                </div>
                <Meter value={c.accuracy} label={`${c.label}: ${Math.round(c.accuracy * 100)}% correct`} height="h-1.5" className="mt-1.5" />
                <p className="mt-1 text-[11px] text-faint">{plural(c.questions, "question")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Tag questions with a concept in the editor to see which ideas need re-teaching.</p>
        )}
        {concepts.length && concepts[0].accuracy < 0.5 ? (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            <span className="font-medium text-fg">{concepts[0].label}</span> is the class's weakest area — worth a quick recap next lesson.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NotAttempted({ people, classroom }) {
  return (
    <Card>
      <CardHeader icon={UserX} title="Not attempted" description={people.length ? `${plural(people.length, "student")} in ${classroom?.name ?? "the class"} haven't taken it yet.` : undefined} />
      <CardContent>
        {people.length ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto scroll-thin">
            {people.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5">
                <Avatar name={u.name} src={u.avatarUrl} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                {u.sapId ? <span className="shrink-0 text-xs text-faint">{u.sapId}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <UserCheck className="size-4 text-emerald-600 dark:text-emerald-400" /> Everyone in the class has taken it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function QuizResultsPage() {
  const { id } = useParams();
  const r = useQuery({ queryKey: ["quiz", id, "results"], queryFn: () => api.get(`/quizzes/${id}/results`) });

  const derived = useMemo(() => {
    if (!r.data) return null;
    const { quiz, best, perQuestion } = r.data;
    const learners = [...best].sort((a, b) => ratioPct(b.score, b.maxScore) - ratioPct(a.score, a.maxScore) || (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
    const questions = perQuestion
      .map((p, i) => ({ ...p, n: i + 1 }))
      .sort((a, b) => (a.correctRate ?? 2) - (b.correctRate ?? 2) || a.n - b.n);

    const byConcept = new Map();
    for (const p of perQuestion) {
      const label = p.concept?.trim();
      if (!label || p.correctRate == null || !p.answered) continue;
      const key = label.toLowerCase();
      const agg = byConcept.get(key) ?? { label, correct: 0, total: 0, questions: 0 };
      agg.correct += p.correctRate * p.answered;
      agg.total += p.answered;
      agg.questions += 1;
      byConcept.set(key, agg);
    }
    const concepts = [...byConcept.values()].map((c) => ({ ...c, accuracy: c.total ? c.correct / c.total : 0 })).sort((a, b) => a.accuracy - b.accuracy);
    const top = learners[0] ? ratioPct(learners[0].score, learners[0].maxScore) : null;
    return { quiz, learners, questions, concepts, top };
  }, [r.data]);

  if (r.isLoading) return <ResultsSkeleton />;
  if (r.isError) {
    const forbidden = r.error?.status === 403;
    return (
      <>
        <PageHeader back={{ to: `/app/quizzes/${id}`, label: "Quiz" }} title="Quiz results" />
        <EmptyState
          icon={forbidden ? Lock : ChartColumn}
          title={forbidden ? "Only the quiz owner can see results" : r.error?.status === 404 ? "Quiz not found" : "Couldn't load results"}
          description={forbidden ? "Ask the teacher who published this quiz if you need a copy of the results." : r.error?.message}
          action={
            <Button variant="secondary" asChild>
              <Link to="/app/quizzes">Back to quizzes</Link>
            </Button>
          }
        />
      </>
    );
  }

  const { summary, notAttempted } = r.data;
  const { quiz, learners, questions, concepts, top } = derived;
  const classQuiz = Boolean(quiz.classroomId);
  const classSize = summary.learners + notAttempted.length;
  // `quiz` here is the raw record (no classroom include); reuse the id for the chip link.
  const classroom = classQuiz ? { id: quiz.classroomId, name: r.data.classroomName ?? "Class", theme: undefined } : null;

  const exportCsv = () => {
    const header = ["Rank", "Name", "Email", "SAP ID", "Status", "Score", "Max score", "Percent", "Time (sec)", "Completed at"];
    const lines = learners.map((a, i) => [
      i + 1,
      a.user?.name,
      a.user?.email,
      a.user?.sapId,
      "Completed",
      fmtScore(a.score),
      fmtScore(a.maxScore),
      ratioPct(a.score, a.maxScore).toFixed(1),
      a.durationSec ?? "",
      new Date(a.completedAt).toISOString(),
    ]);
    for (const u of notAttempted) lines.push(["", u.name, u.email, u.sapId, "Not attempted", "", "", "", "", ""]);
    const csv = [header, ...lines].map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadText(`${slug(quiz.title)}-results.csv`, `﻿${csv}`, "text/csv;charset=utf-8");
    toast.success("Results exported", { description: plural(lines.length, "row") });
  };

  return (
    <>
      <PageHeader
        back={{ to: `/app/quizzes/${quiz.id}`, label: "Quiz" }}
        eyebrow={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={quiz.published ? "success" : "neutral"} dot>
              {quiz.published ? "Published" : "Private"}
            </Badge>
            {quiz.dueAt ? <Badge>Due {dueLabel(quiz.dueAt)}</Badge> : null}
          </div>
        }
        title={quiz.title}
        description="Results across every learner's best attempt."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!learners.length && !notAttempted.length}>
              <Download /> Export CSV
            </Button>
            <Button variant="secondary" asChild>
              <Link to={`/app/quizzes/${quiz.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to={`/app/quizzes/${quiz.id}`}>
                <Eye /> Open quiz
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Users} tone="sky" label="Learners" value={summary.learners} hint={classQuiz ? `of ${plural(classSize, "student")}` : "took this quiz"} />
        <StatCard
          icon={Repeat}
          tone="violet"
          label="Attempts"
          value={summary.attempts}
          hint={summary.learners ? `${(summary.attempts / summary.learners).toFixed(1)} per learner` : "none yet"}
        />
        <StatCard icon={Percent} tone="brand" label="Average score" value={pct(summary.averagePct)} hint="best attempt per learner" />
        {classQuiz ? (
          <StatCard icon={UserCheck} tone="emerald" label="Completion" value={classSize ? pct((summary.learners / classSize) * 100) : "—"} hint={`${notAttempted.length} still to go`} />
        ) : (
          <StatCard icon={Trophy} tone="emerald" label="Top score" value={top == null ? "—" : pct(top)} hint={learners[0]?.user?.name ?? "no attempts yet"} />
        )}
      </div>

      {!learners.length ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <EmptyState
            icon={ChartColumn}
            title="No attempts yet"
            description={
              quiz.published
                ? "Results will appear here as students take the quiz."
                : "Publish this quiz to a class to start collecting results — or take it yourself to test it."
            }
            action={
              <Button variant="secondary" asChild>
                <Link to={`/app/quizzes/${quiz.id}`}>{quiz.published ? "Open quiz" : "Publish from the quiz page"}</Link>
              </Button>
            }
          />
          {classQuiz ? <NotAttempted people={notAttempted} classroom={classroom} /> : null}
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <QuestionBreakdown items={questions} />
            <LearnersTable quizId={quiz.id} rows={learners} />
          </div>
          <aside className="space-y-6">
            <ConceptSummary concepts={concepts} />
            {classQuiz ? <NotAttempted people={notAttempted} classroom={classroom} /> : null}
          </aside>
        </div>
      )}
    </>
  );
}

// Keep ClassChip tree-shaken import honest if the backend starts including `classroom`.
void ClassChip;

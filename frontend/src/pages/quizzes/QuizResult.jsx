import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Check, CircleCheck, CircleDot, CircleMinus, CircleX, Lightbulb, RotateCcw, WandSparkles, X } from "lucide-react";
import { cn, dateTime, minutes } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/PageHeader";
import { AiTag } from "@/components/AiWorking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, Ring, Segmented } from "@/components/ui/misc";
import { ADAPTIVE_STEPS, AiOverlay, Meter, SEVERITY, TYPE_META, fmtScore, severity, uniqueConcepts, useAdaptiveQuiz } from "./quiz-shared";

const STATUS = {
  correct: { label: "Correct", icon: CircleCheck, cls: "text-emerald-600 dark:text-emerald-400", tone: "success" },
  partial: { label: "Partly right", icon: CircleDot, cls: "text-amber-600 dark:text-amber-400", tone: "warning" },
  wrong: { label: "Incorrect", icon: CircleX, cls: "text-rose-600 dark:text-rose-400", tone: "danger" },
  skipped: { label: "Skipped", icon: CircleMinus, cls: "text-faint", tone: "neutral" },
};

function statusOf(q, a) {
  if (!a) return "skipped";
  const empty = q.type === "short" ? !a.text?.trim() : a.choiceIndex == null;
  if (empty) return "skipped";
  if (a.correct) return "correct";
  if (a.points > 0) return "partial";
  return "wrong";
}

function headlineFor(p) {
  if (p >= 100) return "Perfect score!";
  if (p >= 90) return "Outstanding work!";
  if (p >= 80) return "Great job!";
  if (p >= 60) return "Solid effort";
  if (p >= 40) return "Getting there";
  return "Keep practising — you've got this";
}

function ChoiceReview({ q, a }) {
  return (
    <ul className="mt-4 space-y-2">
      {q.options.map((opt, i) => {
        const right = i === q.answerIndex;
        const mine = a?.choiceIndex === i;
        return (
          <li
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3.5 py-2.5",
              right
                ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                : mine
                  ? "border-rose-300 bg-rose-50/70 dark:border-rose-500/40 dark:bg-rose-500/10"
                  : "border-border",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                right ? "bg-emerald-600 text-white dark:bg-emerald-500" : mine ? "bg-rose-600 text-white dark:bg-rose-500" : "border border-border-strong text-muted",
              )}
              aria-hidden="true"
            >
              {right ? <Check className="size-3.5" strokeWidth={3} /> : mine ? <X className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <Markdown className="min-w-0 flex-1 text-sm [&_p]:my-0">{opt}</Markdown>
            {right || mine ? (
              <span className={cn("mt-0.5 shrink-0 text-xs font-medium", right ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
                {mine && right ? "Your answer" : mine ? "Your answer" : "Correct answer"}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ShortReview({ q, a }) {
  const feedback = a?.feedback && a.feedback !== "No answer given." ? a.feedback : null;
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3.5">
          <p className="text-xs font-semibold text-muted">Your answer</p>
          {a?.text?.trim() ? <p className="mt-1.5 whitespace-pre-wrap text-sm">{a.text}</p> : <p className="mt-1.5 text-sm italic text-faint">No answer given</p>}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Model answer</p>
          <Markdown className="mt-1.5 text-sm">{q.answerText ?? ""}</Markdown>
        </div>
      </div>
      {feedback ? (
        <div className="ai-surface mt-3 rounded-xl border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <AiTag>Feedback</AiTag>
            <span className="text-xs tabular-nums text-muted">
              {fmtScore(a.points)} / {fmtScore(q.points)} points
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{feedback}</p>
        </div>
      ) : null}
    </>
  );
}

function QuestionReview({ q, a, n }) {
  const st = STATUS[statusOf(q, a)];
  const Icon = st.icon;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", st.cls)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="font-semibold text-fg">Question {n}</span>
            <span aria-hidden="true">·</span>
            <span className={st.cls}>{st.label}</span>
            <span aria-hidden="true">·</span>
            <span>{TYPE_META[q.type]?.label}</span>
            {q.concept ? (
              <Badge className="h-5 px-2 text-[11px]" tone="neutral">
                {q.concept}
              </Badge>
            ) : null}
            <span className="ml-auto tabular-nums">
              {fmtScore(a?.points ?? 0)}/{fmtScore(q.points)} pts
            </span>
          </div>
          <Markdown className="mt-2">{q.prompt}</Markdown>

          {q.type === "short" ? <ShortReview q={q} a={a} /> : <ChoiceReview q={q} a={a} />}
          {q.type !== "short" && statusOf(q, a) === "skipped" ? <p className="mt-2 text-xs text-muted">You didn't answer this one.</p> : null}

          {q.explanation ? (
            <div className="mt-4 rounded-xl bg-surface-2 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Lightbulb className="size-3.5 text-brand-600 dark:text-brand-400" /> Explanation
              </p>
              <Markdown className="mt-1 text-sm">{q.explanation}</Markdown>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/**
 * Score summary + per-question review for an attempt (a fresh one, or one reopened from history).
 * `isSelf` = the viewer took this attempt (enables retake/practice actions).
 */
export function QuizResult({ quiz, attempt, questions, fresh = false, isSelf = true, learnerName, back, title, description, onRetake }) {
  const adaptive = useAdaptiveQuiz();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [attempt.id]);

  const rows = useMemo(() => {
    const byId = new Map((attempt.answers ?? []).map((a) => [a.questionId, a]));
    return questions.map((q, i) => {
      const a = byId.get(q.id) ?? null;
      return { q, a, n: i + 1, status: statusOf(q, a) };
    });
  }, [attempt, questions]);

  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {});
  const missed = rows.filter((r) => r.status !== "correct");
  const missedConcepts = uniqueConcepts(missed.map((r) => r.q.concept)).slice(0, 8);
  const p = attempt.maxScore ? (attempt.score / attempt.maxScore) * 100 : 0;
  const sev = SEVERITY[severity(p / 100)];

  const concepts = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const label = r.q.concept?.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const agg = m.get(key) ?? { label, correct: 0, total: 0 };
      agg.total += 1;
      if (r.status === "correct") agg.correct += 1;
      m.set(key, agg);
    }
    return [...m.values()].sort((x, y) => x.correct / x.total - y.correct / y.total);
  }, [rows]);

  const shown = filter === "missed" ? missed : filter === "correct" ? rows.filter((r) => r.status === "correct") : rows;

  const practiceMissed = () => adaptive.mutate(missedConcepts.length ? { count: 6, concepts: missedConcepts } : { count: 6 });

  return (
    <>
      <PageHeader back={back} title={title ?? quiz.title} description={description} />

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="ai-surface flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:gap-8 sm:p-8 sm:text-left">
            <Ring value={p} size={132} stroke={10} barClassName={sev.ring} className="shrink-0">
              <div className="text-center">
                <p className="text-3xl font-semibold tracking-tight">{Math.round(p)}%</p>
                <p className="text-xs text-muted">score</p>
              </div>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold tracking-tight">{isSelf ? headlineFor(p) : `${learnerName ?? "This learner"} scored ${Math.round(p)}%`}</p>
              <p className="mt-1 text-sm text-muted">
                {fmtScore(attempt.score)} of {fmtScore(attempt.maxScore)} points · {counts.correct ?? 0} of {rows.length} correct
                {attempt.durationSec ? ` · ${minutes(attempt.durationSec)}` : ""}
                {!fresh ? ` · ${dateTime(attempt.completedAt)}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {["correct", "partial", "wrong", "skipped"].map((k) =>
                  counts[k] ? (
                    <Badge key={k} tone={STATUS[k].tone}>
                      {counts[k]} {STATUS[k].label.toLowerCase()}
                    </Badge>
                  ) : null,
                )}
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                {isSelf && missed.length ? (
                  <Button onClick={practiceMissed} loading={adaptive.isPending}>
                    <WandSparkles /> Practice what I missed
                  </Button>
                ) : null}
                {isSelf && onRetake ? (
                  <Button variant={missed.length ? "secondary" : "primary"} onClick={onRetake}>
                    <RotateCcw /> Retake
                  </Button>
                ) : null}
                <Button variant="ghost" asChild>
                  <Link to={back?.to ?? "/app/quizzes"}>
                    <ArrowLeft /> {back?.label ? `Back to ${back.label.toLowerCase()}` : "Back to quizzes"}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="review-heading" className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="review-heading" className="text-lg font-semibold tracking-tight">
                Review answers
              </h2>
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `All ${rows.length}` },
                  { value: "missed", label: `Missed ${missed.length}` },
                  { value: "correct", label: `Correct ${counts.correct ?? 0}` },
                ]}
              />
            </div>
            {shown.length ? (
              <div className="space-y-3">
                {shown.map((r) => (
                  <QuestionReview key={r.q.id} q={r.q} a={r.a} n={r.n} />
                ))}
              </div>
            ) : (
              <EmptyState compact icon={filter === "missed" ? CircleCheck : CircleX} title={filter === "missed" ? "Nothing missed — every answer was right." : "No correct answers this time."} />
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {concepts.length ? (
              <Card>
                <CardHeader title="By concept" description={isSelf ? "Where this attempt was strong and weak." : "How this learner did per concept."} />
                <CardContent>
                  <ul className="space-y-3.5">
                    {concepts.map((c) => {
                      const ratio = c.correct / c.total;
                      return (
                        <li key={c.label}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">{c.label}</span>
                            <span className={cn("shrink-0 text-xs font-semibold tabular-nums", SEVERITY[severity(ratio)].text)}>
                              {c.correct}/{c.total}
                            </span>
                          </div>
                          <Meter value={ratio} label={`${c.label}: ${c.correct} of ${c.total} correct`} height="h-1.5" className="mt-1.5" />
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
            {isSelf && missedConcepts.length ? (
              <Card className="ai-surface p-5">
                <p className="text-sm font-semibold tracking-tight">Turn misses into mastery</p>
                <p className="mt-1 text-sm text-muted">
                  We'll write a fresh 6-question quiz on {missedConcepts.slice(0, 3).join(", ")}
                  {missedConcepts.length > 3 ? ` and ${missedConcepts.length - 3} more` : ""} — new angles, same ideas.
                </p>
                <Button className="mt-4 w-full" onClick={practiceMissed} loading={adaptive.isPending}>
                  <WandSparkles /> Practice what I missed
                </Button>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>

      <AiOverlay open={adaptive.isPending} title="Building your practice quiz…" steps={ADAPTIVE_STEPS} />
    </>
  );
}

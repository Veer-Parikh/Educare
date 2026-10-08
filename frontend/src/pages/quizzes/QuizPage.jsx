import { useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  CalendarClock,
  ChartColumn,
  ChevronRight,
  Ellipsis,
  EyeOff,
  FileQuestion,
  History,
  Keyboard,
  ListChecks,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, dueLabel, fromNow, minutes, plural, toLocalInput } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ClassChip } from "@/components/ClassChip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, Kbd, Ring, Skeleton } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { QuizRunner } from "./QuizRunner";
import { QuizResult } from "./QuizResult";
import { DIFFICULTY_META, SEVERITY, TYPE_META, fmtScore, ratioPct, severity, sourceMeta } from "./quiz-shared";

// ---- publish -------------------------------------------------------------------

function PublishForm({ quiz, onDone }) {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api.get("/classes") });
  const list = classes.data?.classes ?? [];
  const [classroomId, setClassroomId] = useState(quiz.classroomId ?? "");
  const [dueAt, setDueAt] = useState(toLocalInput(quiz.dueAt));
  const selected = classroomId || list[0]?.id || "";
  const pastDue = dueAt && new Date(dueAt).getTime() < Date.now();

  const publish = useMutation({
    mutationFn: () => api.patch(`/quizzes/${quiz.id}`, { published: true, classroomId: selected, dueAt: dueAt ? new Date(dueAt).toISOString() : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiz", quiz.id] });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      const name = list.find((c) => c.id === selected)?.name;
      toast.success(quiz.published ? "Publishing updated" : "Quiz published", { description: name ? `Students in ${name} have been notified.` : undefined });
      onDone();
    },
  });

  return (
    <DialogContent
      title={quiz.published ? "Class & due date" : "Publish to a class"}
      description="Students in the class get a notification and can take the quiz right away. Answers stay hidden until they submit."
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => publish.mutate()} loading={publish.isPending} disabled={!selected}>
            <Send /> {quiz.published ? "Save" : "Publish"}
          </Button>
        </>
      }
    >
      {classes.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !list.length ? (
        <EmptyState
          compact
          title="No classes yet"
          description="Create a class first, then publish quizzes to it."
          action={
            <Button variant="secondary" asChild>
              <Link to="/app/classes">Go to classes</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <Field label="Class">
            {(p) => (
              <Select {...p} value={selected} onChange={(e) => setClassroomId(e.target.value)}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.section ? ` · ${c.section}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date" optional hint={pastDue ? "Heads up: this date is in the past — the quiz will show as overdue." : "Leave empty for no deadline."}>
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="min-w-0 flex-1" />
                {dueAt ? (
                  <Button variant="ghost" onClick={() => setDueAt("")}>
                    Clear
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
        </div>
      )}
    </DialogContent>
  );
}

// ---- overview ------------------------------------------------------------------

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold">{children}</dd>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-4 h-8 w-2/3 max-w-md" />
      <Skeleton className="mt-2 h-4 w-1/2 max-w-sm" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

function Overview({ quiz, isOwner, attempts, onStart, onReview }) {
  const { isTeacher } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [publishOpen, setPublishOpen] = useState(false);

  const src = sourceMeta(quiz.source);
  const diff = DIFFICULTY_META[quiz.difficulty] ?? DIFFICULTY_META.mixed;
  const totalPoints = quiz.questions.reduce((s, q) => s + (q.points ?? 1), 0);
  const typeCounts = quiz.questions.reduce((c, q) => ({ ...c, [q.type]: (c[q.type] ?? 0) + 1 }), {});
  const best = attempts.reduce((b, a) => (!b || ratioPct(a.score, a.maxScore) > ratioPct(b.score, b.maxScore) ? a : b), null);
  const overdue = quiz.dueAt && new Date(quiz.dueAt).getTime() < Date.now();

  const unpublish = useMutation({
    mutationFn: () => api.patch(`/quizzes/${quiz.id}`, { published: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiz", quiz.id] });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Quiz unpublished", { description: "Students can no longer open it. Their attempts are kept." });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/quizzes/${quiz.id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["quiz", quiz.id] });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Quiz deleted");
      navigate("/app/quizzes", { replace: true });
    },
  });

  const askUnpublish = async () => {
    if (
      await confirm({
        title: "Unpublish this quiz?",
        description: `Students in ${quiz.classroom?.name ?? "the class"} will no longer see it. Existing attempts and results are kept.`,
        confirmLabel: "Unpublish",
      })
    )
      unpublish.mutate();
  };

  const askDelete = async () => {
    if (
      await confirm({
        title: "Delete this quiz?",
        description: `“${quiz.title}” and all ${plural(attempts.length, "attempt")} you can see will be permanently deleted${quiz.published ? ", including your students' results" : ""}.`,
        confirmLabel: "Delete quiz",
        danger: true,
      })
    )
      remove.mutate();
  };

  const canPublish = isOwner && isTeacher;

  return (
    <>
      <PageHeader
        back={{ to: "/app/quizzes", label: "Quizzes" }}
        eyebrow={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={diff.tone}>{diff.label}</Badge>
            <Badge>
              <src.icon /> {src.label}
            </Badge>
            {isOwner && quiz.published ? (
              <Badge tone="success" dot>
                Published
              </Badge>
            ) : null}
          </div>
        }
        title={quiz.title}
        description={quiz.description || (quiz.topic !== quiz.title ? quiz.topic : null)}
        actions={
          isOwner ? (
            <>
              <Button variant="secondary" asChild>
                <Link to={`/app/quizzes/${quiz.id}/results`}>
                  <ChartColumn /> Results
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to={`/app/quizzes/${quiz.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              {canPublish && !quiz.published ? (
                <Button variant="secondary" onClick={() => setPublishOpen(true)}>
                  <Send /> Publish to class
                </Button>
              ) : null}
              <Menu modal={false}>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <Ellipsis />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {canPublish && quiz.published ? (
                    <>
                      <MenuItem icon={CalendarClock} onSelect={() => setPublishOpen(true)}>
                        Change class or due date
                      </MenuItem>
                      <MenuItem icon={EyeOff} onSelect={askUnpublish}>
                        Unpublish
                      </MenuItem>
                      <MenuSeparator />
                    </>
                  ) : null}
                  <MenuItem icon={Trash2} danger onSelect={askDelete}>
                    Delete quiz
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <div className="ai-surface p-5 sm:p-8">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Fact icon={ListChecks} label="Questions">
                  {quiz.questions.length}
                </Fact>
                <Fact icon={Timer} label="Time limit">
                  {quiz.timeLimitMin ? `${quiz.timeLimitMin} min` : "Untimed"}
                </Fact>
                <Fact icon={Award} label="Points">
                  {fmtScore(totalPoints)}
                </Fact>
                <Fact icon={CalendarClock} label="Due">
                  <span className={cn(overdue && !attempts.length && "text-rose-600 dark:text-rose-400")}>{quiz.dueAt ? dueLabel(quiz.dueAt) : "No deadline"}</span>
                </Fact>
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                {Object.entries(typeCounts).map(([t, n]) => {
                  const Icon = TYPE_META[t]?.icon ?? FileQuestion;
                  return (
                    <span key={t} className="inline-flex items-center gap-1.5">
                      <Icon className="size-4" /> {n} {TYPE_META[t]?.label.toLowerCase() ?? t}
                    </span>
                  );
                })}
                {quiz.classroom ? <ClassChip classroom={quiz.classroom} /> : null}
              </div>

              <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button size="lg" onClick={onStart} className="w-full sm:w-auto">
                  {attempts.length ? <RotateCcw /> : <Play />} {attempts.length ? "Retake quiz" : "Start quiz"}
                </Button>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Keyboard className="size-4 shrink-0" />
                  <span>
                    One question at a time. Use <Kbd>1</Kbd>–<Kbd>4</Kbd> to choose and <Kbd>Enter</Kbd> for next.
                    {quiz.timeLimitMin ? " The quiz submits itself when time runs out." : ""}
                  </span>
                </p>
              </div>
            </div>
          </Card>

          {isOwner && quiz.published ? (
            <Card>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight">Published to {quiz.classroom?.name ?? "a class"}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {quiz.dueAt ? `Due ${dueLabel(quiz.dueAt)}. ` : "No due date. "}See how each student did and which questions tripped the class up.
                  </p>
                </div>
                <Button variant="secondary" asChild>
                  <Link to={`/app/quizzes/${quiz.id}/results`}>
                    View results <ChevronRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader
              icon={History}
              title="Your attempts"
              description={best ? `Best ${Math.round(ratioPct(best.score, best.maxScore))}% · ${plural(attempts.length, "attempt")}` : "Your scores will appear here."}
            />
            <CardContent>
              {attempts.length ? (
                <ul className="-mx-2 max-h-105 space-y-0.5 overflow-y-auto scroll-thin">
                  {attempts.map((a) => {
                    const p = ratioPct(a.score, a.maxScore);
                    const isBest = best?.id === a.id && attempts.length > 1;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => onReview(a.id)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-subtle"
                        >
                          <Ring value={p} size={38} stroke={4} barClassName={SEVERITY[severity(p / 100)].ring}>
                            <span className="text-[10px] font-semibold tabular-nums">{Math.round(p)}</span>
                          </Ring>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              {fmtScore(a.score)}/{fmtScore(a.maxScore)} points
                              {isBest ? <Trophy className="size-3.5 text-brand-600 dark:text-brand-400" aria-label="Best attempt" /> : null}
                            </span>
                            <span className="block text-xs text-muted">
                              {fromNow(a.completedAt)}
                              {a.durationSec ? ` · ${minutes(a.durationSec)}` : ""}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-faint" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-border-strong/70 px-4 py-6 text-center text-sm text-muted">No attempts yet — you've got a clean slate.</div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {canPublish ? (
        <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
          {publishOpen ? <PublishForm quiz={quiz} onDone={() => setPublishOpen(false)} /> : null}
        </Dialog>
      ) : null}
    </>
  );
}

// ---- attempt review -----------------------------------------------------------

function AttemptReview({ quiz, attemptId, onRetake }) {
  const { user } = useAuth();
  const location = useLocation();
  const attempt = useQuery({
    queryKey: ["quiz", quiz.id, "attempt", attemptId],
    queryFn: () => api.get(`/quizzes/${quiz.id}/attempts/${attemptId}`),
  });

  if (attempt.isLoading) return <OverviewSkeleton />;
  if (attempt.isError)
    return (
      <>
        <PageHeader back={{ to: `/app/quizzes/${quiz.id}`, label: "Quiz" }} title="Attempt not found" />
        <EmptyState
          icon={History}
          title="We couldn't open that attempt"
          description={attempt.error?.message}
          action={
            <Button variant="secondary" asChild>
              <Link to={`/app/quizzes/${quiz.id}`}>Back to the quiz</Link>
            </Button>
          }
        />
      </>
    );

  const data = attempt.data;
  const isSelf = data.attempt.userId === user?.id;
  const learner = location.state?.learner;
  return (
    <QuizResult
      quiz={quiz}
      attempt={data.attempt}
      questions={data.questions}
      isSelf={isSelf}
      learnerName={learner}
      back={isSelf ? { to: `/app/quizzes/${quiz.id}`, label: "Quiz" } : { to: `/app/quizzes/${quiz.id}/results`, label: "Results" }}
      title={isSelf ? "Attempt review" : `${learner ?? "Learner"}'s attempt`}
      description={quiz.title}
      onRetake={isSelf ? onRetake : undefined}
    />
  );
}

// ---- page ------------------------------------------------------------------------

function QuizScreen({ id }) {
  const [params, setParams] = useSearchParams();
  const reviewId = params.get("attempt");
  const [mode, setMode] = useState("overview"); // overview | taking | result
  const [result, setResult] = useState(null);
  const [run, setRun] = useState(0);

  const q = useQuery({ queryKey: ["quiz", id], queryFn: () => api.get(`/quizzes/${id}`) });

  const start = () => {
    if (reviewId) setParams({}, { replace: true });
    setResult(null);
    setRun((n) => n + 1);
    setMode("taking");
    window.scrollTo({ top: 0 });
  };

  if (q.isLoading) return <OverviewSkeleton />;
  if (q.isError)
    return (
      <>
        <PageHeader back={{ to: "/app/quizzes", label: "Quizzes" }} title={q.error?.status === 404 ? "Quiz not found" : "Couldn't load this quiz"} />
        <EmptyState
          icon={FileQuestion}
          title={q.error?.status === 404 ? "This quiz doesn't exist or isn't shared with you" : "Something went wrong"}
          description={q.error?.status === 404 ? "It may have been deleted or unpublished by its owner." : q.error?.message}
          action={
            q.error?.status === 404 ? (
              <Button variant="secondary" asChild>
                <Link to="/app/quizzes">Back to quizzes</Link>
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => q.refetch()}>
                Try again
              </Button>
            )
          }
        />
      </>
    );

  const { quiz, isOwner, attempts } = q.data;

  if (mode === "taking")
    return (
      <QuizRunner
        key={run}
        quiz={quiz}
        onExit={() => setMode("overview")}
        onSubmitted={(res) => {
          setResult(res);
          setMode("result");
        }}
      />
    );

  if (mode === "result" && result)
    return (
      <QuizResult
        quiz={quiz}
        attempt={result.attempt}
        questions={result.questions}
        fresh
        back={{ to: "/app/quizzes", label: "Quizzes" }}
        description="Here's how you did — review every answer below."
        onRetake={start}
      />
    );

  if (reviewId) return <AttemptReview key={reviewId} quiz={quiz} attemptId={reviewId} onRetake={start} />;

  if (!quiz.questions.length)
    return (
      <>
        <PageHeader back={{ to: "/app/quizzes", label: "Quizzes" }} title={quiz.title} />
        <EmptyState
          icon={FileQuestion}
          title="This quiz has no questions yet"
          action={
            isOwner ? (
              <Button asChild>
                <Link to={`/app/quizzes/${quiz.id}/edit`}>
                  <Pencil /> Add questions
                </Link>
              </Button>
            ) : null
          }
        />
      </>
    );

  return <Overview quiz={quiz} isOwner={isOwner} attempts={attempts} onStart={start} onReview={(attemptId) => setParams({ attempt: attemptId })} />;
}

export default function QuizPage() {
  const { id } = useParams();
  // Keyed so moving between quizzes (e.g. into an adaptive follow-up) starts fresh.
  return <QuizScreen key={id} id={id} />;
}

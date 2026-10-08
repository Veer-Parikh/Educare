import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Inbox, ListChecks, Megaphone, PencilLine, Search, Sparkles, Target, Timer, WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, dueLabel, fromNow, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ClassChip } from "@/components/ClassChip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, Ring, Segmented, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GenerateQuizDialog } from "./GenerateQuizDialog";
import { ADAPTIVE_STEPS, AiOverlay, DIFFICULTY_META, Meter, SEVERITY, severity, sourceMeta, useAdaptiveQuiz } from "./quiz-shared";

const HOUR = 3600 * 1000;

function dueState(quiz) {
  if (!quiz.dueAt) return null;
  const diff = new Date(quiz.dueAt).getTime() - Date.now();
  const label = `Due ${dueLabel(quiz.dueAt)}`;
  if (quiz.myBest) return { tone: "neutral", label };
  if (diff < 0) return { tone: "danger", label: `Overdue · ${dueLabel(quiz.dueAt)}` };
  if (diff < 48 * HOUR) return { tone: "warning", label };
  return { tone: "neutral", label };
}

/** Pending first (soonest due first), then completed (newest first). */
function sortAssigned(list) {
  const dueTime = (q) => (q.dueAt ? new Date(q.dueAt).getTime() : Infinity);
  return [...list].sort((a, b) => {
    if (!a.myBest !== !b.myBest) return a.myBest ? 1 : -1;
    if (!a.myBest) return dueTime(a) - dueTime(b);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function QuizCard({ quiz, assigned }) {
  const src = sourceMeta(quiz.source);
  const SrcIcon = src.icon;
  const diff = DIFFICULTY_META[quiz.difficulty] ?? DIFFICULTY_META.mixed;
  const best = quiz.myBest;
  const due = dueState(quiz);
  const bestPct = best ? Math.round(best.pct * 100) : null;

  return (
    <Link to={`/app/quizzes/${quiz.id}`} className="group block rounded-2xl focus-visible:outline-offset-4">
      <Card interactive className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-muted transition-colors group-hover:bg-brand-100 group-hover:text-brand-800 dark:group-hover:bg-brand-500/15 dark:group-hover:text-brand-300">
            <SrcIcon className="size-4.5" />
          </span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {!assigned && quiz.published ? (
              <Badge tone="success" dot>
                Published
              </Badge>
            ) : null}
            <Badge tone={diff.tone}>{diff.label}</Badge>
          </div>
        </div>

        <h3 className="mt-4 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">{quiz.title}</h3>
        {quiz.topic && quiz.topic !== quiz.title ? <p className="mt-1 line-clamp-1 text-sm text-muted">{quiz.topic}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3.5" /> {plural(quiz.questionCount, "question")}
          </span>
          {quiz.timeLimitMin ? (
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" /> {quiz.timeLimitMin} min
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <SrcIcon className="size-3.5" /> {src.label}
          </span>
        </div>
        {quiz.classroom ? <ClassChip classroom={quiz.classroom} link={false} className="mt-2" /> : null}

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
            {best ? (
              <span className="flex items-center gap-2">
                <Ring value={bestPct} size={24} stroke={3} barClassName={SEVERITY[severity(best.pct)].ring} />
                <span>
                  <span className="font-semibold tabular-nums text-fg">{bestPct}%</span> <span className="text-muted">best · {plural(best.count ?? 1, "attempt")}</span>
                </span>
              </span>
            ) : (
              <span className="text-muted">{assigned ? "Not started" : "Not attempted yet"}</span>
            )}
            {due ? (
              <Badge tone={due.tone} className="max-w-full">
                <span className="truncate">{due.label}</span>
              </Badge>
            ) : !assigned && quiz.published ? (
              <span className="text-muted">{plural(quiz._count?.attempts ?? 0, "class attempt")}</span>
            ) : (
              <span className="text-faint">{fromNow(quiz.createdAt)}</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="p-5">
          <div className="flex justify-between">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="mt-6 h-4 w-full" />
        </Card>
      ))}
    </div>
  );
}

function QuizGrid({ query, assigned, filter, empty }) {
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError)
    return (
      <EmptyState
        icon={Inbox}
        title="Couldn't load quizzes"
        description={query.error?.message}
        action={
          <Button variant="secondary" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  const all = query.data?.quizzes ?? [];
  if (!all.length) return empty;
  const list = filter(all);
  if (!list.length) return <EmptyState compact icon={Search} title="No matches" description="Try a different search or filter." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {list.map((q) => (
        <QuizCard key={q.id} quiz={q} assigned={assigned} />
      ))}
    </div>
  );
}

function WeakSpotsPanel({ adaptive, onGenerate }) {
  const mastery = useQuery({ queryKey: ["mastery"], queryFn: () => api.get("/mastery") });
  const weak = mastery.data?.weak ?? [];
  const strong = mastery.data?.strong ?? [];

  return (
    <Card>
      <CardHeader icon={Target} title="Weak spots" description="Concepts you miss most often, tracked across every quiz you take." />
      <CardContent>
        {mastery.isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : weak.length ? (
          <ul className="space-y-4">
            {weak.slice(0, 6).map((c) => {
              const p = Math.round(c.accuracy * 100);
              return (
                <li key={c.concept}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{c.concept}</span>
                    <span className={cn("shrink-0 text-xs font-semibold tabular-nums", SEVERITY[severity(c.accuracy)].text)}>{p}%</span>
                  </div>
                  <Meter value={c.accuracy} label={`${c.concept}: ${p}% accuracy`} height="h-1.5" className="mt-1.5" />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
                    <span>
                      {c.correct} of {c.total} correct
                    </span>
                    <button
                      type="button"
                      onClick={() => adaptive.mutate({ count: 6, concepts: [c.concept] })}
                      disabled={adaptive.isPending}
                      aria-label={`Practice ${c.concept}`}
                      className="rounded font-medium text-muted underline-offset-2 transition hover:text-fg hover:underline disabled:opacity-50"
                    >
                      Practice
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-border-strong/70 px-4 py-6 text-center">
            <p className="text-sm font-medium">Nothing weak yet</p>
            <p className="mt-1 text-xs text-muted">Take a few quizzes — we'll track the concepts you miss and build practice around them.</p>
            <Button variant="link" size="sm" className="mt-3 text-xs" onClick={onGenerate}>
              Generate a quiz
            </Button>
          </div>
        )}

        {strong.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted">You're solid on</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {strong.slice(0, 6).map((s) => (
                <Badge key={s.concept} tone="success" className="max-w-full">
                  <span className="truncate">{s.concept}</span>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
      {weak.length ? (
        <CardFooter className="border-t-0 pt-0 pb-5">
          <Button className="w-full" onClick={() => adaptive.mutate({ count: 8 })} disabled={adaptive.isPending}>
            <WandSparkles /> Practice weak spots
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

const TEACHER_STEPS = [
  ["Generate or write", "Start from a topic, notes, a class material or a blank quiz."],
  ["Review & edit", "Tweak questions, answers, explanations and points."],
  ["Publish", "Send it to a class with an optional due date."],
  ["Track", "See per-question results and which concepts need re-teaching."],
];

function TeacherPanel({ quizzes, loading }) {
  const published = quizzes.filter((q) => q.published);
  const attempts = published.reduce((s, q) => s + (q._count?.attempts ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={Megaphone} title="Class quizzes" description="Published quizzes and how many attempts they've collected." />
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Published</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "–" : published.length}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Attempts</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "–" : attempts}</p>
            </div>
          </div>
          {published.length ? (
            <ul className="-mx-2 mt-4 space-y-0.5">
              {published.slice(0, 5).map((q) => (
                <li key={q.id}>
                  <Link to={`/app/quizzes/${q.id}/results`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-subtle">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{q.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <ClassChip classroom={q.classroom} link={false} />
                        <span className="shrink-0">· {plural(q._count?.attempts ?? 0, "attempt")}</span>
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {!loading && !published.length ? (
        <Card className="p-5">
          <p className="text-sm font-semibold tracking-tight">How class quizzes work</p>
          <ol className="mt-3 space-y-3">
            {TEACHER_STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-900 dark:bg-brand-500/15 dark:text-brand-200">{i + 1}</span>
                <span className="text-sm">
                  <span className="font-medium">{title}</span>
                  <span className="block text-xs text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

export default function QuizzesPage() {
  const { isStudent, isTeacher } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");

  const mine = useQuery({ queryKey: ["quizzes", "mine"], queryFn: () => api.get("/quizzes?scope=mine") });
  const assigned = useQuery({ queryKey: ["quizzes", "assigned"], queryFn: () => api.get("/quizzes?scope=assigned"), enabled: isStudent });
  const adaptive = useAdaptiveQuiz();

  const createManual = useMutation({
    mutationFn: () =>
      api.post("/quizzes", {
        title: "Untitled quiz",
        questions: [{ type: "mcq", prompt: "Untitled question", options: ["Option A", "Option B"], answerIndex: 0 }],
      }),
    onSuccess: ({ quiz }) => {
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Blank quiz created");
      navigate(`/app/quizzes/${quiz.id}/edit`);
    },
  });

  const assignedList = useMemo(() => sortAssigned(assigned.data?.quizzes ?? []), [assigned.data]);
  const pendingCount = assignedList.filter((q) => !q.myBest).length;
  // Students land on "Assigned" while it loads and whenever something there is still to do.
  const tab = params.get("tab") ?? (isStudent && (assigned.isLoading || pendingCount > 0) ? "assigned" : "mine");
  const setTab = (t) => setParams((p) => ({ ...Object.fromEntries(p), tab: t }), { replace: true });

  const term = search.trim().toLowerCase();
  const filterMine = (list) =>
    list.filter(
      (q) =>
        (visibility === "all" || (visibility === "published" ? q.published : !q.published)) &&
        (!term || q.title.toLowerCase().includes(term) || q.topic?.toLowerCase().includes(term)),
    );
  const filterAssigned = () => assignedList.filter((q) => !term || q.title.toLowerCase().includes(term) || q.topic?.toLowerCase().includes(term) || q.classroom?.name.toLowerCase().includes(term));

  const totalShown = tab === "assigned" ? assignedList.length : (mine.data?.quizzes.length ?? 0);

  const mineEmpty = isTeacher ? (
    <EmptyState
      icon={ListChecks}
      title="Create your first quiz"
      description="Generate one from a topic, your notes or a class material in seconds — or write it yourself."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles /> Generate quiz
          </Button>
          <Button variant="secondary" onClick={() => createManual.mutate()} loading={createManual.isPending}>
            <PencilLine /> Create manually
          </Button>
        </div>
      }
    />
  ) : (
    <EmptyState
      icon={ListChecks}
      title="No quizzes yet"
      description="Generate a quiz from any topic, your notes or a photo of a textbook page. Every answer you give sharpens your weak-spot practice."
      action={
        <Button onClick={() => setGenerateOpen(true)}>
          <Sparkles /> Generate quiz
        </Button>
      }
    />
  );

  const assignedEmpty = (
    <EmptyState icon={Inbox} title="Nothing assigned yet" description="When your teachers publish quizzes to your classes, they'll show up here." />
  );

  const toolbar =
    totalShown > 4 || (isTeacher && (mine.data?.quizzes.length ?? 0) > 0) ? (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {totalShown > 4 ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quizzes" aria-label="Search quizzes" className="pl-9" />
          </div>
        ) : null}
        {isTeacher ? (
          <Segmented
            size="sm"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "all", label: "All" },
              { value: "published", label: "Published" },
              { value: "private", label: "Private" },
            ]}
            className="sm:ml-auto"
          />
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <PageHeader
        title="Quizzes"
        description={
          isTeacher
            ? "Generate quizzes from any source, fine-tune the questions and publish them to your classes."
            : "Test yourself with AI-generated quizzes — then practise exactly what you missed."
        }
        actions={
          <>
            {isTeacher ? (
              <Button variant="secondary" onClick={() => createManual.mutate()} loading={createManual.isPending}>
                <PencilLine /> Create manually
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => adaptive.mutate({ count: 8 })} loading={adaptive.isPending}>
                <Target /> Practice weak spots
              </Button>
            )}
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles /> Generate quiz
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {isStudent ? (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="assigned">
                  Assigned
                  {pendingCount ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-[#16140f]">{pendingCount}</span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="mine">My quizzes</TabsTrigger>
              </TabsList>
              {toolbar ? <div className="mb-4">{toolbar}</div> : null}
              <TabsContent value="assigned">
                <QuizGrid query={assigned} assigned filter={filterAssigned} empty={assignedEmpty} />
              </TabsContent>
              <TabsContent value="mine">
                <QuizGrid query={mine} filter={filterMine} empty={mineEmpty} />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              {toolbar}
              <QuizGrid query={mine} filter={filterMine} empty={mineEmpty} />
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {isStudent ? (
            <WeakSpotsPanel adaptive={adaptive} onGenerate={() => setGenerateOpen(true)} />
          ) : (
            <TeacherPanel quizzes={mine.data?.quizzes ?? []} loading={mine.isLoading} />
          )}
        </aside>
      </div>

      <GenerateQuizDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <AiOverlay open={adaptive.isPending} title="Building your practice quiz…" steps={ADAPTIVE_STEPS} />
    </>
  );
}

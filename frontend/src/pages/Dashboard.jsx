import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileQuestion,
  Flame,
  GalleryVerticalEnd,
  GraduationCap,
  LineChart,
  ListChecks,
  NotebookPen,
  Plus,
  Route,
  School,
  Sparkles,
  Target,
  Timer,
  TriangleAlert,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, dueLabel, fromNow, greeting, pct, plural, shortName } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Progress, Ring, Skeleton } from "@/components/ui/misc";
import { StatCard } from "@/components/StatCard";
import { ClassChip, ClassDot } from "@/components/ClassChip";

export default function Dashboard() {
  const { isTeacher } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get("/dashboard"), refetchInterval: 120_000 });
  if (isLoading) return <DashboardSkeleton />;
  if (error) return <EmptyState icon={TriangleAlert} title="Couldn't load your dashboard" description={error.message} />;
  return isTeacher ? <TeacherDashboard data={data} /> : <StudentDashboard data={data} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function Greeting({ name, children }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {greeting()}, {shortName(name).replace(/\.$/, "")}.
      </h1>
      <p className="mt-2 text-[15px] text-muted">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live sessions (shared)
// ---------------------------------------------------------------------------

function SessionRow({ s }) {
  const start = new Date(s.startsAt);
  const end = new Date(start.getTime() + s.durationMin * 60_000);
  const now = Date.now();
  const live = now >= start.getTime() - 10 * 60_000 && now <= end.getTime();
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", live ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : "bg-subtle text-muted")}>
        <Video className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{s.title}</p>
        <p className={cn("truncate text-xs", live ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted")}>{live ? "Live now" : dueLabel(s.startsAt)}</p>
        <ClassChip classroom={s.classroom} className="mt-0.5" />
      </div>
      <Button size="sm" variant={live ? "primary" : "secondary"} asChild>
        <a href={s.meetingUrl} target="_blank" rel="noreferrer">
          {live ? "Join" : "Open"}
        </a>
      </Button>
    </li>
  );
}

function SessionsCard({ sessions }) {
  return (
    <Card>
      <CardHeader icon={CalendarClock} title="Live sessions" description="Next 7 days" />
      <CardContent className="pt-1">
        {sessions?.length ? (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted">No sessions scheduled.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

function useAdaptive() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post("/quizzes/adaptive", { count: 8 }),
    onSuccess: ({ quiz }) => navigate(`/app/quizzes/${quiz.id}`),
  });
}

/** Rank what's most worth doing right now. */
function buildPlan(d) {
  const plan = [];
  if (d.overdue.length) {
    const a = d.overdue[0];
    plan.push({ key: "overdue", icon: TriangleAlert, tone: "danger", title: `Catch up: ${a.title}`, meta: `Was due ${fromNow(a.dueAt)}`, to: `/app/assignments/${a.id}`, cta: "Open" });
  }
  if (d.stats.dueCards) plan.push({ key: "cards", icon: GalleryVerticalEnd, tone: "sky", title: `Review ${plural(d.stats.dueCards, "flashcard")}`, meta: `About ${Math.max(1, Math.round(d.stats.dueCards * 0.15))} min · keeps your memory fresh`, to: "/app/review", cta: "Review" });
  const soon = d.upcoming[0];
  if (soon) plan.push({ key: "assignment", icon: ClipboardCheck, tone: "brand", title: soon.title, meta: `Due ${dueLabel(soon.dueAt)}`, to: `/app/assignments/${soon.id}`, cta: "Work on it", classroom: soon.classroom });
  const quiz = d.pendingQuizzes[0];
  if (quiz) plan.push({ key: "quiz", icon: ListChecks, tone: "violet", title: `Class quiz: ${quiz.title}`, meta: `${plural(quiz.questionCount, "question")}${quiz.dueAt ? ` · due ${dueLabel(quiz.dueAt)}` : ""}`, to: `/app/quizzes/${quiz.id}`, cta: "Take quiz", classroom: quiz.classroom });
  if (d.weakConcepts.length) plan.push({ key: "weak", icon: Target, tone: "orange", title: `Strengthen ${d.weakConcepts[0].concept}`, meta: `${pct(d.weakConcepts[0].accuracy * 100)} accuracy so far`, action: "adaptive", cta: "Practice" });
  if (d.roadmap?.next) plan.push({ key: "roadmap", icon: Route, tone: "emerald", title: `Week ${d.roadmap.next.week}: ${d.roadmap.next.title}`, meta: d.roadmap.goal, to: `/app/roadmaps/${d.roadmap.id}`, cta: "Continue" });
  if (plan.length < 3) plan.push({ key: "focus", icon: Timer, tone: "neutral", title: "Start a 25-minute focus session", meta: "Earns XP and keeps your streak alive", to: "/app/focus", cta: "Focus" });
  return plan.slice(0, 5);
}

const TONES = {
  danger: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  brand: "bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  neutral: "bg-subtle text-muted",
};

function TodayPlan({ data }) {
  const adaptive = useAdaptive();
  const plan = buildPlan(data);
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={Sparkles} title="Your plan for today" description="Ranked by what matters most right now" />
      <CardContent className="pt-3">
        <ol className="space-y-2">
          {plan.map((item, i) => {
            const Icon = item.icon;
            const inner = (
              <>
                <span className="w-4 text-center text-xs font-semibold tabular-nums text-faint">{i + 1}</span>
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONES[item.tone])}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
                    {item.classroom ? <ClassChip classroom={item.classroom} link={false} /> : null}
                    <span className="truncate">{item.meta}</span>
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-sm font-medium text-muted transition group-hover:text-fg sm:inline-flex">
                  {item.cta} <ArrowRight className="size-3.5" />
                </span>
              </>
            );
            const cls = "group flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-border hover:bg-surface-2";
            return (
              <li key={item.key}>
                {item.action === "adaptive" ? (
                  <button className={cls} onClick={() => adaptive.mutate()} disabled={adaptive.isPending}>
                    {inner}
                  </button>
                ) : (
                  <Link to={item.to} className={cls}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        {adaptive.isPending ? <p className="mt-3 text-xs text-muted">Building a quiz on your weak spots…</p> : null}
      </CardContent>
    </Card>
  );
}

function StudentDashboard({ data }) {
  const { user } = useAuth();
  const s = data.stats;
  const goalPct = s.dailyGoalXp ? (s.todayXp / s.dailyGoalXp) * 100 : 0;
  const adaptive = useAdaptive();
  const dueThisWeek = data.upcoming.filter((a) => new Date(a.dueAt) - Date.now() < 7 * 86_400_000).length;

  return (
    <div>
      <Greeting name={user?.name}>
        {dueThisWeek ? `${plural(dueThisWeek, "assignment")} due this week` : "Nothing due this week"}
        {s.dueCards ? ` · ${plural(s.dueCards, "card")} to review` : ""}
        {s.streak ? ` · ${s.streak}-day streak` : ""}
      </Greeting>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Flame} tone="orange" label="Streak" value={`${s.streak} ${s.streak === 1 ? "day" : "days"}`} hint={`Best: ${s.longestStreak}`} to="/app/progress" />
        <Card className="flex items-center gap-4 p-4">
          <Ring value={goalPct} size={64} stroke={7}>
            <span className="text-xs font-semibold tabular-nums">{Math.min(100, Math.round(goalPct))}%</span>
          </Ring>
          <div>
            <p className="text-sm text-muted">Daily goal</p>
            <p className="text-xl font-semibold tabular-nums">
              {s.todayXp}
              <span className="text-sm font-normal text-muted"> / {s.dailyGoalXp} XP</span>
            </p>
          </div>
        </Card>
        <StatCard icon={GalleryVerticalEnd} tone="sky" label="Cards due" value={s.dueCards} hint={s.dueCards ? "Review now →" : "All caught up"} to="/app/review" />
        <StatCard icon={GraduationCap} tone="brand" label={`Level ${s.level.level}`} value={`${s.xp} XP`} to="/app/progress">
          <Progress value={(s.level.into / s.level.next) * 100} className="mt-3 h-1.5" />
        </StatCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayPlan data={data} />

          <Card>
            <CardHeader
              icon={ClipboardCheck}
              title="Upcoming work"
              description="Assignments due in the next 3 weeks"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/classes">All classes</Link>
                </Button>
              }
            />
            <CardContent className="pt-2">
              {data.overdue.length || data.upcoming.length ? (
                <ul className="divide-y divide-border">
                  {[...data.overdue.map((a) => ({ ...a, overdue: true })), ...data.upcoming].map((a) => (
                    <li key={a.id}>
                      <Link to={`/app/assignments/${a.id}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                        <ClassDot theme={a.classroom?.theme} className="size-2.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.title}</p>
                          <p className="truncate text-xs text-muted">{a.classroom?.name}</p>
                        </div>
                        <Badge tone={a.overdue ? "danger" : new Date(a.dueAt) - Date.now() < 86_400_000 ? "warning" : "neutral"}>{a.overdue ? "Missing" : dueLabel(a.dueAt)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" /> You're all caught up on assignments.
                </div>
              )}
            </CardContent>
          </Card>

          {data.recentGrades.length ? (
            <Card>
              <CardHeader icon={GraduationCap} title="Recent grades" />
              <CardContent className="pt-2">
                <ul className="divide-y divide-border">
                  {data.recentGrades.map((g) => {
                    const p = g.assignment.points ? (g.score / g.assignment.points) * 100 : null;
                    return (
                      <li key={g.id}>
                        <Link to={`/app/assignments/${g.assignment.id}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{g.assignment.title}</p>
                            <p className="text-xs text-muted">
                              {g.assignment.classroom?.name} · {fromNow(g.gradedAt)}
                            </p>
                          </div>
                          <span className="text-right">
                            <span className="block text-sm font-semibold tabular-nums">
                              {g.score}/{g.assignment.points}
                            </span>
                            <span className={cn("text-xs tabular-nums", p >= 80 ? "text-emerald-600 dark:text-emerald-400" : p >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>{pct(p)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card className="ai-surface">
            <CardContent className="p-5">
              <p className="text-sm font-semibold">Stuck on something?</p>
              <p className="mt-1 text-sm text-muted">Ask the tutor — or snap a photo of the problem. It knows your class notes.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link to="/app/tutor?new=1">
                    <Bot /> Ask the tutor
                  </Link>
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/app/studio">
                    <Sparkles /> Study Studio
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <SessionsCard sessions={data.sessions} />

          <Card>
            <CardHeader icon={Target} title="Weak spots" description="From your quiz answers" />
            <CardContent className="pt-3">
              {data.weakConcepts.length ? (
                <>
                  <ul className="space-y-3">
                    {data.weakConcepts.map((c) => (
                      <li key={c.concept}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="truncate font-medium">{c.concept}</span>
                          <span className="tabular-nums text-muted">{pct(c.accuracy * 100)}</span>
                        </div>
                        <Progress value={c.accuracy * 100} className="h-1.5" barClassName={c.accuracy < 0.5 ? "bg-rose-500" : "bg-amber-500"} />
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-4 w-full" variant="secondary" size="sm" loading={adaptive.isPending} onClick={() => adaptive.mutate()}>
                    <Target /> Practice these
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Take a <Link to="/app/quizzes" className="font-medium text-fg underline decoration-brand-500 underline-offset-4">quiz</Link> and we'll track which concepts need work.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              icon={School}
              title="My classes"
              action={
                <Button variant="ghost" size="xs" asChild>
                  <Link to="/app/classes?join=1">
                    <Plus /> Join
                  </Link>
                </Button>
              }
            />
            <CardContent className="pt-2">
              {data.classes.length ? (
                <ul className="-mx-2">
                  {data.classes.map((c) => (
                    <li key={c.id}>
                      <Link to={`/app/classes/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-subtle">
                        <ClassDot theme={c.theme} className="size-2.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted">{c.teacher?.name}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Ask your teacher for a class code to join.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

function TeacherDashboard({ data }) {
  const { user } = useAuth();
  const s = data.stats;
  const [copied, setCopied] = useState(null);
  const copy = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    toast.success(`Class code ${code} copied`);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div>
      <Greeting name={user?.name}>
        {s.toGrade ? `${plural(s.toGrade, "submission")} waiting for feedback` : "Your grading queue is clear"} · {plural(s.students, "student")} across {plural(s.classes, "class", "classes")}
      </Greeting>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={School} tone="brand" label="Classes" value={s.classes} to="/app/classes" />
        <StatCard icon={Users} tone="sky" label="Students" value={s.students} />
        <StatCard icon={ClipboardCheck} tone={s.toGrade ? "orange" : "emerald"} label="To grade" value={s.toGrade} hint={s.toGrade ? "AI can draft these" : "All caught up"} />
        <StatCard icon={ListChecks} tone="violet" label="Quiz attempts" value={s.quizAttemptsThisWeek} hint="This week" to="/app/quizzes" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader icon={ClipboardCheck} title="Grading queue" description="Oldest first — open one to grade with an AI draft" />
            <CardContent className="pt-2">
              {data.toGrade.length ? (
                <ul className="divide-y divide-border">
                  {data.toGrade.map((sub) => (
                    <li key={sub.id}>
                      <Link to={`/app/assignments/${sub.assignment.id}?grade=${sub.studentId}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                        <Avatar name={sub.student.name} src={sub.student.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{sub.student.name}</p>
                          <p className="flex min-w-0 items-center gap-2 text-xs text-muted">
                            <ClassChip classroom={sub.assignment.classroom} link={false} />
                            <span className="truncate">· {sub.assignment.title}</span>
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted">
                          {sub.late ? <Badge tone="warning">Late</Badge> : null}
                          <p className="mt-0.5">{fromNow(sub.submittedAt)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={CheckCircle2} title="Nothing to grade" description="New submissions will appear here." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={CalendarClock} title="Upcoming deadlines" description="Next 2 weeks" />
            <CardContent className="pt-2">
              {data.upcoming.length ? (
                <ul className="divide-y divide-border">
                  {data.upcoming.map((a) => (
                    <li key={a.id}>
                      <Link to={`/app/assignments/${a.id}`} className="flex items-center gap-4 py-3 transition hover:opacity-80">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.title}</p>
                          <p className="flex items-center gap-2 text-xs text-muted">
                            <ClassChip classroom={a.classroom} link={false} /> · {dueLabel(a.dueAt)}
                          </p>
                        </div>
                        <div className="w-28 shrink-0">
                          <p className="mb-1 text-right text-xs tabular-nums text-muted">
                            {a.submitted}/{a.students} in
                          </p>
                          <Progress value={a.students ? (a.submitted / a.students) * 100 : 0} className="h-1.5" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted">No deadlines in the next two weeks.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="ai-surface">
            <CardContent className="p-5">
              <p className="text-sm font-semibold">AI teaching tools</p>
              <div className="mt-3 grid gap-2">
                {[
                  { to: "/app/tools/lesson", icon: NotebookPen, label: "Plan a lesson" },
                  { to: "/app/tools/paper", icon: FileQuestion, label: "Generate a question paper" },
                  { to: "/app/tools/answer-check", icon: ClipboardCheck, label: "Check an answer sheet" },
                ].map(({ to, icon: Icon, label }) => (
                  <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium transition hover:border-border-strong">
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1">{label}</span>
                    <ArrowRight className="size-3.5 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <SessionsCard sessions={data.sessions} />

          <Card>
            <CardHeader
              icon={School}
              title="Your classes"
              action={
                <Button variant="ghost" size="xs" asChild>
                  <Link to="/app/classes?new=1">
                    <Plus /> New
                  </Link>
                </Button>
              }
            />
            <CardContent className="pt-2">
              {data.classes.length ? (
                <ul className="-mx-2">
                  {data.classes.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-subtle">
                      <Link to={`/app/classes/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <ClassDot theme={c.theme} className="size-2.5" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block text-xs text-muted">{plural(c._count.members, "student")}</span>
                        </span>
                      </Link>
                      <button onClick={() => copy(c.code)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs text-muted transition hover:bg-surface hover:text-fg" aria-label={`Copy code ${c.code}`}>
                        {c.code}
                        {copied === c.code ? <CheckCircle2 className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      </button>
                      <Link to={`/app/classes/${c.id}/insights`} className="rounded-md p-1 text-faint transition hover:text-fg" aria-label={`Insights for ${c.name}`}>
                        <LineChart className="size-4" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={School}
                  title="Create your first class"
                  description="Students join with a 7-letter code."
                  action={
                    <Button size="sm" asChild>
                      <Link to="/app/classes?new=1">New class</Link>
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

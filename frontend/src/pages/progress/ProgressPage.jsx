import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Award, CalendarDays, Flame, GraduationCap, ListChecks, Target, TrendingUp, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { cn, pct, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Progress, Ring, Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";
import { StatCard } from "@/components/StatCard";

const TYPE_LABELS = {
  review: "Flashcard reviews",
  quiz: "Quizzes",
  submit: "Assignments",
  focus: "Focus sessions",
  tutor: "AI Tutor",
  studio: "Study Studio",
  game: "Games",
  roadmap: "Roadmaps",
};

const LEVELS = [
  "bg-subtle",
  "bg-brand-200 dark:bg-brand-900/70",
  "bg-brand-300 dark:bg-brand-700",
  "bg-brand-500 dark:bg-brand-500",
  "bg-orange-500 dark:bg-orange-400",
];

function intensity(xp, max) {
  if (!xp) return 0;
  const r = xp / Math.max(max, 1);
  return r > 0.75 ? 4 : r > 0.45 ? 3 : r > 0.2 ? 2 : 1;
}

/** GitHub-style calendar: columns are weeks (Mon-first), rows are weekdays. */
function Heatmap({ days }) {
  const { weeks, max, months } = useMemo(() => {
    if (!days.length) return { weeks: [], max: 0, months: [] };
    const byDay = new Map(days.map((d) => [d.day, d]));
    const first = startOfWeek(parseISO(days[0].day), { weekStartsOn: 1 });
    const last = parseISO(days[days.length - 1].day);
    const cols = [];
    const monthLabels = [];
    for (let w = first; w <= last; w = addDays(w, 7)) {
      const col = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        const key = format(d, "yyyy-MM-dd");
        col.push(d > last ? null : (byDay.get(key) ?? { day: key, xp: 0, focusMinutes: 0, outside: true }));
      }
      const firstOfMonth = col.find((c) => c && c.day.endsWith("-01"));
      monthLabels.push(firstOfMonth ? format(parseISO(firstOfMonth.day), "MMM") : "");
      cols.push(col);
    }
    return { weeks: cols, max: Math.max(...days.map((d) => d.xp)), months: monthLabels };
  }, [days]);

  return (
    <div className="scroll-thin overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        <div className="ml-7 flex gap-1 text-[10px] text-faint">
          {months.map((m, i) => (
            <span key={i} className="w-3 overflow-visible whitespace-nowrap">
              {m}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <div className="mr-1 flex w-6 flex-col gap-1 text-[10px] text-faint">
            {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
              <span key={i} className="h-3 leading-3">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {col.map((c, di) =>
                c ? (
                  <Tip key={di} content={`${format(parseISO(c.day), "EEE d MMM")} · ${c.xp} XP${c.focusMinutes ? ` · ${c.focusMinutes} min focus` : ""}`}>
                    <span className={cn("size-3 rounded-[3px]", c.outside ? "bg-transparent" : LEVELS[intensity(c.xp, max)])} />
                  </Tip>
                ) : (
                  <span key={di} className="size-3" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="ml-7 mt-2 flex items-center gap-1.5 text-[10px] text-faint">
          Less
          {LEVELS.map((l, i) => (
            <span key={i} className={cn("size-3 rounded-[3px]", l)} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

function Mastery() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["mastery"], queryFn: () => api.get("/mastery") });
  const adaptive = useMutation({
    mutationFn: () => api.post("/quizzes/adaptive", { count: 8 }),
    onSuccess: ({ quiz }) => navigate(`/app/quizzes/${quiz.id}`),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data?.concepts?.length) {
    return (
      <EmptyState
        icon={Target}
        title="No mastery data yet"
        description="Every quiz answer is tagged with the concept it tests. Take a quiz and your strengths and weak spots will show up here."
        action={
          <Button asChild>
            <Link to="/app/quizzes">Take a quiz</Link>
          </Button>
        }
      />
    );
  }

  const tracked = [...data.concepts].sort((a, b) => b.total - a.total).slice(0, 12);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          icon={Target}
          title="Needs work"
          description="Lowest accuracy first"
          action={
            data.weak.length ? (
              <Button size="sm" onClick={() => adaptive.mutate()} loading={adaptive.isPending}>
                <Zap /> Practice these
              </Button>
            ) : null
          }
        />
        <CardContent className="pt-3">
          {data.weak.length ? (
            <ul className="space-y-3.5">
              {data.weak.map((c) => (
                <li key={c.concept}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{c.concept}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {c.correct}/{c.total} · {pct(c.accuracy * 100)}
                    </span>
                  </div>
                  <Progress value={c.accuracy * 100} className="h-1.5" barClassName={c.accuracy < 0.5 ? "bg-rose-500" : "bg-amber-500"} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing below 75% — nicely done. Keep reviewing to stay sharp.</p>
          )}
          {adaptive.isPending ? <p className="mt-3 text-xs text-muted">Writing a quiz that targets these concepts…</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader icon={Award} title="Concepts you've practised" description={plural(data.concepts.length, "concept")} />
        <CardContent className="pt-3">
          {data.strong.length ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {data.strong.map((c) => (
                <Badge key={c.concept} tone="success">
                  {c.concept}
                </Badge>
              ))}
            </div>
          ) : null}
          <ul className="space-y-2.5">
            {tracked.map((c) => (
              <li key={c.concept} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.concept}</span>
                <span className="w-24 shrink-0">
                  <Progress value={c.accuracy * 100} className="h-1.5" barClassName={c.accuracy >= 0.85 ? "bg-emerald-500" : c.accuracy >= 0.5 ? "bg-brand-500" : "bg-rose-500"} />
                </span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{Math.round(c.accuracy * 100)}%</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProgressPage() {
  const { data, isLoading } = useQuery({ queryKey: ["activity", "summary", 182], queryFn: () => api.get("/activity/summary?days=182") });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const goalPct = data.dailyGoalXp ? (data.todayXp / data.dailyGoalXp) * 100 : 0;
  const types = Object.entries(data.byType).sort((a, b) => b[1] - a[1]);
  const typeMax = types[0]?.[1] || 1;

  return (
    <div>
      <PageHeader title="Progress" description="Your learning, in numbers. Small daily sessions beat long cramming — the streak is there to help." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 sm:col-span-2">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-500 text-[#16140f]">
              <GraduationCap className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">Level {data.level.level}</p>
              <p className="text-2xl font-semibold tabular-nums">{data.xp.toLocaleString()} XP</p>
            </div>
          </div>
          <Progress value={(data.level.into / data.level.next) * 100} className="mt-4" />
          <p className="mt-1.5 text-xs text-muted">
            {data.level.next - data.level.into} XP to level {data.level.level + 1}
          </p>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <Ring value={goalPct} size={68} stroke={7}>
            <span className="text-xs font-semibold tabular-nums">{Math.min(100, Math.round(goalPct))}%</span>
          </Ring>
          <div>
            <p className="text-sm text-muted">Today</p>
            <p className="text-xl font-semibold tabular-nums">
              {data.todayXp}
              <span className="text-sm font-normal text-muted"> / {data.dailyGoalXp}</span>
            </p>
            <Link to="/app/settings#preferences" className="text-xs text-muted underline-offset-2 hover:underline">
              Change goal
            </Link>
          </div>
        </Card>
        <StatCard icon={Flame} tone="orange" label="Streak" value={plural(data.streak, "day")} hint={`Longest: ${plural(data.longestStreak, "day")}`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={TrendingUp} tone="brand" label="This week" value={`${data.weekXp} XP`} />
        <StatCard icon={CalendarDays} tone="sky" label="Active days" value={data.activeDays} hint="Last 6 months" />
        <StatCard icon={ListChecks} tone="violet" label="Focus this week" value={`${data.weekFocusMinutes} min`} to="/app/focus" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader icon={CalendarDays} title="Activity" description="XP earned per day over the last 6 months" />
          <CardContent className="pt-4">
            <Heatmap days={data.days} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={Zap} title="Where your XP comes from" description="Last 6 months" />
          <CardContent className="pt-3">
            {types.length ? (
              <ul className="space-y-3">
                {types.map(([type, xp]) => (
                  <li key={type}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{TYPE_LABELS[type] ?? type}</span>
                      <span className="tabular-nums text-muted">{xp} XP</span>
                    </div>
                    <Progress value={(xp / typeMax) * 100} className="h-1.5" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Review flashcards, take a quiz or run a focus session to start earning XP.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-4 mt-10 text-lg font-semibold tracking-tight">Concept mastery</h2>
      <Mastery />
    </div>
  );
}

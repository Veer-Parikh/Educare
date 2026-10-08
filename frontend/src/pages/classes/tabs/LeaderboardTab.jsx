import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Flame, Medal, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";

const MEDAL = ["text-amber-500", "text-slate-400", "text-orange-700"];

export default function LeaderboardTab({ classroom }) {
  const { user } = useAuth();
  const [period, setPeriod] = useState("week");
  const { data, isLoading } = useQuery({
    queryKey: ["class", classroom.id, "leaderboard", period],
    queryFn: () => api.get(`/classes/${classroom.id}/leaderboard?period=${period}`),
  });
  const rows = data?.leaderboard ?? [];
  const top = rows[0]?.xp || 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-muted">XP comes from reviewing flashcards, quizzes, focus sessions, submitting work and studying with AI. Consistency beats cramming.</p>
        <Segmented
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "This week" },
            { value: "month", label: "30 days" },
            { value: "all", label: "All time" },
          ]}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !rows.length ? (
        <EmptyState icon={Trophy} title="No one on the board yet" description="Students appear here once they join and start earning XP." />
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <ol>
              {rows.map((r) => {
                const me = r.user.id === user?.id;
                return (
                  <li key={r.user.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", me && "bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30")}>
                    <span className="grid w-7 place-items-center text-sm font-semibold tabular-nums text-muted">
                      {r.rank <= 3 && r.xp > 0 ? r.rank === 1 ? <Crown className={cn("size-5", MEDAL[0])} /> : <Medal className={cn("size-5", MEDAL[r.rank - 1])} /> : r.rank}
                    </span>
                    <Avatar name={r.user.name} src={r.user.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.user.name}
                        {me ? <span className="ml-1.5 text-xs text-muted">(you)</span> : null}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
                        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${(r.xp / top) * 100}%` }} />
                      </div>
                    </div>
                    {r.streak ? (
                      <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                        <Flame className="size-3.5 text-orange-500" /> {r.streak}
                      </span>
                    ) : null}
                    <span className="w-16 text-right text-sm font-semibold tabular-nums">{r.xp} XP</span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}
      {data?.me && data.me.rank > rows.length ? <p className="mt-3 text-center text-sm text-muted">You're #{data.me.rank} with {data.me.xp} XP.</p> : null}
    </div>
  );
}

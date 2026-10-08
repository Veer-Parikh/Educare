import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Bot, Check, CircleCheckBig, Clock, Ellipsis, ExternalLink, GalleryVerticalEnd, Hammer, ListChecks, Route, Search, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { api, toForm } from "@/lib/api";
import { burst, useCelebrate } from "@/lib/rewards";
import { cn, fromNow, plural, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { AiWorking } from "@/components/AiWorking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Menu, MenuContent, MenuItem, MenuTrigger, Tip } from "@/components/ui/menu";
import { EmptyState, Ring, Skeleton } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { RESOURCE_TYPES, levelInfo, resourceHref } from "./shared";

const topicOf = (m) => `${m.title}: ${(m.topics ?? []).join(", ")}`.slice(0, 200);

const scrollToWeek = (week) => document.getElementById(`week-${week}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Resource({ r }) {
  const type = RESOURCE_TYPES[r.type] ?? RESOURCE_TYPES.article;
  const Icon = type.icon;
  const { href, search } = resourceHref(r);
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong hover:bg-surface-2"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted group-hover:text-fg">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug">{r.title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {type.label}
            {r.note ? ` · ${r.note}` : ""}
          </span>
        </span>
        {search ? (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] text-faint group-hover:text-muted">
            <Search className="size-3.5" />
            <span className="sr-only sm:not-sr-only">{search}</span>
          </span>
        ) : (
          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-faint group-hover:text-muted" aria-label="Opens in a new tab" />
        )}
      </a>
    </li>
  );
}

function Milestone({ m, isNext, isLast, onToggle, onAi, aiBusy, aiKind, navigate }) {
  const generating = Boolean(aiKind);
  return (
    <li id={`week-${m.week}`} className="relative scroll-mt-24 pl-12">
      {!isLast ? (
        <span aria-hidden="true" className={cn("absolute left-[15px] top-[3.25rem] -bottom-[2.25rem] w-0.5 rounded-full", m.done ? "bg-emerald-400 dark:bg-emerald-500/60" : "bg-border")} />
      ) : null}
      <button
        type="button"
        role="checkbox"
        aria-checked={m.done}
        aria-label={`Week ${m.week}: ${m.title} — ${m.done ? "completed" : "mark complete"}`}
        onClick={() => onToggle(m, !m.done)}
        className={cn(
          "absolute left-0 top-5 grid size-8 place-items-center rounded-full border-2 text-xs font-semibold tabular-nums transition",
          m.done
            ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
            : isNext
              ? "border-brand-500 bg-surface text-fg shadow-[0_0_0_4px] shadow-brand-500/20 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              : "border-border-strong bg-surface text-muted hover:border-emerald-400 hover:text-fg",
        )}
      >
        {m.done ? (
          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        ) : (
          m.week
        )}
      </button>

      <Card className={cn("p-5 sm:p-6", isNext && "border-brand-300 ring-2 ring-brand-500/15 dark:border-brand-500/40", m.done && "bg-surface-2/50 shadow-none")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">Week {m.week}</span>
          {isNext ? <Badge tone="brand">Up next</Badge> : null}
          {m.done ? (
            <Badge tone="success">
              <CircleCheckBig /> Done{m.completedAt ? ` ${fromNow(m.completedAt)}` : ""}
            </Badge>
          ) : null}
        </div>
        <h3 className={cn("mt-1.5 text-base font-semibold tracking-tight sm:text-[17px]", m.done && "text-muted")}>{m.title}</h3>
        {m.description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{m.description}</p> : null}

        {m.topics?.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Topics">
            {m.topics.map((t) => (
              <li key={t} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg">
                {t}
              </li>
            ))}
          </ul>
        ) : null}

        {m.resources?.length ? (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold text-muted">Resources</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {m.resources.map((r, i) => (
                <Resource key={`${r.title}-${i}`} r={r} />
              ))}
            </ul>
          </div>
        ) : null}

        {m.project ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-4 py-3 dark:border-brand-500/30 dark:bg-brand-500/5">
            <Hammer className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-900 dark:text-brand-200">Checkpoint project</p>
              <p className="mt-0.5 text-sm leading-relaxed">{m.project}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 border-t border-border pt-4">
          {generating ? (
            <AiWorking
              compact
              title={aiKind === "quiz" ? `Writing a quiz on ${m.title}…` : `Making flashcards for ${m.title}…`}
              steps={aiKind === "quiz" ? ["Picking what to test", "Writing questions", "Checking answers"] : ["Picking the key ideas", "Writing cards", "Scheduling reviews"]}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-faint">Practice this week:</span>
              <Button size="sm" variant="secondary" disabled={aiBusy} onClick={() => onAi(m, "quiz")}>
                <ListChecks /> Quiz me
              </Button>
              <Button size="sm" variant="secondary" disabled={aiBusy} onClick={() => onAi(m, "deck")}>
                <GalleryVerticalEnd /> Flashcards
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/app/tutor?new=1&prompt=${encodeURIComponent("Help me learn: " + m.title)}`)}>
                <Bot /> Ask tutor
              </Button>
              {!m.done ? (
                <Button size="sm" variant="ghost" className="sm:ml-auto" onClick={() => onToggle(m, true)}>
                  <Check /> Mark done
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}

export default function RoadmapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const celebrate = useCelebrate();
  const key = useMemo(() => ["roadmap", id], [id]);

  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/roadmaps/${id}`) });
  const roadmap = q.data?.roadmap;
  const milestones = roadmap?.milestones ?? [];
  const doneCount = milestones.filter((m) => m.done).length;
  const pctDone = milestones.length ? Math.round((doneCount / milestones.length) * 100) : 0;
  const next = milestones.find((m) => !m.done);
  const toggling = useIsMutating({ mutationKey: ["roadmap-toggle", id] });

  const toggle = useMutation({
    mutationKey: ["roadmap-toggle", id],
    mutationFn: ({ m, done }) => api.patch(`/roadmaps/${id}/milestones/${m.id}`, { done }),
    onMutate: async ({ m, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old) => (old ? { roadmap: { ...old.roadmap, milestones: old.roadmap.milestones.map((x) => (x.id === m.id ? { ...x, done } : x)) } } : old));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err?.message || "Couldn't update that milestone.");
    },
    onSuccess: ({ roadmap: r, reward }, { done }) => {
      // Don't clobber a newer optimistic toggle that's still in flight.
      if (qc.isMutating({ mutationKey: ["roadmap-toggle", id] }) <= 1) qc.setQueryData(key, { roadmap: r });
      qc.invalidateQueries({ queryKey: ["roadmaps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (reward) celebrate(reward, "milestone");
      if (done && r.milestones.every((x) => x.done)) {
        burst(1.4);
        toast.success("Roadmap complete — brilliant work!");
      }
    },
  });

  const ai = useMutation({
    mutationFn: ({ m, kind }) =>
      kind === "quiz"
        ? api.upload("/quizzes/generate", toForm({ source: "topic", topic: topicOf(m), count: 6, title: `Week ${m.week}: ${m.title}`.slice(0, 160) }))
        : api.upload("/decks/generate", toForm({ source: "topic", topic: topicOf(m), count: 12, title: m.title.slice(0, 120) })),
    onSuccess: (res, { kind }) => {
      if (kind === "quiz") {
        qc.invalidateQueries({ queryKey: ["quizzes"] });
        toast.success("Your quiz is ready");
        navigate(`/app/quizzes/${res.quiz.id}`);
      } else {
        qc.invalidateQueries({ queryKey: ["decks"] });
        qc.invalidateQueries({ queryKey: ["review"] });
        toast.success(`Deck ready with ${plural(res.added, "card")}`);
        navigate(`/app/flashcards/${res.deck.id}`);
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/roadmaps/${id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["roadmaps"] });
      toast.success("Roadmap deleted");
      navigate("/app/roadmaps");
    },
  });

  if (q.isLoading) {
    return (
      <div>
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-2 h-8 w-80 max-w-full" />
        <Skeleton className="mb-8 h-4 w-full max-w-xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <div className="mt-8 space-y-4 pl-12">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (q.isError || !roadmap) {
    return (
      <div>
        <PageHeader title="Roadmap not found" back={{ to: "/app/roadmaps", label: "Roadmaps" }} />
        <EmptyState
          icon={Route}
          title={q.error?.status === 404 || q.error?.status === 403 ? "This roadmap doesn't exist or isn't yours" : "Couldn't load this roadmap"}
          description={q.error?.message}
          action={
            <Button asChild variant="secondary">
              <Link to="/app/roadmaps">Back to roadmaps</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const level = levelInfo(roadmap.level);
  const onDelete = async () => {
    if (await confirm({ title: "Delete this roadmap?", description: `“${roadmap.goal}” and its progress will be removed.`, confirmLabel: "Delete roadmap", danger: true })) remove.mutate();
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/app/roadmaps", label: "Roadmaps" }}
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={level.tone}>{level.label}</Badge>
            <Badge>{plural(roadmap.weeks, "week")}</Badge>
            <Badge>
              <Clock /> {roadmap.hoursPerWeek} h/week
            </Badge>
          </div>
        }
        title={roadmap.goal}
        description={roadmap.summary || undefined}
        actions={
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Roadmap options">
                <Ellipsis />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={Bot} onSelect={() => navigate(`/app/tutor?new=1&prompt=${encodeURIComponent(`I'm following a roadmap to: ${roadmap.goal}. Help me stay on track.`)}`)}>
                Talk it through with the tutor
              </MenuItem>
              <MenuItem icon={Trash2} danger onSelect={onDelete}>
                Delete roadmap
              </MenuItem>
            </MenuContent>
          </Menu>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="timeline-h" className="order-2 lg:order-1">
          <h2 id="timeline-h" className="sr-only">
            Week-by-week plan
          </h2>
          <ol className="space-y-4">
            {milestones.map((m, i) => (
              <Milestone
                key={m.id}
                m={m}
                isNext={next?.id === m.id}
                isLast={i === milestones.length - 1}
                onToggle={(mm, done) => toggle.mutate({ m: mm, done })}
                onAi={(mm, kind) => !ai.isPending && ai.mutate({ m: mm, kind })}
                aiBusy={ai.isPending}
                aiKind={ai.isPending && ai.variables?.m.id === m.id ? ai.variables.kind : null}
                navigate={navigate}
              />
            ))}
          </ol>
        </section>

        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-24">
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <Ring value={pctDone} size={84} stroke={8} barClassName={pctDone === 100 ? "text-emerald-500" : "text-brand-500"}>
                  <span className="text-lg font-semibold tabular-nums">{pctDone}%</span>
                </Ring>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {doneCount} of {plural(milestones.length, "week")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{toggling ? "Saving…" : `Started ${shortDate(roadmap.createdAt)}`}</p>
                  <p className="mt-0.5 text-xs text-muted">≈ {roadmap.weeks * roadmap.hoursPerWeek} hours in total</p>
                </div>
              </div>

              <div className="mt-5 flex gap-1" aria-label="Weeks">
                {milestones.map((m) => (
                  <Tip key={m.id} content={`Week ${m.week}: ${m.title}`}>
                    <button
                      type="button"
                      onClick={() => scrollToWeek(m.week)}
                      aria-label={`Jump to week ${m.week}${m.done ? " (done)" : ""}`}
                      className={cn(
                        "h-2 min-w-0 flex-1 rounded-full transition hover:opacity-80",
                        m.done ? "bg-emerald-500" : next?.id === m.id ? "bg-brand-500" : "bg-subtle ring-1 ring-inset ring-border",
                      )}
                    />
                  </Tip>
                ))}
              </div>

              <div className="mt-5 border-t border-border pt-4">
                {next ? (
                  <>
                    <p className="text-xs font-medium text-muted">Up next · Week {next.week}</p>
                    <p className="mt-1 text-sm font-semibold leading-snug">{next.title}</p>
                    <Button size="sm" variant="soft" className="mt-3 w-full" onClick={() => scrollToWeek(next.week)}>
                      Go to week {next.week}
                    </Button>
                  </>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Trophy className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Roadmap complete</p>
                      <p className="mt-0.5 text-xs text-muted">Lock it in with a quiz, or plan what's next.</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}

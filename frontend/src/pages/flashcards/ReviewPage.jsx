import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarClock, CircleCheckBig, Clock, GalleryVerticalEnd, Lightbulb, PartyPopper, Repeat, Sparkles, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { burst, useCelebrate } from "@/lib/rewards";
import { cn, minutes, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Kbd, Progress, Skeleton } from "@/components/ui/misc";
import { CARD_STATES, ReviewForecast } from "./shared";

const RATINGS = [
  {
    value: 1,
    label: "Again",
    cls: "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20",
    bar: "bg-rose-500 dark:bg-rose-400",
  },
  {
    value: 2,
    label: "Hard",
    cls: "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20",
    bar: "bg-amber-500 dark:bg-amber-400",
  },
  {
    value: 3,
    label: "Good",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20",
    bar: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    value: 4,
    label: "Easy",
    cls: "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20",
    bar: "bg-sky-500 dark:bg-sky-400",
  },
];

const EMPTY_REWARD = { xp: 0, streak: 0, leveled: false };

/** Short prompts read best centered; longer, structured ones left-aligned. */
const isShort = (s = "") => s.length < 160 && !s.includes("\n");

export default function ReviewPage() {
  const [params] = useSearchParams();
  const deckId = params.get("deck") || "";
  // Remount per deck so a new session starts cleanly.
  return <ReviewSession key={deckId} deckId={deckId} />;
}

function ReviewSession({ deckId }) {
  const qc = useQueryClient();
  const celebrate = useCelebrate();

  const q = useQuery({
    queryKey: ["review", "queue", deckId || "all"],
    queryFn: () => api.get(`/review/queue?limit=50${deckId ? `&deckId=${deckId}` : ""}`),
    // The session is a snapshot; never swap cards out from under the learner.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const decks = useQuery({ queryKey: ["decks"], queryFn: () => api.get("/decks") });
  const deckTitle = deckId ? (decks.data?.decks?.find((d) => d.id === deckId)?.title ?? q.data?.cards?.[0]?.deck?.title) : null;

  const [session, setSession] = useState(null); // { cards, total, startedAt }
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [ratings, setRatings] = useState([]);
  const [reward, setReward] = useState(EMPTY_REWARD);
  const [pending, setPending] = useState(0);
  const [endedAt, setEndedAt] = useState(null);
  const celebrated = useRef(false);

  const start = useCallback((data) => {
    setSession({ cards: data.cards, total: data.total, startedAt: Date.now() });
    setIndex(0);
    setRevealed(false);
    setShowHint(false);
    setRatings([]);
    setReward(EMPTY_REWARD);
    setEndedAt(null);
    celebrated.current = false;
  }, []);

  useEffect(() => {
    if (!session && q.data) start(q.data);
  }, [q.data, session, start]);

  const cards = session?.cards ?? [];
  const card = !endedAt ? cards[index] : undefined;
  const finished = Boolean(session && cards.length && (endedAt || index >= cards.length));

  const review = useMutation({
    mutationFn: ({ id, rating }) => api.post(`/cards/${id}/review`, { rating }),
    onMutate: () => setPending((n) => n + 1),
    onSuccess: ({ reward: r }) => {
      if (r) setReward((prev) => ({ xp: prev.xp + (r.xp ?? 0), streak: r.streak ?? prev.streak, leveled: prev.leveled || Boolean(r.leveledStreak) }));
    },
    onSettled: () => setPending((n) => Math.max(0, n - 1)),
  });

  const rate = useCallback(
    (rating) => {
      if (!card || !revealed) return;
      review.mutate({ id: card.id, rating });
      setRatings((r) => [...r, rating]);
      setIndex((i) => i + 1);
      setRevealed(false);
      setShowHint(false);
      if (index + 1 >= cards.length) setEndedAt(Date.now());
    },
    [card, revealed, index, cards.length, review.mutate],
  );

  // Celebrate once every review in the session has been saved.
  useEffect(() => {
    if (!finished || pending > 0 || celebrated.current || !ratings.length) return;
    celebrated.current = true;
    celebrate({ xp: reward.xp, streak: reward.streak, leveledStreak: reward.leveled }, "review session");
    burst();
    qc.invalidateQueries({ queryKey: ["review"] }); // refreshes this queue too → "N more due"
    qc.invalidateQueries({ queryKey: ["decks"] });
    qc.invalidateQueries({ queryKey: ["deck"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }, [finished, pending, ratings.length, reward, celebrate, qc]);

  // Leaving mid-session: make sure deck counts are fresh elsewhere.
  const ratedRef = useRef(0);
  ratedRef.current = ratings.length;
  useEffect(
    () => () => {
      if (!ratedRef.current) return;
      qc.invalidateQueries({ queryKey: ["decks"] });
      qc.invalidateQueries({ queryKey: ["deck"] });
      qc.invalidateQueries({ queryKey: ["review", "count"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    [qc],
  );

  // Keyboard: Space/Enter flips, 1–4 rate, H toggles the hint.
  useEffect(() => {
    const onKey = (e) => {
      if (!card || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu']")) return;
      if (e.key === " " || e.key === "Enter") {
        if (t?.closest?.("button, a")) return; // let focused controls behave normally
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key));
      } else if ((e.key === "h" || e.key === "H") && card.hint && !revealed) {
        setShowHint((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, rate]);

  const back = deckId ? { to: `/app/flashcards/${deckId}`, label: deckTitle || "Deck" } : { to: "/app/flashcards", label: "Flashcards" };
  const title = deckTitle ? `Review · ${deckTitle}` : "Review";

  // ---- states ----

  if (q.isLoading || (!session && q.data)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={title} back={back} />
        <Skeleton className="mb-4 h-2 w-full rounded-full" />
        <Skeleton className="h-80 rounded-3xl" />
        <Skeleton className="mt-5 h-14 rounded-xl" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={title} back={back} />
        <Card className="p-8 text-center">
          <p className="font-semibold">Couldn't load your review queue</p>
          <p className="mt-1 text-sm text-muted">{q.error?.message}</p>
          <Button className="mt-5" variant="secondary" onClick={() => q.refetch()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={title} back={back} />
        <CaughtUp deckId={deckId} deckTitle={deckTitle} />
      </div>
    );
  }

  if (finished) {
    const remaining = !q.isFetching && q.dataUpdatedAt >= endedAt ? (q.data?.total ?? 0) : null;
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={title} back={back} />
        <SessionComplete
          ratings={ratings}
          seconds={(endedAt - session.startedAt) / 1000}
          xp={reward.xp}
          saving={pending > 0}
          remaining={remaining}
          onMore={() => q.data?.cards?.length && start(q.data)}
          back={back}
        />
      </div>
    );
  }

  const done = index;
  const total = cards.length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={title}
        back={back}
        description={session.total > total ? `${session.total} cards due — this session covers the first ${total}.` : undefined}
        actions={
          ratings.length ? (
            <Button variant="ghost" size="sm" onClick={() => setEndedAt(Date.now())}>
              <X /> End session
            </Button>
          ) : null
        }
      />

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span className="tabular-nums">
            <span className="font-semibold text-fg">{done + 1}</span> / {total}
          </span>
          <span className="inline-flex items-center gap-3 tabular-nums">
            {reward.xp ? (
              <span className="inline-flex items-center gap-1 font-medium text-brand-800 dark:text-brand-300">
                <Sparkles className="size-3.5" /> +{reward.xp} XP
              </span>
            ) : null}
            <span>{plural(total - done, "card")} left</span>
          </span>
        </div>
        <Progress value={(done / total) * 100} />
      </div>

      <FlipCard card={card} revealed={revealed} showHint={showHint} onReveal={() => setRevealed(true)} onToggleHint={() => setShowHint((s) => !s)} />

      <p className="sr-only" aria-live="polite">
        {revealed ? "Answer shown. Rate how well you remembered it, 1 to 4." : `Card ${done + 1} of ${total}.`}
      </p>
      <div className="mt-5">
        {revealed ? (
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => rate(r.value)}
                className={cn("relative flex h-16 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition active:scale-[0.97]", r.cls)}
                aria-label={`${r.label}, next review in ${card.intervals?.[r.value] ?? "—"}`}
              >
                {r.label}
                <span className="mt-0.5 text-xs font-medium tabular-nums opacity-75">{card.intervals?.[String(r.value)] ?? "—"}</span>
                <Kbd className="absolute right-1.5 top-1.5 hidden border-current/20 bg-transparent text-current opacity-60 sm:inline-flex">{r.value}</Kbd>
              </button>
            ))}
          </div>
        ) : (
          <Button size="lg" className="h-16 w-full rounded-xl text-base" onClick={() => setRevealed(true)}>
            Show answer
            <Kbd className="ml-1 hidden border-black/15 bg-black/5 text-[#16140f]/70 sm:inline-flex">Space</Kbd>
          </Button>
        )}
      </div>

      <p className="mt-4 hidden items-center justify-center gap-x-4 gap-y-1 text-xs text-faint sm:flex">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Space</Kbd> flip
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>1</Kbd>–<Kbd>4</Kbd> rate
        </span>
        {card.hint ? (
          <span className="inline-flex items-center gap-1.5">
            <Kbd>H</Kbd> hint
          </span>
        ) : null}
      </p>
    </div>
  );
}

// ---- the card -------------------------------------------------------------------

function FlipCard({ card, revealed, showHint, onReveal, onToggleHint }) {
  const reduce = useReducedMotion();
  const state = CARD_STATES[card.state] ?? CARD_STATES[0];
  const face =
    "col-start-1 row-start-1 flex min-h-[18rem] flex-col rounded-3xl border border-border bg-surface p-5 shadow-lift [backface-visibility:hidden] sm:min-h-[22rem] sm:p-8";

  const meta = (
    <div className="flex items-center justify-between gap-3 text-xs text-muted">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <GalleryVerticalEnd className="size-3.5 shrink-0" />
        <span className="truncate">{card.deck?.title}</span>
      </span>
      <Badge tone={state.tone} className="h-5 px-2 text-[11px]">
        {state.label}
      </Badge>
    </div>
  );

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.id}
          className="[perspective:1600px]"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 48, rotate: 1.5 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -48, rotate: -1.5 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.div
            className={cn("grid [transform-style:preserve-3d]", !revealed && "cursor-pointer")}
            initial={false}
            animate={{ rotateY: revealed ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 24, mass: 0.9 }}
            onClick={() => !revealed && onReveal()}
          >
            {/* front */}
            <div className={face} aria-hidden={revealed} inert={revealed}>
              {meta}
              <div className={cn("flex flex-1 flex-col justify-center py-6", isShort(card.front) && "text-center")}>
                <Markdown className="text-lg font-medium leading-relaxed text-fg sm:text-xl">{card.front}</Markdown>
              </div>
              <div className="flex min-h-8 items-end justify-center">
                {card.hint ? (
                  showHint ? (
                    <p className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-900 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-100">
                      <Lightbulb className="-mt-0.5 mr-1.5 inline size-4" />
                      {card.hint}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleHint();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted transition hover:bg-subtle hover:text-fg"
                    >
                      <Lightbulb className="size-3.5" /> Show hint
                    </button>
                  )
                ) : (
                  <p className="text-xs text-faint">Tap the card or press Space to reveal</p>
                )}
              </div>
            </div>

            {/* back */}
            <div className={cn(face, "[transform:rotateY(180deg)]")} aria-hidden={!revealed} inert={!revealed}>
              {meta}
              <div className="mt-4 border-b border-border pb-4">
                <Markdown className="text-sm leading-relaxed text-muted">{card.front}</Markdown>
              </div>
              <div className={cn("flex flex-1 flex-col justify-center py-6", isShort(card.back) && "text-center")}>
                <Markdown className="text-lg leading-relaxed text-fg sm:text-xl">{card.back}</Markdown>
              </div>
              <p className="text-center text-xs text-faint">How well did you remember it?</p>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---- end states -----------------------------------------------------------------

function RatingBreakdown({ ratings }) {
  const counts = RATINGS.map((r) => ({ ...r, count: ratings.filter((x) => x === r.value).length }));
  const total = ratings.length || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label={counts.map((c) => `${c.label}: ${c.count}`).join(", ")}>
        {counts
          .filter((c) => c.count)
          .map((c) => (
            <div key={c.value} className={cn("h-full first:rounded-l-full last:rounded-r-full", c.bar)} style={{ width: `${(c.count / total) * 100}%` }} />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {counts.map((c) => (
          <li key={c.value} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", c.bar)} />
            {c.label} <span className="font-semibold tabular-nums text-fg">{c.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionComplete({ ratings, seconds, xp, saving, remaining, onMore, back }) {
  const again = ratings.filter((r) => r === 1).length;
  const recall = ratings.length ? Math.round(((ratings.length - again) / ratings.length) * 100) : 0;
  const stats = [
    { label: "Reviewed", value: ratings.length },
    { label: "Again", value: again, hint: again ? "coming back soon" : "no lapses" },
    { label: "Time", value: minutes(Math.round(seconds)) },
    { label: "XP", value: saving ? "…" : `+${xp}` },
  ];

  return (
    <div className="space-y-4">
      <Card className="ai-surface overflow-hidden p-6 text-center sm:p-8">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-500 text-[#16140f] shadow-soft"
        >
          <PartyPopper className="size-6" />
        </motion.span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Session complete</h2>
        <p className="mt-1 text-sm text-muted">
          {plural(ratings.length, "card")} reviewed · {recall}% remembered first time
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface px-3 py-3">
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight">{s.value}</dd>
              {s.hint ? <dd className="text-[11px] text-faint">{s.hint}</dd> : null}
            </div>
          ))}
        </dl>

        <div className="mx-auto mt-6 max-w-md">
          <RatingBreakdown ratings={ratings} />
        </div>

        <div className="mt-7 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button asChild variant="secondary" size="lg">
            <Link to={back.to}>
              <Undo2 /> Back to {back.to === "/app/flashcards" ? "decks" : "deck"}
            </Link>
          </Button>
          {remaining ? (
            <Button size="lg" onClick={onMore}>
              <Repeat /> Review {remaining} more
            </Button>
          ) : remaining === null ? (
            <Button size="lg" variant="soft" disabled loading>
              Checking for more…
            </Button>
          ) : null}
        </div>
      </Card>

      {remaining === 0 ? (
        <Card className="p-5">
          <div className="mb-1 flex items-center gap-2">
            <CalendarClock className="size-4 text-muted" />
            <h3 className="text-sm font-semibold tracking-tight">Coming up</h3>
          </div>
          <ReviewForecast />
        </Card>
      ) : null}
    </div>
  );
}

function CaughtUp({ deckId, deckTitle }) {
  return (
    <div className="space-y-4">
      <Card className="p-6 text-center sm:p-10">
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          <CircleCheckBig className="size-6" />
        </motion.span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">All caught up</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {deckTitle ? `Nothing in “${deckTitle}” is due right now.` : "No cards are due right now."} Each card comes back right before you'd forget it — check the forecast below.
        </p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button asChild variant="secondary">
            <Link to={deckId ? `/app/flashcards/${deckId}` : "/app/flashcards"}>
              <GalleryVerticalEnd /> {deckId ? "Back to deck" : "Browse decks"}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/app/flashcards">
              Make a new deck <ArrowRight />
            </Link>
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <Clock className="size-4 text-muted" />
          <h3 className="text-sm font-semibold tracking-tight">Upcoming reviews</h3>
        </div>
        <ReviewForecast height={88} />
      </Card>
    </div>
  );
}

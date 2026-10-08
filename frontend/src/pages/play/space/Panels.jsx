import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  ListChecks,
  LocateFixed,
  Orbit,
  RefreshCw,
  RotateCcw,
  Rocket,
  Sparkles,
  Target,
  Telescope,
  Trophy,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress, Ring } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";
import { BODIES, PASS_RATIO, PLANETS, localQuestions } from "./planets";

// Dark "space glass" styling — this screen is dark regardless of the app theme.
export const glassBtn = "border border-white/10 bg-white/[0.06] text-white hover:border-white/20 hover:bg-white/[0.12]";
const glassCard = "border border-white/10 bg-[#0b0d14]/85 backdrop-blur-xl";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45";

const withPeriod = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
export const passScore = (total) => Math.ceil(total * PASS_RATIO);

export function IconBtn({ label, onClick, children, pressed, className }) {
  return (
    <Tip content={label}>
      <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} onClick={onClick} className={cn(glassBtn, "backdrop-blur-xl", pressed && "border-brand-500/40 bg-brand-500/15 text-brand-200", className)}>
        {children}
      </Button>
    </Tip>
  );
}

function CloseBtn({ onClick, label = "Close", className }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn("-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white", className)}>
      <X className="size-4" />
    </button>
  );
}

/** A little CSS planet used in chips and headers. */
export function PlanetOrb({ body, className }) {
  const sun = body.id === "sun";
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block shrink-0 rounded-full", className)}
      style={{
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,${sun ? 0.7 : 0.5}), transparent 45%), radial-gradient(circle at 50% 50%, ${body.color} 52%, color-mix(in oklab, ${body.color} 45%, black) 100%)`,
        boxShadow: sun ? `0 0 14px ${body.color}aa` : "inset -2px -3px 6px rgba(0,0,0,0.45)",
      }}
    >
      {body.hasRings ? <span className="absolute left-1/2 top-1/2 h-[32%] w-[165%] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#e4cd9e]/80" /> : null}
    </span>
  );
}

// ---- Nova, the guide --------------------------------------------------------------

function NovaAvatar({ thinking }) {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center">
      {thinking ? <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" /> : null}
      <span className="relative grid size-9 place-items-center rounded-full bg-linear-to-br from-brand-300 via-brand-500 to-orange-500 text-[#16140f] shadow-[0_0_18px_rgba(255,199,0,0.35)]">
        <Sparkles className="size-4" />
      </span>
    </span>
  );
}

export function NovaLine({ text, loading, ai, onMore }) {
  return (
    <div className="flex items-start gap-3">
      <NovaAvatar thinking={loading} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brand-300">
          Nova <span className="font-normal text-white/40">· {ai ? "AI space guide" : "space guide"}</span>
        </p>
        <p aria-live="polite" className="mt-0.5 text-pretty text-sm leading-relaxed text-white/85">
          {loading ? <span className="text-white/50">Scanning the cosmos…</span> : text}
        </p>
      </div>
      {onMore ? (
        <Tip content="Another fact">
          <button type="button" onClick={onMore} disabled={loading} aria-label="Another fact from Nova" className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-40">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
        </Tip>
      ) : null}
    </div>
  );
}

export function GuideBar(props) {
  return (
    <div className={cn(glassCard, "pointer-events-auto w-full max-w-xl rounded-2xl p-3 shadow-2xl")}>
      <NovaLine {...props} />
    </div>
  );
}

// ---- HUD pieces ---------------------------------------------------------------------

export function TitleChip() {
  return (
    <div className={cn(glassCard, "pointer-events-auto flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold")}>
      <Orbit className="size-4 text-brand-400" />
      <span className="truncate">Solar System Explorer</span>
    </div>
  );
}

export function MissionBanner({ body, onLocate, onAbandon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-2xl border border-brand-500/35 bg-[#0b0d14]/85 p-1.5 pr-1.5 shadow-2xl backdrop-blur-xl"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-[#16140f]">
        <Target className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Mission</p>
        <p className="truncate text-sm font-medium leading-tight">
          Explore {body.name} <span className="hidden text-white/50 sm:inline">· score {passScore(3)}/3+</span>
        </p>
      </div>
      <div className="ml-1 flex shrink-0 items-center">
        <Tip content={`Fly to ${body.name}`}>
          <button type="button" onClick={onLocate} aria-label={`Locate ${body.name}`} className="grid size-8 place-items-center rounded-lg text-brand-200 transition hover:bg-white/10">
            <LocateFixed className="size-4" />
          </button>
        </Tip>
        <Tip content="Abandon mission">
          <button type="button" onClick={onAbandon} aria-label="Abandon mission" className="grid size-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </Tip>
      </div>
    </motion.div>
  );
}

export function ProgressMenu({ explored, missions, open, onOpenChange, onSelect }) {
  const ref = useRef(null);
  const count = PLANETS.filter((p) => explored[p.id]).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onOpenChange]);

  const rows = [...PLANETS, BODIES.find((b) => b.id === "sun")];
  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={cn(glassCard, "flex h-10 items-center gap-2.5 rounded-xl pl-2 pr-3 text-sm transition hover:border-white/20")}
      >
        <Ring value={(count / PLANETS.length) * 100} size={26} stroke={3} trackClassName="text-white/15" barClassName="text-brand-400" />
        <span className="font-semibold tabular-nums">
          {count}/{PLANETS.length}
        </span>
        <span className="hidden text-white/55 sm:inline">explored</span>
      </button>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={cn(glassCard, "absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-3 shadow-2xl")}
        >
          <div className="flex items-baseline justify-between px-1">
            <p className="text-sm font-semibold">Exploration log</p>
            <p className="text-xs text-white/50">{missions ? `${missions} mission${missions === 1 ? "" : "s"} done` : "No missions yet"}</p>
          </div>
          <Progress value={(count / PLANETS.length) * 100} className="mt-2.5 h-1.5 bg-white/10" barClassName="bg-brand-400" />
          <ul className="mt-2 space-y-0.5">
            {rows.map((b) => {
              const r = explored[b.id];
              return (
                <li key={b.id}>
                  <button type="button" onClick={() => onSelect(b.id)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition hover:bg-white/[0.07]">
                    <PlanetOrb body={b} className="size-4" />
                    <span className="flex-1 truncate">
                      {b.name}
                      {b.id === "sun" ? <span className="ml-1.5 text-xs text-white/40">bonus</span> : null}
                    </span>
                    {r ? (
                      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", r.score === r.total ? "text-brand-300" : "text-white/75")}>
                        <Check className="size-3.5" />
                        {r.score}/{r.total}
                      </span>
                    ) : (
                      <span className="text-xs text-white/35">Not yet</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.div>
      ) : null}
    </div>
  );
}

export function PlanetStrip({ selectedId, explored, missionId, onSelect }) {
  return (
    <nav aria-label="Planets" className="pointer-events-auto -mx-3 max-w-[calc(100%+1.5rem)] sm:mx-0 sm:max-w-full">
      <ul className="scroll-thin flex gap-1.5 overflow-x-auto px-3 pb-1 sm:px-0">
        {BODIES.map((b) => {
          const active = selectedId === b.id;
          return (
            <li key={b.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                aria-current={active || undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium backdrop-blur-xl transition",
                  active ? "border-brand-400/70 bg-brand-500/20 text-white" : "border-white/10 bg-[#0b0d14]/75 text-white/80 hover:border-white/25 hover:text-white",
                )}
              >
                <PlanetOrb body={b} className="size-3.5" />
                {b.name}
                {missionId === b.id ? <Target className="size-3.5 text-brand-300" aria-label="mission target" /> : null}
                {explored[b.id] ? <Check className="size-3.5 text-brand-300" aria-label="explored" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---- Side panel / bottom sheet ------------------------------------------------------

function Sheet({ label, children }) {
  return (
    <motion.section
      role="dialog"
      aria-label={label}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 28 }}
      transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[64%] flex-col rounded-t-3xl border-t border-white/10 bg-[#0b0d14]/95 text-white shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-auto md:right-4 md:top-[4.25rem] md:max-h-[calc(100%-5.25rem)] md:w-[24rem] md:rounded-2xl md:border"
    >
      <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20 md:hidden" />
      {children}
    </motion.section>
  );
}

function SheetFooter({ children, className }) {
  return <footer className={cn("flex shrink-0 items-center gap-3 border-t border-white/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", className)}>{children}</footer>;
}

export function InfoPanel({ body, best, isTarget, guide, onQuiz, onClose }) {
  return (
    <Sheet label={`${body.name} details`}>
      <header className="flex items-start gap-3 px-5 pt-3 md:pt-5">
        <PlanetOrb body={body} className="mt-0.5 size-11" />
        <div className="min-w-0 flex-1">
          <p className={eyebrow}>{body.kind}</p>
          <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight">{body.name}</h2>
        </div>
        <CloseBtn onClick={onClose} />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
        {isTarget ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2.5 text-sm text-brand-100">
            <Target className="mt-0.5 size-4 shrink-0 text-brand-300" />
            <span>Mission target — score {passScore(3)}/3 or better on the quiz to complete it.</span>
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-2">
          {body.stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/[0.05] px-3 py-2">
              <dt className="text-[11px] text-white/50">{s.label}</dt>
              <dd className="mt-0.5 text-[13px] font-medium leading-snug text-white/90">{s.value}</dd>
            </div>
          ))}
        </dl>

        <h3 className={cn(eyebrow, "mt-5")}>Key facts</h3>
        <ul className="mt-2 space-y-2">
          {body.facts.map((f) => (
            <li key={f} className="flex gap-2.5 text-sm leading-relaxed text-white/85">
              <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-brand-400" />
              {withPeriod(f)}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:hidden">
          <NovaLine {...guide} />
        </div>
      </div>

      <SheetFooter>
        {best ? (
          <span className="text-xs text-white/55">
            Best <span className="font-semibold tabular-nums text-white">{best.score}/{best.total}</span>
          </span>
        ) : null}
        <Button className="flex-1" onClick={onQuiz}>
          <ListChecks /> {best ? "Retake quiz" : "Take quiz"}
        </Button>
      </SheetFooter>
    </Sheet>
  );
}

// ---- Quiz ---------------------------------------------------------------------------

const validQuestion = (q) =>
  q && typeof q.prompt === "string" && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length;

async function loadQuiz(body) {
  try {
    const { questions } = await api.post("/play/quick-quiz", { topic: body.name, facts: body.facts, count: 3 });
    const valid = (questions ?? []).filter(validQuestion).slice(0, 3);
    if (valid.length >= 2) return { questions: valid, source: "ai" };
  } catch {
    /* rate limited / offline / AI down: use the built-in questions */
  }
  return { questions: localQuestions(body), source: "local" };
}

function OrbitLoader() {
  return (
    <span className="relative block size-14" aria-hidden="true">
      <span className="absolute inset-0 rounded-full border border-white/15" />
      <span className="absolute inset-0 animate-spin [animation-duration:1.6s]">
        <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-brand-400 shadow-[0_0_10px_#ffc700]" />
      </span>
      <span className="absolute inset-[18px] rounded-full bg-linear-to-br from-brand-300 to-orange-500" />
    </span>
  );
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function QuizPanel({ body, round, isTarget, onBack, onClose, onFinish, onRetake }) {
  const quiz = useQuery({
    queryKey: ["play", "quick-quiz", body.id, round],
    queryFn: () => loadQuiz(body),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const questions = quiz.data?.questions ?? [];
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [done, setDone] = useState(false);
  const nextRef = useRef(null);

  const q = questions[i];
  const total = questions.length;
  const score = answers.filter(Boolean).length;
  const correct = picked !== null && q && picked === q.answerIndex;

  const choose = (idx) => {
    if (picked !== null || !q) return;
    setPicked(idx);
    setAnswers((a) => [...a, idx === q.answerIndex]);
  };

  const next = () => {
    if (picked === null) return;
    if (i < total - 1) {
      setI(i + 1);
      setPicked(null);
    } else {
      setDone(true);
      onFinish(score, total);
    }
  };

  // Move focus to "Next" after answering so Enter continues.
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  // 1-4 / A-D answer, Enter continues.
  useEffect(() => {
    const onKey = (e) => {
      if (done || !q || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      const n = /^[1-6]$/.test(k) ? Number(k) - 1 : "abcdef".indexOf(k);
      if (picked === null && n >= 0 && n < q.options.length) {
        e.preventDefault();
        choose(n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const need = passScore(total || 3);
  const perfect = done && score === total;
  const passed = done && score >= need;

  return (
    <Sheet label={`${body.name} quiz`}>
      <header className="flex items-center gap-2 px-5 pt-3 md:pt-4">
        <button type="button" onClick={onBack} aria-label="Back to facts" className="-ml-1.5 grid size-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft className="size-4" />
        </button>
        <PlanetOrb body={body} className="size-6" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{body.name} quiz</h2>
        <CloseBtn onClick={onClose} />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
        {quiz.isPending ? (
          <div className="flex flex-col items-center py-10 text-center">
            <OrbitLoader />
            <p className="mt-5 text-sm font-medium">Nova is preparing your questions…</p>
            <p className="mt-1 text-xs text-white/50">Three quick ones about {body.name}</p>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center py-4 text-center">
            <Ring value={total ? (score / total) * 100 : 0} size={108} stroke={8} trackClassName="text-white/10" barClassName="text-brand-400">
              <span className="text-2xl font-semibold tabular-nums">
                {score}/{total}
              </span>
            </Ring>
            <h3 className="mt-4 text-lg font-semibold">{perfect ? "Perfect score!" : passed ? "Great job!" : "Keep exploring"}</h3>
            <p className="mt-1 max-w-xs text-sm text-white/65">
              {perfect
                ? `You're a genuine ${body.name} expert.`
                : isTarget && !passed
                  ? `Score ${need} or more to complete your mission — give it another go.`
                  : passed
                    ? `You know ${body.name} well. Try a perfect run next time?`
                    : `Re-read the facts about ${body.name} and try again.`}
            </p>
          </div>
        ) : q ? (
          <div>
            <p className={eyebrow}>
              Question {i + 1} of {total}
            </p>
            <p className="mt-2 text-pretty text-[15px] font-medium leading-relaxed">{q.prompt}</p>
            <ul className="mt-4 space-y-2">
              {q.options.map((opt, idx) => {
                const state = picked === null ? "idle" : idx === q.answerIndex ? "correct" : idx === picked ? "wrong" : "dim";
                return (
                  <li key={`${idx}-${opt}`}>
                    <button
                      type="button"
                      onClick={() => choose(idx)}
                      disabled={picked !== null}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm leading-snug transition disabled:cursor-default",
                        state === "idle" && "border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]",
                        state === "correct" && "border-emerald-400/60 bg-emerald-500/15",
                        state === "wrong" && "border-rose-400/60 bg-rose-500/15",
                        state === "dim" && "border-white/5 bg-white/[0.02] opacity-55",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold",
                          state === "correct" ? "border-emerald-400/60 bg-emerald-400 text-emerald-950" : state === "wrong" ? "border-rose-400/60 bg-rose-400 text-rose-950" : "border-white/15 text-white/60",
                        )}
                      >
                        {state === "correct" ? <Check className="size-3.5" /> : state === "wrong" ? <X className="size-3.5" /> : LETTERS[idx]}
                      </span>
                      <span className="pt-0.5">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {picked !== null ? (
              <div role="status" className={cn("mt-4 rounded-xl px-3.5 py-3 text-sm", correct ? "bg-emerald-500/10" : "bg-rose-500/10")}>
                <p className={cn("font-semibold", correct ? "text-emerald-300" : "text-rose-300")}>{correct ? "Correct!" : "Not quite."}</p>
                {q.explanation ? (
                  <p className="mt-1 leading-relaxed text-white/75">{q.explanation}</p>
                ) : !correct ? (
                  <p className="mt-1 text-white/75">The answer is “{q.options[q.answerIndex]}”.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!quiz.isPending ? (
        <SheetFooter>
          {done ? (
            <>
              <Button variant="ghost" className={glassBtn} onClick={onRetake}>
                <RotateCcw /> Retake
              </Button>
              <Button className="flex-1" onClick={onClose}>
                <Compass /> Keep exploring
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
                {questions.map((_, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      "h-1.5 w-6 rounded-full transition-colors",
                      idx < answers.length ? (answers[idx] ? "bg-emerald-400" : "bg-rose-400") : idx === i ? "bg-white/50" : "bg-white/15",
                    )}
                  />
                ))}
                <span className="ml-2 hidden text-[11px] text-white/40 sm:inline">{quiz.data?.source === "ai" ? "AI-generated" : "Offline questions"}</span>
              </div>
              <Button ref={nextRef} onClick={next} disabled={picked === null}>
                {i < total - 1 ? "Next" : "Finish"} <ArrowRight />
              </Button>
            </>
          )}
        </SheetFooter>
      ) : null}
    </Sheet>
  );
}

// ---- Full-screen moments ------------------------------------------------------------

function Overlay({ children, label }) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-[#05060a]/55 p-4 backdrop-blur-[3px] sm:items-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.28, ease: [0.2, 0.9, 0.3, 1] }}
        className="relative my-auto w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0d14]/92 p-6 text-white shadow-2xl backdrop-blur-xl sm:p-8"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

const FEATURES = [
  { icon: Telescope, title: "Explore", text: "Tap any world to fly there and read its facts." },
  { icon: ListChecks, title: "Quiz", text: "Three quick questions per planet earn XP." },
  { icon: Target, title: "Missions", text: "Get a random target and ace its quiz." },
];

export function IntroScreen({ exploredCount, started, onExplore, onMission, onClose }) {
  return (
    <Overlay label="Solar System Explorer">
      {started ? <CloseBtn onClick={onClose} className="absolute right-4 top-4 mr-0" /> : null}
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-300">
        <Orbit className="size-3.5" /> Space Explorer
      </span>
      <h1 className="mt-4 text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">Journey through the Solar System</h1>
      <p className="mt-3 text-pretty text-[15px] leading-relaxed text-white/70">
        Fly between the Sun and all eight planets, discover what makes each world unique, and test yourself with quick quizzes. Nova, your AI guide, rides along.
      </p>
      <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:flex-col sm:gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.08] text-brand-300">
              <Icon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/55">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      {exploredCount > 0 ? (
        <div className="mt-5">
          <div className="flex justify-between text-xs text-white/60">
            <span>Your exploration log</span>
            <span className="tabular-nums">
              {exploredCount} of {PLANETS.length} planets
            </span>
          </div>
          <Progress value={(exploredCount / PLANETS.length) * 100} className="mt-1.5 h-1.5 bg-white/10" barClassName="bg-brand-400" />
        </div>
      ) : null}
      <p className="mt-5 text-xs text-white/45">Drag to orbit · scroll or pinch to zoom · Esc closes panels</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button size="lg" variant="ghost" className={glassBtn} onClick={onExplore}>
          <Compass /> Free exploration
        </Button>
        <Button size="lg" onClick={onMission}>
          <Rocket /> Start mission
        </Button>
      </div>
    </Overlay>
  );
}

export function MissionComplete({ body, result, guide, exploredCount, onMission, onExplore }) {
  return (
    <Overlay label="Mission complete">
      <div className="flex flex-col items-center text-center">
        <span className="relative grid size-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/20 [animation-duration:2s]" />
          <span className="relative grid size-20 place-items-center rounded-full bg-linear-to-br from-brand-300 via-brand-500 to-orange-500 text-[#16140f] shadow-[0_0_40px_rgba(255,199,0,0.35)]">
            <Trophy className="size-9" />
          </span>
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Mission complete</p>
        <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">{body.name} explored!</h2>
        <p className="mt-2 text-[15px] text-white/70">
          You scored <span className="font-semibold tabular-nums text-white">{result.score}/{result.total}</span> on the {body.name} quiz.
        </p>
      </div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <NovaLine {...guide} />
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-xs text-white/60">
          <span>Exploration log</span>
          <span className="tabular-nums">
            {exploredCount} of {PLANETS.length} planets
          </span>
        </div>
        <Progress value={(exploredCount / PLANETS.length) * 100} className="mt-1.5 h-1.5 bg-white/10" barClassName="bg-brand-400" />
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button size="lg" variant="ghost" className={glassBtn} onClick={onExplore}>
          <Compass /> Free exploration
        </Button>
        <Button size="lg" onClick={onMission}>
          <Rocket /> New mission
        </Button>
      </div>
    </Overlay>
  );
}

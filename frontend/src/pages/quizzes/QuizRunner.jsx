import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Clock, Send, Timer, X } from "lucide-react";
import { api } from "@/lib/api";
import { burst, useCelebrate } from "@/lib/rewards";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Kbd, Progress } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { AiOverlay, DIFFICULTY_META, TYPE_META, fmtScore } from "./quiz-shared";

const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

const isAnswered = (q, a) => (q.type === "short" ? Boolean(a?.text?.trim()) : Number.isInteger(a?.choiceIndex));

const inTextField = (el) => el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable);

/**
 * Focused quiz-taking mode: one question at a time, navigator, optional countdown.
 * Only renders prompts and options — never answers — even for the quiz owner.
 */
export function QuizRunner({ quiz, onExit, onSubmitted }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const celebrate = useCelebrate();
  const reduceMotion = useReducedMotion();
  const questions = quiz.questions;
  const total = questions.length;

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [answers, setAnswers] = useState({});
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);
  const autoRef = useRef(false);
  const warnedRef = useRef(false);
  const cardRef = useRef(null);
  const textRef = useRef(null);

  const q = questions[index];
  const limitSec = quiz.timeLimitMin ? quiz.timeLimitMin * 60 : null;
  const elapsed = Math.floor((now - startedAt) / 1000);
  const remaining = limitSec != null ? Math.max(0, limitSec - elapsed) : null;
  const answeredCount = questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const unanswered = total - answeredCount;
  const hasShort = questions.some((x) => x.type === "short" && answers[x.id]?.text?.trim());

  const submit = useMutation({
    mutationFn: (body) => api.post(`/quizzes/${quiz.id}/attempts`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["quiz", quiz.id] });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      qc.invalidateQueries({ queryKey: ["mastery"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      const { score, maxScore } = res.attempt;
      const p = maxScore ? (score / maxScore) * 100 : 0;
      celebrate(res.reward, "quiz");
      if (p >= 80) burst(p >= 100 ? 1.4 : 1);
      onSubmitted(res);
    },
  });

  const doSubmit = () => {
    if (submit.isPending || doneRef.current) return;
    doneRef.current = true;
    submit.mutate(
      {
        answers: questions.map((x) =>
          x.type === "short" ? { questionId: x.id, text: answers[x.id]?.text?.trim() || null } : { questionId: x.id, choiceIndex: Number.isInteger(answers[x.id]?.choiceIndex) ? answers[x.id].choiceIndex : null },
        ),
        durationSec: Math.min(Math.round((Date.now() - startedAt) / 1000), 24 * 3600),
      },
      {
        onError: () => {
          doneRef.current = false;
          autoRef.current = false;
        },
      },
    );
  };

  const requestSubmit = async ({ viaKeyboard } = {}) => {
    if (submit.isPending) return;
    if (unanswered > 0) {
      const ok = await confirm({
        title: `Submit with ${unanswered} unanswered?`,
        description: "Unanswered questions score zero. You can go back and answer them first.",
        confirmLabel: "Submit anyway",
        cancelLabel: "Keep going",
      });
      if (!ok) {
        const firstOpen = questions.findIndex((x) => !isAnswered(x, answers[x.id]));
        if (firstOpen >= 0) go(firstOpen);
        return;
      }
    } else if (viaKeyboard) {
      const ok = await confirm({ title: "Submit your answers?", description: "You've answered every question. Answers are revealed once you submit.", confirmLabel: "Submit" });
      if (!ok) return;
    }
    doSubmit();
  };

  const go = (i) => {
    if (i < 0 || i >= total || i === index) return;
    setDir(i > index ? 1 : -1);
    setIndex(i);
  };
  const next = (opts) => (index < total - 1 ? go(index + 1) : requestSubmit(opts));
  const prev = () => go(index - 1);

  const choose = (choiceIndex) => setAnswers((a) => ({ ...a, [q.id]: { choiceIndex } }));
  const setText = (text) => setAnswers((a) => ({ ...a, [q.id]: { text } }));

  // Ticking clock (drives both the countdown and the elapsed timer).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Time's up → submit whatever is there. One-minute heads-up for longer quizzes.
  useEffect(() => {
    if (remaining == null) return;
    if (remaining === 60 && limitSec > 120 && !warnedRef.current) {
      warnedRef.current = true;
      toast.warning("One minute left");
    }
    if (remaining === 0 && !autoRef.current) {
      autoRef.current = true;
      toast.info("Time's up — submitting your answers.");
      doSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // Move focus to the new question so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (q?.type === "short") textRef.current?.focus({ preventScroll: true });
    else cardRef.current?.focus({ preventScroll: true });
    const top = cardRef.current?.getBoundingClientRect().top;
    if (top != null && top < 72) cardRef.current.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Keyboard: 1–9 pick an option (T/F on true/false), Enter = next, ←/→ move, Ctrl+Enter from a text box.
  const keyHandler = useRef(null);
  useEffect(() => {
    keyHandler.current = (e) => {
      if (submit.isPending || e.defaultPrevented || e.altKey) return;
      if (e.target?.closest?.('[role="dialog"],[role="alertdialog"]')) return;
      if (inTextField(e.target)) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          next();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      if (q.type !== "short") {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= q.options.length) {
          e.preventDefault();
          choose(n - 1);
          return;
        }
        if (q.type === "truefalse" && (e.key === "t" || e.key === "f")) {
          e.preventDefault();
          choose(e.key === "t" ? 0 : 1);
          return;
        }
      }
      if (e.key === "Enter") {
        // Let other focused buttons (prev/next/navigator) do their own thing.
        if (e.target?.closest?.("button:not([data-option]), a")) return;
        e.preventDefault();
        next({ viaKeyboard: true });
      } else if (e.key === "ArrowRight" && index < total - 1) {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
  });
  useEffect(() => {
    const h = (e) => keyHandler.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Don't lose answers to an accidental navigation or tab close.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !doneRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirm({ title: "Leave this quiz?", description: "Your answers so far won't be saved.", confirmLabel: "Leave quiz", cancelLabel: "Stay", danger: true }).then((ok) =>
      ok ? blocker.proceed() : blocker.reset(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);
  useEffect(() => {
    const h = (e) => {
      if (doneRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const exit = async () => {
    if (answeredCount > 0) {
      const ok = await confirm({ title: "Exit this quiz?", description: "Your answers so far won't be saved.", confirmLabel: "Exit", cancelLabel: "Keep going", danger: true });
      if (!ok) return;
    }
    doneRef.current = true;
    onExit();
  };

  const timerTone =
    remaining == null
      ? "border-border bg-surface text-muted"
      : remaining <= 15
        ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
        : remaining <= 60
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-border bg-surface text-fg";

  const a = answers[q.id];
  const diff = q.difficulty ? DIFFICULTY_META[q.difficulty] : null;
  const isLast = index === total - 1;
  const motionProps = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 24 * dir }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 * dir } };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Compact header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={exit} className="-ml-2 text-muted">
          <X /> Exit
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold tracking-tight">{quiz.title}</p>
          <p className="text-xs text-muted" aria-live="polite">
            Question {index + 1} of {total}
          </p>
        </div>
        <div
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums", timerTone)}
          aria-label={remaining != null ? `Time remaining ${clock(remaining)}` : `Time elapsed ${clock(elapsed)}`}
          role="timer"
        >
          {remaining != null ? <Timer className={cn("size-3.5", remaining <= 15 && "animate-pulse")} /> : <Clock className="size-3.5" />}
          {clock(remaining ?? elapsed)}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Progress value={(answeredCount / total) * 100} className="h-1.5" />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {answeredCount}/{total} answered
        </span>
      </div>

      {/* Question navigator */}
      <nav aria-label="Questions" className="mt-4">
        <ol className="flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const done = isAnswered(x, answers[x.id]);
            const current = i === index;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Question ${i + 1}${done ? ", answered" : ", not answered"}`}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg border text-xs font-semibold tabular-nums transition",
                    done ? "border-transparent bg-ink text-on-ink" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
                    current && "ring-2 ring-brand-500 ring-offset-2 ring-offset-bg",
                  )}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Question */}
      <div className="relative mt-5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={q.id} {...motionProps} transition={{ duration: 0.18, ease: "easeOut" }}>
            <Card ref={cardRef} tabIndex={-1} className="scroll-mt-24 p-5 outline-none sm:p-7" aria-labelledby={`q-${q.id}-prompt`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge>{TYPE_META[q.type]?.label ?? q.type}</Badge>
                {diff ? <Badge tone={diff.tone}>{diff.label}</Badge> : null}
                <span className="ml-auto tabular-nums">
                  {fmtScore(q.points)} {q.points === 1 ? "point" : "points"}
                </span>
              </div>
              <div id={`q-${q.id}-prompt`} className="mt-4">
                <Markdown className="text-[1.05rem] font-medium leading-relaxed text-fg sm:text-lg">{q.prompt}</Markdown>
              </div>

              {q.type === "short" ? (
                <div className="mt-6 space-y-1.5">
                  <label htmlFor={`q-${q.id}-answer`} className="text-[13px] font-medium">
                    Your answer
                  </label>
                  <Textarea
                    id={`q-${q.id}-answer`}
                    ref={textRef}
                    rows={5}
                    value={a?.text ?? ""}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Explain in a sentence or three…"
                    maxLength={5000}
                  />
                  <p className="text-xs text-muted">Graded by AI for meaning, not exact wording — partial credit counts.</p>
                </div>
              ) : (
                <div role="radiogroup" aria-labelledby={`q-${q.id}-prompt`} className={cn("mt-6 grid gap-2.5", q.type === "truefalse" && "sm:grid-cols-2")}>
                  {q.options.map((opt, i) => {
                    const selected = a?.choiceIndex === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-option
                        onClick={() => choose(i)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition sm:p-4",
                          selected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/25 dark:bg-brand-500/10"
                            : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold tabular-nums transition",
                            selected ? "border-brand-500 bg-brand-500 text-[#16140f]" : "border-border-strong text-muted",
                          )}
                          aria-hidden="true"
                        >
                          {selected ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                        </span>
                        <Markdown className="min-w-0 flex-1 text-[0.95rem] [&_p]:my-0">{opt}</Markdown>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navigation */}
      <div className="mt-5 flex items-center gap-3">
        <Button variant="secondary" onClick={prev} disabled={index === 0}>
          <ArrowLeft /> <span className="hidden sm:inline">Previous</span>
        </Button>
        <p className="hidden flex-1 items-center justify-center gap-1.5 text-xs text-faint md:flex">
          {q.type === "short" ? (
            <>
              <Kbd>Ctrl</Kbd>
              <Kbd>Enter</Kbd> next
            </>
          ) : (
            <>
              <Kbd>1</Kbd>–<Kbd>{Math.min(9, q.options.length)}</Kbd> choose · <Kbd>Enter</Kbd> next · <Kbd>←</Kbd>
              <Kbd>→</Kbd> move
            </>
          )}
        </p>
        <div className="flex flex-1 justify-end gap-2 md:flex-none">
          {!isLast ? (
            <Button variant="ghost" className="text-muted" onClick={() => requestSubmit()} disabled={submit.isPending}>
              Submit early
            </Button>
          ) : null}
          {isLast ? (
            <Button onClick={() => requestSubmit()} loading={submit.isPending} size="md">
              <Send /> Submit quiz
            </Button>
          ) : (
            <Button variant="ink" onClick={() => next()}>
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>

      <AiOverlay
        open={submit.isPending && hasShort}
        title="Grading your answers…"
        steps={["Checking your multiple-choice answers", "Reading your written answers", "Comparing with the model answers", "Writing feedback"]}
      />
    </div>
  );
}

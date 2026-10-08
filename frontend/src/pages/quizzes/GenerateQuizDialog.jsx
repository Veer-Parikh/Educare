import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import { api, toForm } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { AiWorking } from "@/components/AiWorking";
import { EMPTY_SOURCE, SourcePicker, sourcePayload, sourceReady } from "@/components/SourcePicker";
import { DIFFICULTY_OPTIONS, TYPE_META } from "./quiz-shared";

const TYPES = ["mcq", "truefalse", "short"];

const TYPE_HINT = {
  mcq: "4 options, one correct",
  truefalse: "Quick checks",
  short: "AI-graded, partial credit",
};

/** "Generate quiz" modal: source + settings -> POST /quizzes/generate -> open the quiz. */
export function GenerateQuizDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const countId = useId();
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState("mixed");
  const [types, setTypes] = useState(["mcq"]);
  const [timeLimit, setTimeLimit] = useState("");

  const limit = timeLimit === "" ? undefined : Number(timeLimit);
  const limitInvalid = limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 240);

  const generate = useMutation({
    mutationFn: () => {
      const { fields, files } = sourcePayload(source);
      return api.upload("/quizzes/generate", toForm({ ...fields, count, difficulty, types, timeLimitMin: limit }, files));
    },
    onSuccess: ({ quiz }) => {
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Your quiz is ready", { description: `${quiz.questions?.length ?? count} questions · ${quiz.title}` });
      onOpenChange(false);
      setSource(EMPTY_SOURCE);
      navigate(`/app/quizzes/${quiz.id}`);
    },
  });

  const toggleType = (t) =>
    setTypes((cur) => {
      if (cur.includes(t)) return cur.length === 1 ? cur : cur.filter((x) => x !== t);
      return TYPES.filter((x) => x === t || cur.includes(x));
    });

  const ready = sourceReady(source) && types.length > 0 && !limitInvalid;
  const pending = generate.isPending;

  const submit = (e) => {
    e?.preventDefault();
    if (!ready || pending) return;
    generate.mutate();
  };

  const steps = [
    source.source === "topic" ? "Researching the topic" : "Reading your source",
    "Picking the key concepts",
    `Writing ${count} questions`,
    types.includes("mcq") ? "Crafting plausible distractors" : "Balancing difficulty",
    "Checking every answer",
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => (!pending ? onOpenChange(o) : undefined)}>
      <DialogContent
        size="lg"
        hideClose={pending}
        title="Generate a quiz"
        description="Point the AI at a topic, your notes, a class material or a file."
        footer={
          pending ? (
            <p className="mr-auto text-xs text-muted">This usually takes 10–30 seconds. Keep this window open.</p>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="generate-quiz" disabled={!ready}>
                <Sparkles /> Generate {count} questions
              </Button>
            </>
          )
        }
      >
        {pending ? (
          <AiWorking title="Building your quiz…" steps={steps} />
        ) : (
          <form id="generate-quiz" onSubmit={submit} className="space-y-6">
            <SourcePicker value={source} onChange={setSource} />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={countId} className="flex items-baseline justify-between">
                  <span>Questions</span>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                </Label>
                <input
                  id={countId}
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  aria-valuetext={`${count} questions`}
                  className="h-10 w-full cursor-pointer accent-brand-500"
                />
                <div className="flex justify-between text-[11px] text-faint">
                  <span>3</span>
                  <span>30</span>
                </div>
              </div>

              <Field label="Time limit" optional hint={limitInvalid ? undefined : "Minutes. Leave empty for an untimed quiz."} error={limitInvalid ? "Enter 1–240 minutes." : undefined}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    placeholder="No limit"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium">Difficulty</p>
              <Segmented value={difficulty} onChange={setDifficulty} options={DIFFICULTY_OPTIONS} className="flex w-full sm:w-auto" />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-[13px] font-medium">Question types</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {TYPES.map((t) => {
                  const on = types.includes(t);
                  const Icon = TYPE_META[t].icon;
                  const last = on && types.length === 1;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleType(t)}
                      title={last ? "Keep at least one question type" : undefined}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                        on ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-500/10" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                      )}
                    >
                      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-brand-500 bg-brand-500 text-[#16140f]" : "border-border-strong")}>
                        {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Icon className="size-4 text-muted" /> {TYPE_META[t].label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{TYPE_HINT[t]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

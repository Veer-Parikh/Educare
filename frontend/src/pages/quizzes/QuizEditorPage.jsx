import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Eye, ListChecks, Plus, Save, TextCursorInput, ToggleLeft, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { TYPE_META } from "./quiz-shared";

const LETTERS = "ABCDEF";
let tmp = 0;
const tempId = () => `new-${Date.now().toString(36)}-${tmp++}`;

const blankQuestion = (type = "mcq") => ({
  id: tempId(),
  type,
  prompt: "",
  options: type === "mcq" ? ["", "", "", ""] : type === "truefalse" ? ["True", "False"] : [],
  answerIndex: type === "short" ? null : 0,
  answerText: "",
  explanation: "",
  concept: "",
  difficulty: "medium",
  points: type === "short" ? 2 : 1,
});

/** First problem with a question, or null when it's valid. */
function problemOf(q) {
  if (!q.prompt.trim()) return "Write the question.";
  if (q.type === "mcq") {
    const filled = q.options.filter((o) => o.trim());
    if (filled.length < 2) return "Add at least two options.";
    if (q.answerIndex == null || !q.options[q.answerIndex]?.trim()) return "Mark the correct option.";
  }
  if (q.type === "truefalse" && q.answerIndex !== 0 && q.answerIndex !== 1) return "Choose True or False.";
  if (q.type === "short" && !q.answerText.trim()) return "Add a model answer — it's used for AI grading.";
  return null;
}

/** Shape for the API: drop empty options and remap the correct index. */
function toPayload(q) {
  const base = {
    id: q.id.startsWith("new-") ? undefined : q.id,
    type: q.type,
    prompt: q.prompt.trim(),
    explanation: q.explanation.trim() || null,
    concept: q.concept.trim() || null,
    difficulty: q.difficulty,
    points: Number(q.points) || 1,
  };
  if (q.type === "short") return { ...base, options: [], answerIndex: null, answerText: q.answerText.trim() };
  if (q.type === "truefalse") return { ...base, options: ["True", "False"], answerIndex: q.answerIndex, answerText: null };
  const kept = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  return { ...base, options: kept.map((x) => x.o), answerIndex: kept.findIndex((x) => x.i === q.answerIndex), answerText: null };
}

function QuestionEditor({ q, index, count, onChange, onMove, onDuplicate, onDelete }) {
  const set = (patch) => onChange({ ...q, ...patch });
  const problem = problemOf(q);

  const changeType = (type) => {
    if (type === q.type) return;
    const next = blankQuestion(type);
    set({ type, options: type === "mcq" ? (q.type === "mcq" ? q.options : next.options) : next.options, answerIndex: next.answerIndex, points: next.points });
  };

  return (
    <Card className={cn(problem && q.prompt && "border-amber-300 dark:border-amber-500/40")}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-subtle text-sm font-semibold tabular-nums">{index + 1}</span>
          <Select value={q.type} onChange={(e) => changeType(e.target.value)} className="w-44" aria-label="Question type">
            {Object.entries(TYPE_META).map(([value, m]) => (
              <option key={value} value={value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value })} className="w-32" aria-label="Difficulty">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <Input type="number" min={0} max={100} step="0.5" value={q.points} onChange={(e) => set({ points: e.target.value })} className="h-10 w-20" aria-label="Points" />
            pts
          </label>
          <div className="ml-auto flex items-center gap-0.5">
            <Tip content="Move up">
              <Button variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move question up">
                <ArrowUp />
              </Button>
            </Tip>
            <Tip content="Move down">
              <Button variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move question down">
                <ArrowDown />
              </Button>
            </Tip>
            <Tip content="Duplicate">
              <Button variant="ghost" size="icon-sm" onClick={onDuplicate} aria-label="Duplicate question">
                <Copy />
              </Button>
            </Tip>
            <Tip content="Delete">
              <Button variant="danger-ghost" size="icon-sm" onClick={onDelete} disabled={count === 1} aria-label="Delete question">
                <Trash2 />
              </Button>
            </Tip>
          </div>
        </div>

        <Textarea rows={2} value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="Question text (Markdown and $math$ supported)" aria-label="Question" />

        {q.type === "mcq" ? (
          <div className="space-y-2" role="radiogroup" aria-label="Options — select the correct one">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={q.answerIndex === i}
                  onClick={() => set({ answerIndex: i })}
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg border text-xs font-semibold transition",
                    q.answerIndex === i ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-muted hover:border-border-strong",
                  )}
                  aria-label={`Mark option ${LETTERS[i]} correct`}
                >
                  {LETTERS[i]}
                </button>
                <Input
                  value={opt}
                  onChange={(e) => set({ options: q.options.map((o, j) => (j === i ? e.target.value : o)) })}
                  placeholder={`Option ${LETTERS[i]}`}
                  className={cn(q.answerIndex === i && "border-emerald-400")}
                  aria-label={`Option ${LETTERS[i]}`}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={q.options.length <= 2}
                  onClick={() => {
                    const options = q.options.filter((_, j) => j !== i);
                    const answerIndex = q.answerIndex === i ? 0 : q.answerIndex > i ? q.answerIndex - 1 : q.answerIndex;
                    set({ options, answerIndex });
                  }}
                  aria-label={`Remove option ${LETTERS[i]}`}
                >
                  <X />
                </Button>
              </div>
            ))}
            {q.options.length < 6 ? (
              <Button variant="ghost" size="sm" onClick={() => set({ options: [...q.options, ""] })}>
                <Plus /> Add option
              </Button>
            ) : null}
          </div>
        ) : q.type === "truefalse" ? (
          <div className="flex gap-2" role="radiogroup" aria-label="Correct answer">
            {["True", "False"].map((label, i) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={q.answerIndex === i}
                onClick={() => set({ answerIndex: i })}
                className={cn("h-10 flex-1 rounded-lg border text-sm font-medium transition", q.answerIndex === i ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "border-border hover:border-border-strong")}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <Field label="Model answer" hint="Students' answers are graded against this — wording can differ.">
            {(p) => <Textarea {...p} rows={2} value={q.answerText} onChange={(e) => set({ answerText: e.target.value })} />}
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Field label="Explanation" optional>
            {(p) => <Textarea {...p} rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} placeholder="Shown after answering — why the answer is right" />}
          </Field>
          <Field label="Concept" optional hint="Powers mastery tracking">
            {(p) => <Input {...p} value={q.concept} onChange={(e) => set({ concept: e.target.value })} placeholder="e.g. Newton's 2nd law" maxLength={80} />}
          </Field>
        </div>

        {problem && q.prompt ? <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{problem}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function QuizEditorPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, isLoading, error } = useQuery({ queryKey: ["quiz", id], queryFn: () => api.get(`/quizzes/${id}`) });

  const [meta, setMeta] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data?.quiz || !data.isOwner) return;
    const q = data.quiz;
    setMeta({ title: q.title, description: q.description ?? "", timeLimitMin: q.timeLimitMin ?? "" });
    setQuestions(
      q.questions.map((x) => ({
        ...x,
        options: x.type === "mcq" ? [...x.options] : x.options,
        answerText: x.answerText ?? "",
        explanation: x.explanation ?? "",
        concept: x.concept ?? "",
        difficulty: x.difficulty ?? "medium",
      })),
    );
    setDirty(false);
  }, [data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = (fn) => {
    fn();
    setDirty(true);
  };
  const update = (i, q) => touch(() => setQuestions((list) => list.map((x, j) => (j === i ? q : x))));
  const move = (i, d) =>
    touch(() =>
      setQuestions((list) => {
        const next = [...list];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        return next;
      }),
    );

  const problems = useMemo(() => questions.map(problemOf).filter(Boolean).length, [questions]);
  const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/quizzes/${id}`, {
        title: meta.title.trim(),
        description: meta.description,
        timeLimitMin: meta.timeLimitMin === "" ? null : Math.max(1, Math.min(240, Number(meta.timeLimitMin))),
        questions: questions.map(toPayload),
      }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["quiz", id] });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Quiz saved");
    },
  });

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error || !data?.isOwner) return <EmptyState icon={ListChecks} title="You can't edit this quiz" description="Only the quiz's creator can edit it." />;
  if (!meta) return null;

  const leave = async () => {
    if (!dirty || (await confirm({ title: "Discard unsaved changes?", confirmLabel: "Discard", danger: true }))) navigate(`/app/quizzes/${id}`);
  };

  return (
    <div>
      <PageHeader
        title="Edit quiz"
        description={`${plural(questions.length, "question")} · ${totalPoints} points${data.quiz.published ? " · published — students see changes immediately" : ""}`}
        actions={
          <Button variant="secondary" onClick={leave}>
            <Eye /> Back to quiz
          </Button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_160px]">
            <Field label="Title">{(p) => <Input {...p} value={meta.title} onChange={(e) => touch(() => setMeta({ ...meta, title: e.target.value }))} maxLength={160} />}</Field>
            <Field label="Time limit" optional hint="Minutes">
              {(p) => <Input {...p} type="number" min={1} max={240} value={meta.timeLimitMin} onChange={(e) => touch(() => setMeta({ ...meta, timeLimitMin: e.target.value }))} placeholder="None" />}
            </Field>
            <Field label="Description" optional className="sm:col-span-2">
              {(p) => <Textarea {...p} rows={2} value={meta.description} onChange={(e) => touch(() => setMeta({ ...meta, description: e.target.value }))} placeholder="Instructions shown before starting" />}
            </Field>
          </CardContent>
        </Card>

        {questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            q={q}
            index={i}
            count={questions.length}
            onChange={(next) => update(i, next)}
            onMove={(d) => move(i, d)}
            onDuplicate={() => touch(() => setQuestions((list) => [...list.slice(0, i + 1), { ...q, id: tempId(), options: [...q.options] }, ...list.slice(i + 1)]))}
            onDelete={() => touch(() => setQuestions((list) => list.filter((_, j) => j !== i)))}
          />
        ))}

        <div className="flex flex-wrap justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4">
          <span className="mr-1 self-center text-sm text-muted">Add question:</span>
          {[
            ["mcq", ListChecks, "Multiple choice"],
            ["truefalse", ToggleLeft, "True / False"],
            ["short", TextCursorInput, "Short answer"],
          ].map(([type, Icon, label]) => (
            <Button key={type} variant="secondary" size="sm" onClick={() => touch(() => setQuestions((list) => [...list, blankQuestion(type)]))} disabled={questions.length >= 60}>
              <Icon /> {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-bg/90 backdrop-blur-lg md:-mx-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            {problems ? <Badge tone="warning">{plural(problems, "question")} need attention</Badge> : dirty ? <Badge tone="brand">Unsaved changes</Badge> : <span className="text-muted">All changes saved</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link to={`/app/quizzes/${id}/results`}>Results</Link>
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || problems > 0 || !meta.title.trim() || !questions.length}>
              <Save /> Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

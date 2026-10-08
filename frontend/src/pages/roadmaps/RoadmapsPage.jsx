import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckBig, Clock, Plus, Route, Sparkles, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fromNow, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { AiTag, AiWorking } from "@/components/AiWorking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Progress, Segmented, Skeleton } from "@/components/ui/misc";
import { LEVELS, levelInfo } from "./shared";

const EXAMPLES = [
  "Get job-ready with React",
  "Data science with Python",
  "Calculus from scratch",
  "JEE Physics: mechanics",
  "Build Android apps with Kotlin",
  "Machine learning fundamentals",
  "Conversational Spanish",
  "System design interviews",
];

const EMPTY_FORM = { goal: "", level: "beginner", weeks: 8, hoursPerWeek: 5, context: "" };

function RangeField({ label, value, onChange, min, max, unit, hint }) {
  return (
    <Field label={label} hint={hint}>
      {(p) => (
        <div className="flex items-center gap-3">
          <input {...p} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-2 min-w-0 flex-1 cursor-pointer accent-brand-500" />
          <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
            {value} <span className="font-normal text-muted">{unit}</span>
          </span>
        </div>
      )}
    </Field>
  );
}

function NewRoadmapDialog({ open, onOpenChange, initialGoal }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, goal: initialGoal || "" });
  }, [open, initialGoal]);

  const gen = useMutation({
    mutationFn: () =>
      api.post("/roadmaps/generate", {
        goal: form.goal.trim(),
        level: form.level,
        weeks: form.weeks,
        hoursPerWeek: form.hoursPerWeek,
        context: form.context.trim() || undefined,
      }),
    onSuccess: ({ roadmap }) => {
      qc.setQueryData(["roadmap", roadmap.id], { roadmap: { ...roadmap, progress: 0 } });
      qc.invalidateQueries({ queryKey: ["roadmaps"] });
      toast.success(`Your ${plural(roadmap.weeks, "week")} roadmap is ready`);
      onOpenChange(false);
      navigate(`/app/roadmaps/${roadmap.id}`);
    },
  });

  const ready = form.goal.trim().length >= 3 && !gen.isPending;
  const submit = (e) => {
    e?.preventDefault();
    if (ready) gen.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !gen.isPending && onOpenChange(o)}>
      <DialogContent
        size="lg"
        title="New learning roadmap"
        description="Tell us the goal and your time budget. You'll get a week-by-week plan with topics, resources and a project to prove it."
        hideClose={gen.isPending}
        footer={
          gen.isPending ? null : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!ready}>
                <WandSparkles /> Build my roadmap
              </Button>
            </>
          )
        }
      >
        {gen.isPending ? (
          <AiWorking
            title="Designing your roadmap…"
            steps={["Understanding your goal", "Ordering prerequisites", `Sizing ${plural(form.weeks, "week")} to ${form.hoursPerWeek} h each`, "Picking resources and projects", "Final checks"]}
          />
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <Field label="What do you want to learn?" hint="Be specific — “React for a frontend internship” beats “coding”.">
              {(p) => <Input {...p} value={form.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={200} placeholder="e.g. Get job-ready with React" />}
            </Field>

            <div className="space-y-1.5">
              <p id="rm-level" className="text-[13px] font-medium">
                Where are you starting?
              </p>
              <div role="group" aria-labelledby="rm-level">
                <Segmented value={form.level} onChange={(level) => set({ level })} options={LEVELS} className="flex w-full sm:w-auto" />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <RangeField label="Duration" value={form.weeks} onChange={(weeks) => set({ weeks })} min={1} max={24} unit={form.weeks === 1 ? "week" : "weeks"} />
              <RangeField label="Time per week" value={form.hoursPerWeek} onChange={(hoursPerWeek) => set({ hoursPerWeek })} min={1} max={60} unit="h" />
            </div>
            <p className="-mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
              <Clock className="size-3.5" /> About {form.weeks * form.hoursPerWeek} hours in total
            </p>

            <Field label="Anything else we should know?" optional>
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  value={form.context}
                  onChange={(e) => set({ context: e.target.value })}
                  maxLength={1000}
                  placeholder="e.g. I know basic Python. Preparing for placements in March. I prefer videos and hands-on projects."
                />
              )}
            </Field>
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoadmapCard({ roadmap }) {
  const level = levelInfo(roadmap.level);
  const total = roadmap.milestones?.length ?? 0;
  const done = roadmap.milestones?.filter((m) => m.done).length ?? 0;
  const next = roadmap.milestones?.find((m) => !m.done);
  const pctDone = Math.round((roadmap.progress ?? 0) * 100);

  return (
    <Card interactive className="relative flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
          <Route className="size-5" />
        </span>
        <Badge tone={level.tone}>{level.label}</Badge>
      </div>
      <h3 className="mt-4 line-clamp-2 text-[15px] font-semibold tracking-tight">
        <Link to={`/app/roadmaps/${roadmap.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring">
          {roadmap.goal}
        </Link>
      </h3>
      <p className="mt-1 text-xs text-muted">
        {plural(roadmap.weeks, "week")} · {roadmap.hoursPerWeek} h/week
      </p>
      {roadmap.summary ? <p className="mt-2 line-clamp-2 text-sm text-muted">{roadmap.summary}</p> : null}

      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">
            {done} of {total} weeks
          </span>
          <span className="font-semibold tabular-nums">{pctDone}%</span>
        </div>
        <Progress value={pctDone} barClassName={pctDone === 100 ? "bg-emerald-500" : undefined} />
        <p className="mt-3 truncate text-xs text-muted">
          {next ? (
            <>
              <span className="font-medium text-fg">Up next</span> · Week {next.week}: {next.title}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
              <CircleCheckBig className="size-3.5" /> Completed
            </span>
          )}
        </p>
        <p className="mt-1 text-[11px] text-faint">Updated {fromNow(roadmap.updatedAt)}</p>
      </div>
    </Card>
  );
}

export default function RoadmapsPage() {
  const [dialog, setDialog] = useState({ open: false, goal: "" });
  const q = useQuery({ queryKey: ["roadmaps"], queryFn: () => api.get("/roadmaps") });
  const roadmaps = q.data?.roadmaps ?? [];
  const open = (goal = "") => setDialog({ open: true, goal });

  return (
    <div>
      <PageHeader
        title="Roadmaps"
        description="Say what you want to learn and how much time you have. Get a week-by-week plan with resources, projects and quick checks."
        actions={
          roadmaps.length ? (
            <Button onClick={() => open()}>
              <Plus /> New roadmap
            </Button>
          ) : null
        }
      />

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <EmptyState icon={Route} title="Couldn't load your roadmaps" description={q.error?.message} action={<Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>} />
      ) : roadmaps.length === 0 ? (
        <div className="ai-surface relative overflow-hidden rounded-2xl border border-border px-6 py-12 text-center sm:py-16">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-40 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden="true" />
          <div className="relative">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-500 text-[#16140f] shadow-soft">
              <Route className="size-6" />
            </span>
            <div className="mt-5 flex justify-center">
              <AiTag>Personal study plan</AiTag>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">Where do you want to be in a few weeks?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              We'll sequence the prerequisites, size every week to your schedule, and add resources and a project for each step. Tick weeks off as you go.
            </p>
            <Button size="lg" className="mt-6" onClick={() => open()}>
              <WandSparkles /> Create a roadmap
            </Button>
            <div className="mx-auto mt-8 max-w-2xl">
              <p className="text-xs font-medium text-faint">Popular goals</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => open(g)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-brand-500 hover:text-fg"
                  >
                    <Sparkles className="size-3 text-brand-600 dark:text-brand-400" />
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roadmaps.map((r) => (
            <RoadmapCard key={r.id} roadmap={r} />
          ))}
          <button
            type="button"
            onClick={() => open()}
            className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong/80 p-5 text-center text-sm text-muted transition hover:border-brand-500 hover:bg-brand-50/40 hover:text-fg dark:hover:bg-brand-500/5"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-subtle">
              <Plus className="size-5" />
            </span>
            <span className="font-medium text-fg">Plan something new</span>
            <span className="text-xs">A fresh week-by-week roadmap</span>
          </button>
        </div>
      )}

      <NewRoadmapDialog open={dialog.open} initialGoal={dialog.goal} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, NotebookPen, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { AiWorking, AiTag } from "@/components/AiWorking";
import { LESSON_STYLES, LessonPlanView, PrintStyles, lessonPlanMarkdown } from "./views";
import { DocActions, RecentItems } from "./kit";

const DURATIONS = [30, 35, 40, 45, 50, 60, 75, 90, 120];

export default function LessonPlannerPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ topic: "", subject: "", grade: "", durationMin: 45, style: "interactive", objectives: "", notes: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const generate = useMutation({
    mutationFn: () => api.post("/tools/lesson-plan", { ...form, durationMin: Number(form.durationMin) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artifacts"] }),
  });
  const artifact = generate.data?.artifact;
  const style = LESSON_STYLES.find((s) => s.value === form.style);

  return (
    <div>
      <div className="no-print">
        <PageHeader eyebrow={<AiTag>Teaching assistant</AiTag>} title="Lesson planner" description="A timed, differentiated plan with checks for understanding and an exit ticket — ready to teach or print." />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] print:block">
        <div className="no-print space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-4 p-5">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (form.topic.trim().length >= 2) generate.mutate();
                }}
              >
                <Field label="Topic">{(p) => <Input {...p} value={form.topic} onChange={set("topic")} placeholder="e.g. Photosynthesis, fractions, the French Revolution" maxLength={200} />}</Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Subject" optional>
                    {(p) => <Input {...p} value={form.subject} onChange={set("subject")} placeholder="Biology" />}
                  </Field>
                  <Field label="Grade / level" optional>
                    {(p) => <Input {...p} value={form.grade} onChange={set("grade")} placeholder="Grade 9" />}
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Duration">
                    {(p) => (
                      <Select {...p} value={form.durationMin} onChange={set("durationMin")}>
                        {DURATIONS.map((d) => (
                          <option key={d} value={d}>
                            {d} minutes
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Style">
                    {(p) => (
                      <Select {...p} value={form.style} onChange={set("style")}>
                        {LESSON_STYLES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                {style ? <p className="-mt-1 text-xs text-muted">{style.hint}</p> : null}
                <Field label="Learning objectives" optional hint="What students should be able to do by the end.">
                  {(p) => <Textarea {...p} rows={3} value={form.objectives} onChange={set("objectives")} placeholder="Explain the role of chlorophyll; describe inputs and outputs…" />}
                </Field>
                <Field label="Constraints or notes" optional>
                  {(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set("notes")} placeholder="Mixed-ability class, no lab access, 2 students with dyslexia…" />}
                </Field>
                <Button type="submit" className="w-full" loading={generate.isPending} disabled={form.topic.trim().length < 2}>
                  <Sparkles /> {artifact ? "Generate another" : "Generate lesson plan"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <RecentItems type="lesson_plan" title="Recent lesson plans" />
        </div>

        <div className="min-w-0">
          {generate.isPending ? (
            <AiWorking title="Planning your lesson…" steps={["Setting objectives", "Timing each segment", "Adding checks for understanding", "Differentiating for all learners"]} />
          ) : artifact ? (
            <div className="space-y-4">
              <PrintStyles title={artifact.title} />
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Saved to your library.</p>
                <DocActions title={artifact.title} markdown={() => lessonPlanMarkdown(artifact.data.plan, artifact.data.input, artifact.title)}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/app/library/${artifact.id}`}>
                      <ExternalLink /> Open
                    </Link>
                  </Button>
                </DocActions>
              </div>
              <LessonPlanView plan={artifact.data.plan} input={artifact.data.input} title={artifact.title} />
            </div>
          ) : (
            <EmptyState
              icon={NotebookPen}
              title="Your lesson plan will appear here"
              description="Give it a topic and a duration. You'll get objectives, a minute-by-minute agenda with teacher and student actions, differentiation and an exit ticket."
            />
          )}
        </div>
      </div>
    </div>
  );
}

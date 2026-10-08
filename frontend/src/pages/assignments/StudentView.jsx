import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, CircleDashed, CircleX, Lightbulb, RotateCcw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, toForm } from "@/lib/api";
import { ASSIGNMENT_STATUS, cn, dateTime, fromNow, pct } from "@/lib/utils";
import { useCelebrate } from "@/lib/rewards";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Ring } from "@/components/ui/misc";
import { FileChip, FileDrop } from "@/components/ui/file-drop";
import { useConfirm } from "@/components/ui/confirm";
import { Markdown } from "@/components/Markdown";
import { AiWorking } from "@/components/AiWorking";
import { AssignmentMeta, InstructionsCard, RubricCard, scoreMap } from "./shared";

const CHECK = {
  met: { icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", label: "Met" },
  partial: { icon: CircleDashed, cls: "text-amber-600 dark:text-amber-400", label: "Partly" },
  missing: { icon: CircleX, cls: "text-rose-600 dark:text-rose-400", label: "Missing" },
};

function DraftFeedback({ feedback, onClose }) {
  return (
    <Card className="ai-surface">
      <CardHeader icon={Sparkles} title="AI feedback on your draft" description="Coaching only — this isn't a grade" action={<Button variant="ghost" size="xs" onClick={onClose}>Dismiss</Button>} />
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed">{feedback.summary}</p>
        {feedback.checklist.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Requirements</p>
            <ul className="space-y-2.5">
              {feedback.checklist.map((c, i) => {
                const s = CHECK[c.status] ?? CHECK.partial;
                const Icon = s.icon;
                return (
                  <li key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {c.requirement} <span className={cn("ml-1 text-xs font-normal", s.cls)}>{s.label}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted">{c.tip}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {feedback.nextSteps.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Do these next</p>
            <ol className="space-y-1.5 text-sm">
              {feedback.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-semibold text-[#16140f]">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {feedback.strengths.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">What's working</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {feedback.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GradedCard({ assignment, submission }) {
  const p = assignment.points ? (submission.score / assignment.points) * 100 : 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <Ring value={p} size={76} stroke={8} barClassName={p >= 80 ? "text-emerald-500" : p >= 50 ? "text-brand-500" : "text-rose-500"}>
            <span className="text-sm font-semibold tabular-nums">{pct(p)}</span>
          </Ring>
          <div>
            <p className="text-sm text-muted">Your grade</p>
            <p className="text-3xl font-semibold tabular-nums">
              {submission.score}
              <span className="text-lg font-normal text-muted">/{assignment.points}</span>
            </p>
            <p className="text-xs text-muted">Returned {fromNow(submission.gradedAt)}</p>
          </div>
        </div>
        {submission.feedback ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Teacher feedback</p>
            <Markdown>{submission.feedback}</Markdown>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function StudentView({ data }) {
  const { assignment, submission, myStatus } = data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const celebrate = useCelebrate();

  const [text, setText] = useState(submission?.text ?? "");
  const [files, setFiles] = useState([]);
  const [kept, setKept] = useState(submission?.attachments ?? []);
  const [editing, setEditing] = useState(!submission);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setText(submission?.text ?? "");
    setKept(submission?.attachments ?? []);
    setEditing(!submission);
  }, [submission]);

  const pastDue = assignment.dueAt && new Date(assignment.dueAt) < Date.now();
  const closed = pastDue && !assignment.allowLate;
  const graded = myStatus === "graded";
  const status = ASSIGNMENT_STATUS[myStatus];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assignment", assignment.id] });
    qc.invalidateQueries({ queryKey: ["class", assignment.classroomId, "assignments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const submit = useMutation({
    mutationFn: () => api.upload(`/assignments/${assignment.id}/submission`, toForm({ text, keepAttachments: kept.map((a) => a.key) }, { attachments: files }), { method: "PUT" }),
    onSuccess: ({ reward, status: s }) => {
      refresh();
      setFiles([]);
      setEditing(false);
      toast.success(s === "late" ? "Turned in (late)" : "Turned in");
      celebrate(reward, "assignment");
    },
  });
  const unsubmit = useMutation({
    mutationFn: () => api.del(`/assignments/${assignment.id}/submission`),
    onSuccess: () => {
      refresh();
      toast.success("Unsubmitted — you can edit and turn it in again");
    },
  });
  const coach = useMutation({
    mutationFn: () => api.upload(`/assignments/${assignment.id}/draft-feedback`, toForm({ text }, { attachments: files.filter((f) => /pdf|image|text|wordprocessingml/.test(f.type)) })),
    onSuccess: ({ feedback: f }) => setFeedback(f),
  });
  const tutor = useMutation({
    mutationFn: () => api.post("/tutor/conversations", { mode: "socratic", classroomId: assignment.classroomId, title: `Help: ${assignment.title}` }),
    onSuccess: ({ conversation }) =>
      navigate(`/app/tutor/${conversation.id}?prompt=${encodeURIComponent(`I'm working on the assignment "${assignment.title}". Help me get started without giving me the answer.\n\nInstructions: ${assignment.instructions ?? ""}`.slice(0, 1500))}`),
  });

  const hasContent = text.trim() || files.length || kept.length;

  return (
    <div>
      <PageHeader
        back={{ to: `/app/classes/${assignment.classroomId}/classwork`, label: assignment.classroom.name }}
        title={assignment.title}
        eyebrow={status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        actions={
          <Button variant="secondary" onClick={() => tutor.mutate()} loading={tutor.isPending}>
            <Bot /> Get unstuck
          </Button>
        }
      >
        <div className="mt-3">
          <AssignmentMeta assignment={assignment} />
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <InstructionsCard assignment={assignment} />
          <RubricCard rubric={assignment.rubric} scores={graded ? scoreMap(submission.rubricScores) : undefined} />
        </div>

        <div className="space-y-6">
          {graded ? <GradedCard assignment={assignment} submission={submission} /> : null}

          <Card>
            <CardHeader
              title="Your work"
              description={submission ? `Turned in ${dateTime(submission.submittedAt)}${submission.late ? " · late" : ""}` : closed ? "Submissions are closed" : pastDue ? "Past due — late work is accepted" : "Not turned in yet"}
            />
            <CardContent className="space-y-4">
              {!editing && submission ? (
                <>
                  {submission.text ? <div className="max-h-72 overflow-y-auto rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{submission.text}</div> : null}
                  {submission.attachments.length ? (
                    <ul className="space-y-2">
                      {submission.attachments.map((f) => (
                        <FileChip key={f.key} name={f.name} size={f.size} mime={f.mimeType} url={f.url} />
                      ))}
                    </ul>
                  ) : null}
                  {!graded ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setEditing(true)} disabled={closed}>
                        Edit & resubmit
                      </Button>
                      <Button
                        variant="ghost"
                        loading={unsubmit.isPending}
                        onClick={async () => {
                          if (await confirm({ title: "Unsubmit this work?", description: "Your files will be removed. You can turn it in again before the deadline.", confirmLabel: "Unsubmit" })) unsubmit.mutate();
                        }}
                      >
                        <RotateCcw /> Unsubmit
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : closed ? (
                <div className="flex gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> The deadline has passed and your teacher isn't accepting late work.
                </div>
              ) : (
                <>
                  <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer, or attach your work below…" />
                  {kept.length ? (
                    <ul className="space-y-2">
                      {kept.map((f) => (
                        <FileChip key={f.key} name={f.name} size={f.size} mime={f.mimeType} url={f.url} onRemove={() => setKept(kept.filter((k) => k.key !== f.key))} />
                      ))}
                    </ul>
                  ) : null}
                  <FileDrop compact files={files} onChange={setFiles} max={6 - kept.length} hint="Photos of handwritten work are fine" />
                  {pastDue ? (
                    <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" /> This will be marked late.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!hasContent}>
                      <Send /> {submission ? "Resubmit" : "Turn in"}
                    </Button>
                    {assignment.aiFeedback ? (
                      <Button variant="secondary" onClick={() => coach.mutate()} loading={coach.isPending} disabled={!text.trim() && !files.length}>
                        <Lightbulb /> Get AI feedback first
                      </Button>
                    ) : null}
                    {submission ? (
                      <Button variant="ghost" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {coach.isPending ? <AiWorking compact title="Reviewing your draft…" steps={["Reading the instructions", "Checking each requirement", "Writing specific tips"]} /> : null}
          {feedback && !coach.isPending ? <DraftFeedback feedback={feedback} onClose={() => setFeedback(null)} /> : null}
        </div>
      </div>
    </div>
  );
}

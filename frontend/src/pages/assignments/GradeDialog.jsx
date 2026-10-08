import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CornerUpLeft, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl } from "@/lib/api";
import { ASSIGNMENT_STATUS, cn, dateTime, fromNow } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Textarea } from "@/components/ui/input";
import { FileChip } from "@/components/ui/file-drop";
import { Markdown } from "@/components/Markdown";
import { AiWorking } from "@/components/AiWorking";

function Work({ submission }) {
  if (!submission) return <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">No submission yet.</p>;
  const images = submission.attachments.filter((f) => f.mimeType?.startsWith("image/"));
  const others = submission.attachments.filter((f) => !f.mimeType?.startsWith("image/"));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Turned in {dateTime(submission.submittedAt)}
        {submission.late ? <Badge tone="warning" className="ml-2">Late</Badge> : null}
      </p>
      {submission.text ? <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed whitespace-pre-wrap">{submission.text}</div> : null}
      {images.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((f) => (
            <a key={f.key} href={fileUrl(f.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border">
              <img src={fileUrl(f.url)} alt={f.name} className="max-h-80 w-full object-contain bg-surface-2" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}
      {others.length ? (
        <ul className="space-y-2">
          {others.map((f) => (
            <FileChip key={f.key} name={f.name} size={f.size} mime={f.mimeType} url={f.url} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AiDraftPanel({ draft, onApply, onGenerate, loading, rubric }) {
  if (loading) return <AiWorking compact title="Drafting a grade…" steps={["Reading the rubric", "Reading the student's work", "Scoring each criterion", "Writing feedback"]} />;
  if (!draft) {
    return (
      <div className="ai-surface rounded-2xl border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" /> AI draft
        </p>
        <p className="mt-1 text-sm text-muted">Get a rubric-aligned score and feedback to start from. You always make the final call.</p>
        <Button size="sm" className="mt-3" onClick={onGenerate}>
          <Wand2 /> Draft with AI
        </Button>
      </div>
    );
  }
  const names = Object.fromEntries(rubric.map((r) => [r.id, r]));
  return (
    <div className="ai-surface rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" /> AI draft · {draft.score}
        </p>
        <Badge tone={draft.confidence === "high" ? "success" : draft.confidence === "low" ? "warning" : "neutral"}>{draft.confidence ?? "medium"} confidence</Badge>
      </div>
      {draft.rubricScores.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {draft.rubricScores.map((r) => (
            <li key={r.criterionId} className="flex justify-between gap-3">
              <span className="truncate text-muted">{names[r.criterionId]?.title ?? "Criterion"}</span>
              <span className="tabular-nums">
                {r.score}/{names[r.criterionId]?.points}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Markdown className="mt-3 text-sm">{draft.feedback}</Markdown>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onApply}>
          Use this draft
        </Button>
        <Button size="sm" variant="ghost" onClick={onGenerate}>
          Regenerate
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-faint">Generated {fromNow(draft.generatedAt)}. Review before returning.</p>
    </div>
  );
}

/**
 * Grade one student's submission. `roster` + `index` enable prev/next.
 */
export function GradeDialog({ open, onOpenChange, assignment, roster, index, onNavigate }) {
  const qc = useQueryClient();
  const entry = roster[index];
  const submission = entry?.submission;
  const rubric = assignment.rubric ?? [];

  const initial = useMemo(() => {
    const scores = Object.fromEntries((submission?.rubricScores ?? []).map((r) => [r.criterionId, { score: String(r.score), comment: r.comment ?? "" }]));
    return { score: submission?.score != null ? String(submission.score) : "", feedback: submission?.feedback ?? "", scores };
  }, [submission]);
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const rubricTotal = rubric.reduce((s, r) => s + (Number(form.scores[r.id]?.score) || 0), 0);
  const total = rubric.length ? rubricTotal : Number(form.score);
  const setCrit = (id, patch) => setForm((f) => ({ ...f, scores: { ...f.scores, [id]: { score: "", comment: "", ...f.scores[id], ...patch } } }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assignment", assignment.id] });
    qc.invalidateQueries({ queryKey: ["assignment", assignment.id, "roster"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const draft = useMutation({
    mutationFn: () => api.post(`/submissions/${submission.id}/ai-draft`),
    onSuccess: () => refresh(),
  });
  const aiDraft = draft.data?.submission?.id === submission?.id ? draft.data.submission.aiDraft : submission?.aiDraft;

  const applyDraft = () => {
    if (!aiDraft) return;
    setForm({
      score: String(aiDraft.score),
      feedback: aiDraft.feedback,
      scores: Object.fromEntries(aiDraft.rubricScores.map((r) => [r.criterionId, { score: String(r.score), comment: r.comment ?? "" }])),
    });
    toast.success("Draft applied — edit anything before returning");
  };

  const save = useMutation({
    mutationFn: () =>
      api.post(`/submissions/${submission.id}/grade`, {
        score: total,
        feedback: form.feedback,
        rubricScores: rubric.map((r) => ({ criterionId: r.id, score: Number(form.scores[r.id]?.score) || 0, comment: form.scores[r.id]?.comment || undefined })),
      }),
    onSuccess: () => {
      refresh();
      toast.success(`Grade returned to ${entry.student.name}`);
      const next = roster.findIndex((r, i) => i > index && (r.status === "submitted" || r.status === "late"));
      if (next !== -1) onNavigate(next);
    },
  });
  const reopen = useMutation({
    mutationFn: () => api.post(`/submissions/${submission.id}/return`),
    onSuccess: () => {
      refresh();
      toast.success("Reopened — the student can resubmit");
    },
  });

  if (!entry) return null;
  const status = ASSIGNMENT_STATUS[entry.status];
  const valid = submission && Number.isFinite(total) && total >= 0 && total <= assignment.points && (rubric.length || form.score !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        title={
          <span className="flex items-center gap-3">
            <Avatar name={entry.student.name} src={entry.student.avatarUrl} size="sm" />
            <span className="min-w-0">
              <span className="block truncate">{entry.student.name}</span>
              <span className="block text-xs font-normal text-muted">
                {index + 1} of {roster.length} · {status?.label}
              </span>
            </span>
          </span>
        }
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => onNavigate(index - 1)} disabled={index === 0} aria-label="Previous student">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onNavigate(index + 1)} disabled={index === roster.length - 1} aria-label="Next student">
                <ChevronRight />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {submission?.status === "graded" ? (
                <Button variant="ghost" onClick={() => reopen.mutate()} loading={reopen.isPending}>
                  <CornerUpLeft /> Reopen
                </Button>
              ) : null}
              <span className="text-sm tabular-nums text-muted">
                {Number.isFinite(total) ? total : "—"} / {assignment.points}
              </span>
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
                {submission?.status === "graded" ? "Update grade" : "Return grade"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Submission</p>
            <Work submission={submission} />
          </section>
          {submission ? (
            <section className="space-y-4">
              <AiDraftPanel draft={aiDraft} rubric={rubric} loading={draft.isPending} onGenerate={() => draft.mutate()} onApply={applyDraft} />
              {rubric.length ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-faint">Rubric</p>
                  {rubric.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.title}</p>
                          {r.description ? <p className="text-xs text-muted">{r.description}</p> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-sm">
                          <Input
                            type="number"
                            min={0}
                            max={r.points}
                            step="0.5"
                            value={form.scores[r.id]?.score ?? ""}
                            onChange={(e) => setCrit(r.id, { score: e.target.value })}
                            className={cn("h-8 w-16 text-right", Number(form.scores[r.id]?.score) > r.points && "border-rose-400")}
                            aria-label={`${r.title} score`}
                          />
                          <span className="text-muted">/{r.points}</span>
                        </div>
                      </div>
                      <Input value={form.scores[r.id]?.comment ?? ""} onChange={(e) => setCrit(r.id, { comment: e.target.value })} placeholder="Comment (optional)" className="mt-2 h-8" aria-label={`${r.title} comment`} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={assignment.points} step="0.5" value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} className="w-28" aria-label="Score" />
                  <span className="text-sm text-muted">/ {assignment.points}</span>
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Feedback</p>
                <Textarea rows={6} value={form.feedback} onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))} placeholder="What went well, and what to work on next…" />
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

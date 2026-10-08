import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, toForm } from "@/lib/api";
import { toLocalInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { FileChip, FileDrop } from "@/components/ui/file-drop";

const blank = () => ({ title: "", instructions: "", dueAt: "", points: 100, rubric: [], allowLate: true, aiFeedback: true, files: [], keep: [] });

/** Create (classId) or edit (assignment) an assignment. */
export function AssignmentFormDialog({ open, onOpenChange, classId, assignment, onSaved }) {
  const qc = useQueryClient();
  const editing = Boolean(assignment);
  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (!open) return;
    if (assignment) {
      setForm({
        title: assignment.title,
        instructions: assignment.instructions ?? "",
        dueAt: toLocalInput(assignment.dueAt),
        points: assignment.points,
        rubric: assignment.rubric.map((r) => ({ ...r, description: r.description ?? "" })),
        allowLate: assignment.allowLate,
        aiFeedback: assignment.aiFeedback,
        files: [],
        keep: assignment.attachments,
      });
    } else setForm(blank());
  }, [open, assignment]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const rubricTotal = form.rubric.reduce((s, r) => s + (Number(r.points) || 0), 0);
  const setRow = (i, patch) => set({ rubric: form.rubric.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const suggest = useMutation({
    mutationFn: () => api.post("/assignments/suggest-rubric", { title: form.title, instructions: form.instructions, points: Number(form.points) || 100 }),
    onSuccess: ({ rubric }) => {
      set({ rubric: rubric.map((r) => ({ ...r, description: r.description ?? "" })) });
      toast.success("Rubric drafted — adjust it as you like");
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        title: form.title.trim(),
        instructions: form.instructions,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : "",
        points: form.rubric.length ? rubricTotal : Number(form.points) || 0,
        rubric: form.rubric.filter((r) => r.title.trim()).map((r) => ({ id: r.id, title: r.title.trim(), description: r.description, points: Number(r.points) || 0 })),
        allowLate: form.allowLate,
        aiFeedback: form.aiFeedback,
      };
      if (editing) fields.keepAttachments = form.keep.map((a) => a.key);
      const body = toForm(fields, { attachments: form.files });
      return editing ? api.upload(`/assignments/${assignment.id}`, body, { method: "PATCH" }) : api.upload(`/classes/${classId}/assignments`, body);
    },
    onSuccess: ({ assignment: a }) => {
      qc.invalidateQueries({ queryKey: ["class", a.classroomId, "assignments"] });
      qc.invalidateQueries({ queryKey: ["assignment", a.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Assignment updated" : "Assignment posted — students have been notified");
      onOpenChange(false);
      onSaved?.(a);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={editing ? "Edit assignment" : "New assignment"}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.title.trim().length < 2}>
              {editing ? "Save changes" : "Post assignment"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Title">{(p) => <Input {...p} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Lab report: pendulum motion" maxLength={160} />}</Field>
          <Field label="Instructions" optional hint="Markdown supported. Clear instructions make AI feedback and grading much better.">
            {(p) => <Textarea {...p} rows={5} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="What should students do, and what does great work look like?" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due" optional>
              {(p) => <Input {...p} type="datetime-local" value={form.dueAt} onChange={(e) => set({ dueAt: e.target.value })} />}
            </Field>
            <Field label="Points" hint={form.rubric.length ? "Set by the rubric total." : undefined}>
              {(p) => <Input {...p} type="number" min={0} max={1000} value={form.rubric.length ? rubricTotal : form.points} disabled={form.rubric.length > 0} onChange={(e) => set({ points: e.target.value })} />}
            </Field>
          </div>

          <div className="rounded-2xl border border-border bg-surface-2/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Rubric</p>
                <p className="text-xs text-muted">Criteria power AI draft grading and students' pre-submit feedback.</p>
              </div>
              <div className="flex gap-2">
                <Button size="xs" variant="secondary" onClick={() => suggest.mutate()} loading={suggest.isPending} disabled={form.title.trim().length < 2}>
                  <Sparkles /> Suggest with AI
                </Button>
                <Button size="xs" variant="ghost" onClick={() => set({ rubric: [...form.rubric, { title: "", description: "", points: 10 }] })}>
                  <Plus /> Add
                </Button>
              </div>
            </div>
            {form.rubric.length ? (
              <ul className="mt-4 space-y-3">
                {form.rubric.map((r, i) => (
                  <li key={r.id ?? i} className="grid grid-cols-[1fr_76px_32px] gap-2 rounded-xl border border-border bg-surface p-3">
                    <Input value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="Criterion" aria-label="Criterion title" className="h-9" />
                    <Input type="number" min={0} value={r.points} onChange={(e) => setRow(i, { points: e.target.value })} aria-label="Points" className="h-9" />
                    <Button variant="ghost" size="icon-sm" onClick={() => set({ rubric: form.rubric.filter((_, j) => j !== i) })} aria-label="Remove criterion">
                      <Trash2 />
                    </Button>
                    <Input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="What full marks looks like" aria-label="Criterion description" className="col-span-3 h-9" />
                  </li>
                ))}
                <li className="text-right text-xs font-medium text-muted">Total: {rubricTotal} points</li>
              </ul>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Accept late work</span>
                <span className="block text-xs text-muted">Late submissions are flagged.</span>
              </span>
              <Switch checked={form.allowLate} onCheckedChange={(v) => set({ allowLate: v })} />
            </label>
            <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">AI draft feedback</span>
                <span className="block text-xs text-muted">Students can get coaching (never a grade) before submitting.</span>
              </span>
              <Switch checked={form.aiFeedback} onCheckedChange={(v) => set({ aiFeedback: v })} />
            </label>
          </div>

          <Field label="Attachments" optional>
            <div className="space-y-2">
              {form.keep.length ? (
                <ul className="space-y-2">
                  {form.keep.map((f) => (
                    <FileChip key={f.key} name={f.name} size={f.size} mime={f.mimeType} url={f.url} onRemove={() => set({ keep: form.keep.filter((x) => x.key !== f.key) })} />
                  ))}
                </ul>
              ) : null}
              <FileDrop compact files={form.files} onChange={(files) => set({ files })} max={6 - form.keep.length} hint="Worksheets, readings, images — up to 15 MB each" />
            </div>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

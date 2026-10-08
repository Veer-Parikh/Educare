import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileQuestion, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { AnswerCheckView, LessonPlanView, PrintStyles, answerCheckMarkdown, lessonPlanMarkdown } from "./views";
import { DocActions, TYPE_META } from "./kit";
import { PaperResult } from "./PaperGeneratorPage";

function TitleEditor({ artifact }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(artifact.title);
  useEffect(() => setTitle(artifact.title), [artifact.title]);
  const save = useMutation({
    mutationFn: () => api.patch(`/artifacts/${artifact.id}`, { title: title.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["artifact", artifact.id] });
      qc.invalidateQueries({ queryKey: ["artifacts"] });
      setEditing(false);
      toast.success("Renamed");
    },
  });

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        {artifact.title}
        <button onClick={() => setEditing(true)} className="no-print rounded-md p-1 text-faint transition hover:bg-subtle hover:text-fg" aria-label="Rename">
          <Pencil className="size-4" />
        </button>
      </span>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) save.mutate();
      }}
    >
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="h-10 text-lg font-semibold" aria-label="Title" />
      <Button type="submit" size="icon" loading={save.isPending} disabled={!title.trim()} aria-label="Save title">
        {!save.isPending ? <Check /> : null}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          setTitle(artifact.title);
          setEditing(false);
        }}
        aria-label="Cancel"
      >
        <X />
      </Button>
    </form>
  );
}

export default function ArtifactPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, isLoading, error } = useQuery({ queryKey: ["artifact", id], queryFn: () => api.get(`/artifacts/${id}`) });
  const del = useMutation({
    mutationFn: () => api.del(`/artifacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["artifacts"] });
      toast.success("Deleted");
      navigate("/app/library");
    },
  });

  if (isLoading) return <Skeleton className="h-[60vh] rounded-2xl" />;
  if (error) return <EmptyState icon={FileQuestion} title="Not found" description="This item may have been deleted." />;

  const artifact = data.artifact;
  const meta = TYPE_META[artifact.type];
  const remove = async () => {
    if (await confirm({ title: `Delete "${artifact.title}"?`, confirmLabel: "Delete", danger: true })) del.mutate();
  };

  const deleteButton = (
    <Button variant="danger-ghost" size="sm" onClick={remove}>
      <Trash2 /> Delete
    </Button>
  );

  return (
    <div>
      <div className="no-print">
        <PageHeader
          back={{ to: "/app/library", label: "Library" }}
          eyebrow={meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
          title={<TitleEditor artifact={artifact} />}
          description={`Created ${dateTime(artifact.createdAt)}`}
        />
      </div>

      {artifact.type === "question_paper" ? (
        <div className="space-y-4">
          <div className="no-print flex justify-end">{deleteButton}</div>
          <PaperResult artifact={artifact} />
        </div>
      ) : artifact.type === "lesson_plan" ? (
        <div className="space-y-4">
          <PrintStyles title={artifact.title} />
          <div className="no-print flex justify-end">
            <DocActions title={artifact.title} markdown={() => lessonPlanMarkdown(artifact.data.plan, artifact.data.input, artifact.title)}>
              {deleteButton}
            </DocActions>
          </div>
          <LessonPlanView plan={artifact.data.plan} input={artifact.data.input} title={artifact.title} />
        </div>
      ) : artifact.type === "answer_check" ? (
        <div className="space-y-4">
          <PrintStyles title={artifact.title} />
          <div className="no-print flex justify-end">
            <DocActions title={artifact.title} markdown={() => answerCheckMarkdown(artifact.data.result, { title: artifact.title })}>
              {deleteButton}
            </DocActions>
          </div>
          <AnswerCheckView result={artifact.data.result} input={artifact.data.input} title={artifact.title} createdAt={artifact.createdAt} />
        </div>
      ) : (
        <EmptyState icon={FileQuestion} title="Unknown item type" />
      )}
    </div>
  );
}

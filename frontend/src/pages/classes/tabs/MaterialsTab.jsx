import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, BookOpen, ExternalLink, FileText, GalleryVerticalEnd, Link2, ListChecks, Loader2, MoreHorizontal, NotebookText, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl, toForm } from "@/lib/api";
import { formatBytes, fromNow } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { FileDrop } from "@/components/ui/file-drop";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { Markdown } from "@/components/Markdown";
import { useClassTutor } from "./StreamTab";

const KIND_ICON = { file: FileText, link: Link2, note: NotebookText };

function AddMaterialDialog({ open, onOpenChange, classId }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState("file");
  const [form, setForm] = useState({ title: "", description: "", url: "", body: "" });
  const [file, setFile] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => {
    setForm({ title: "", description: "", url: "", body: "" });
    setFile(null);
  };

  const add = useMutation({
    mutationFn: () => api.upload(`/classes/${classId}/materials`, toForm({ kind, ...form }, kind === "file" ? { file } : {})),
    onSuccess: ({ material }) => {
      qc.invalidateQueries({ queryKey: ["class", classId, "materials"] });
      toast.success(material.textStatus === "pending" ? "Uploaded — AI is reading it in the background" : "Material added");
      reset();
      onOpenChange(false);
    },
  });
  const ready = kind === "file" ? Boolean(file) : kind === "link" ? /^https?:\/\//.test(form.url) : form.title.trim() && form.body.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="Add material"
        description="Readable materials (PDFs, docs, notes, even photos) become context for the class tutor, quizzes and flashcards."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!ready}>
              Add material
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "file", label: "File", icon: FileText },
              { value: "note", label: "Note", icon: NotebookText },
              { value: "link", label: "Link", icon: Link2 },
            ]}
          />
          {kind === "file" ? (
            <FileDrop multiple={false} files={file ? [file] : []} onChange={(f) => setFile(f[0] ?? null)} hint="PDF, DOCX, slides, images or text · 15 MB max" />
          ) : null}
          {kind === "link" ? <Field label="URL">{(p) => <Input {...p} value={form.url} onChange={set("url")} placeholder="https://" />}</Field> : null}
          <Field label="Title" optional={kind !== "note"}>
            {(p) => <Input {...p} value={form.title} onChange={set("title")} placeholder={kind === "file" ? "Defaults to the file name" : "Unit 1 — Kinematics"} />}
          </Field>
          {kind === "note" ? (
            <Field label="Note" hint="Markdown and LaTeX ($...$) supported.">
              {(p) => <Textarea {...p} rows={8} value={form.body} onChange={set("body")} placeholder="Write or paste notes…" />}
            </Field>
          ) : (
            <Field label="Description" optional>
              {(p) => <Textarea {...p} rows={2} value={form.description} onChange={set("description")} />}
            </Field>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }) {
  if (status === "ready")
    return (
      <Tip content="The tutor, quizzes and flashcards can use this material.">
        <Badge tone="success">
          <Sparkles /> AI-ready
        </Badge>
      </Tip>
    );
  if (status === "pending")
    return (
      <Badge tone="info">
        <Loader2 className="animate-spin" /> Reading…
      </Badge>
    );
  if (status === "failed") return <Badge tone="warning">Couldn't read</Badge>;
  return null;
}

function NoteDialog({ materialId, onOpenChange }) {
  const { data } = useQuery({ queryKey: ["material", materialId], queryFn: () => api.get(`/materials/${materialId}`), enabled: Boolean(materialId) });
  return (
    <Dialog open={Boolean(materialId)} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={data?.material.title ?? "Note"}>
        {data ? <Markdown>{data.material.text}</Markdown> : <Skeleton className="h-40" />}
      </DialogContent>
    </Dialog>
  );
}

function MaterialCard({ m, isTeacher, classroom, onOpenNote }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const tutor = useClassTutor(classroom);
  const Icon = KIND_ICON[m.kind] ?? BookOpen;
  const aiReady = m.textStatus === "ready";

  const del = useMutation({
    mutationFn: () => api.del(`/materials/${m.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", classroom.id, "materials"] });
      toast.success("Material removed");
    },
  });
  const quiz = useMutation({
    mutationFn: () => api.upload("/quizzes/generate", toForm({ source: "material", materialId: m.id, count: 8, types: ["mcq", "truefalse"] })),
    onSuccess: ({ quiz: q }) => navigate(`/app/quizzes/${q.id}`),
  });
  const cards = useMutation({
    mutationFn: () => api.upload("/decks/generate", toForm({ source: "material", materialId: m.id, count: 15 })),
    onSuccess: ({ deck }) => navigate(`/app/flashcards/${deck.id}`),
  });
  const busy = quiz.isPending || cards.isPending || tutor.isPending;

  const open = () => {
    if (m.kind === "note") onOpenNote(m.id);
    else window.open(fileUrl(m.kind === "link" ? m.url : m.file?.url), "_blank", "noopener");
  };

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <button onClick={open} className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-muted transition hover:text-fg" aria-label={`Open ${m.title}`}>
          <Icon className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={open} className="block max-w-full truncate text-left text-sm font-semibold hover:underline">
            {m.title}
          </button>
          <p className="truncate text-xs text-muted">
            {m.kind === "file" ? [m.file?.name, formatBytes(m.file?.size)].filter(Boolean).join(" · ") : m.kind === "link" ? m.url : "Note"} · {fromNow(m.createdAt)}
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <button className="-mr-1 rounded-lg p-1.5 text-faint hover:bg-subtle hover:text-fg" aria-label="Material options">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={ExternalLink} onSelect={open}>
              Open
            </MenuItem>
            {aiReady || m.kind === "file" ? (
              <>
                <MenuItem icon={ListChecks} onSelect={() => quiz.mutate()} disabled={busy}>
                  Quiz me on this
                </MenuItem>
                <MenuItem icon={GalleryVerticalEnd} onSelect={() => cards.mutate()} disabled={busy}>
                  Make flashcards
                </MenuItem>
                <MenuItem icon={Bot} onSelect={() => tutor.mutate({ prompt: `Help me understand "${m.title}". Start with the big picture.` })} disabled={busy || !aiReady}>
                  Ask the tutor
                </MenuItem>
              </>
            ) : null}
            {isTeacher ? (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={Trash2}
                  danger
                  onSelect={async () => {
                    if (await confirm({ title: `Remove "${m.title}"?`, danger: true, confirmLabel: "Remove" })) del.mutate();
                  }}
                >
                  Remove
                </MenuItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      </div>
      {m.description ? <p className="mt-3 line-clamp-2 text-sm text-muted">{m.description}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <StatusBadge status={m.textStatus} />
        {quiz.isPending ? <span className="text-xs text-muted">Writing quiz…</span> : cards.isPending ? <span className="text-xs text-muted">Making cards…</span> : null}
      </div>
    </Card>
  );
}

export default function MaterialsTab({ classroom, isTeacher }) {
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["class", classroom.id, "materials"],
    queryFn: () => api.get(`/classes/${classroom.id}/materials`),
    // Poll while any upload is still being transcribed.
    refetchInterval: (q) => (q.state.data?.materials?.some((m) => m.textStatus === "pending") ? 4000 : false),
  });
  const materials = data?.materials ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{materials.filter((m) => m.textStatus === "ready").length} of {materials.length} materials are AI-ready</p>
        {isTeacher ? (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add material
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : materials.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((m) => (
            <MaterialCard key={m.id} m={m} isTeacher={isTeacher} classroom={classroom} onOpenNote={setNote} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No materials yet"
          description={isTeacher ? "Upload notes, slides or readings. The class tutor will use them to answer questions — with citations." : "Your teacher hasn't shared materials yet."}
          action={isTeacher ? <Button onClick={() => setAdding(true)}>Add material</Button> : null}
        />
      )}
      {isTeacher ? <AddMaterialDialog open={adding} onOpenChange={setAdding} classId={classroom.id} /> : null}
      <NoteDialog materialId={note} onOpenChange={(o) => !o && setNote(null)} />
    </div>
  );
}

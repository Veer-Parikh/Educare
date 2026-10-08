import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardPaste, FileUp, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { FileDrop } from "@/components/ui/file-drop";

export const EMPTY_SOURCE = { source: "topic", topic: "", text: "", classId: "", materialId: "", file: null };

const ALL = [
  { value: "topic", label: "Topic", icon: Lightbulb },
  { value: "text", label: "Paste", icon: ClipboardPaste },
  { value: "material", label: "Material", icon: BookOpen, hint: "Use a class material" },
  { value: "file", label: "Upload", icon: FileUp },
];

export const READABLE_ACCEPT = ".pdf,.docx,.txt,.md,.csv,image/png,image/jpeg,image/webp,image/heic";

/** Is the source filled in enough to submit? */
export function sourceReady(v) {
  if (v.source === "topic") return v.topic.trim().length >= 2;
  if (v.source === "text") return v.text.trim().length >= 40;
  if (v.source === "material") return Boolean(v.materialId);
  if (v.source === "file") return Boolean(v.file);
  return false;
}

/** Map the picker value to API form fields + files. */
export function sourcePayload(v) {
  const fields = { source: v.source };
  if (v.source === "topic") fields.topic = v.topic.trim();
  if (v.source === "text") fields.text = v.text;
  if (v.source === "material") fields.materialId = v.materialId;
  return { fields, files: v.source === "file" && v.file ? { file: v.file } : {} };
}

/**
 * Lets a learner point an AI tool at a topic, pasted notes, a class material or a file.
 * Controlled via `value` / `onChange`.
 */
export function SourcePicker({ value, onChange, sources = ["topic", "text", "material", "file"], topicPlaceholder = "e.g. Photosynthesis, Newton's laws, SQL joins", topicLabel = "Topic" }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const options = ALL.filter((o) => sources.includes(o.value));

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api.get("/classes"), enabled: value.source === "material" });
  const classList = classes.data?.classes ?? [];
  const classId = value.classId || classList[0]?.id || "";
  const materials = useQuery({
    queryKey: ["class", classId, "materials"],
    queryFn: () => api.get(`/classes/${classId}/materials`),
    enabled: value.source === "material" && Boolean(classId),
  });
  const usable = (materials.data?.materials ?? []).filter((m) => m.textStatus === "ready" || (m.kind === "file" && m.file));

  // Keep a valid material selected as lists load.
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (value.source !== "material" || autoPicked || !usable.length) return;
    if (!usable.some((m) => m.id === value.materialId)) set({ classId, materialId: usable[0].id });
    setAutoPicked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.source, usable.length]);

  return (
    <div className="space-y-4">
      <Segmented value={value.source} onChange={(source) => set({ source })} options={options} className={cn("grid w-full grid-cols-2", options.length === 4 ? "sm:grid-cols-4" : options.length === 3 ? "sm:grid-cols-3" : "")} />

      {value.source === "topic" ? (
        <Field label={topicLabel}>
          {(p) => <Input {...p} value={value.topic} onChange={(e) => set({ topic: e.target.value })} placeholder={topicPlaceholder} maxLength={200} />}
        </Field>
      ) : null}

      {value.source === "text" ? (
        <Field label="Your notes or text" hint={`${value.text.length.toLocaleString()} characters · paste lecture notes, an article, a chapter…`}>
          {(p) => <Textarea {...p} rows={8} value={value.text} onChange={(e) => set({ text: e.target.value })} placeholder="Paste at least a few sentences…" />}
        </Field>
      ) : null}

      {value.source === "material" ? (
        classList.length === 0 && !classes.isLoading ? (
          <p className="rounded-xl border border-dashed border-border-strong p-4 text-sm text-muted">Join or create a class to use its materials.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Class">
              {(p) => (
                <Select
                  {...p}
                  value={classId}
                  onChange={(e) => {
                    set({ classId: e.target.value, materialId: "" });
                    setAutoPicked(false);
                  }}
                >
                  {classList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Material" hint={materials.isSuccess && !usable.length ? "No readable materials in this class yet." : undefined}>
              {(p) => (
                <Select {...p} value={value.materialId} onChange={(e) => set({ materialId: e.target.value, classId })} disabled={!usable.length}>
                  {!usable.length ? <option value="">—</option> : null}
                  {usable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )
      ) : null}

      {value.source === "file" ? (
        <FileDrop
          multiple={false}
          files={value.file ? [value.file] : []}
          onChange={(files) => set({ file: files[0] ?? null })}
          accept={READABLE_ACCEPT}
          hint="PDF, DOCX, text or a photo of your notes — handwriting works too. Max 15 MB."
        />
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BookOpen, Check, ClipboardList, KeyRound, Plus, School, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CLASS_THEMES, classTheme, cn, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";

export function ThemePicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Class color">
      {Object.entries(CLASS_THEMES).map(([name, t]) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cn("grid size-8 place-items-center rounded-full bg-linear-to-br ring-offset-2 ring-offset-surface transition", t.band, value === name && `ring-2 ${t.ring}`)}
        >
          {value === name ? <Check className="size-4 text-white drop-shadow" /> : null}
        </button>
      ))}
    </div>
  );
}

export function ClassFormDialog({ open, onOpenChange, initial, onSaved }) {
  const qc = useQueryClient();
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({ name: "", subject: "", section: "", description: "", theme: "amber" });
  useEffect(() => {
    if (open) setForm({ name: initial?.name ?? "", subject: initial?.subject ?? "", section: initial?.section ?? "", description: initial?.description ?? "", theme: initial?.theme ?? "amber" });
  }, [open, initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => (editing ? api.patch(`/classes/${initial.id}`, form) : api.post("/classes", form)),
    onSuccess: ({ classroom }) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["class", classroom.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Class updated" : `Class created — share code ${classroom.code}`);
      onOpenChange(false);
      onSaved?.(classroom);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Edit class" : "Create a class"}
        description={editing ? undefined : "Students join with the code we generate."}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.name.trim().length < 2}>
              {editing ? "Save changes" : "Create class"}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim().length >= 2) save.mutate();
          }}
        >
          <Field label="Class name">{(p) => <Input {...p} value={form.name} onChange={set("name")} placeholder="Physics — Grade 11" maxLength={80} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subject" optional>
              {(p) => <Input {...p} value={form.subject} onChange={set("subject")} placeholder="Physics" />}
            </Field>
            <Field label="Section" optional>
              {(p) => <Input {...p} value={form.section} onChange={set("section")} placeholder="A" />}
            </Field>
          </div>
          <Field label="Description" optional>
            {(p) => <Textarea {...p} rows={3} value={form.description} onChange={set("description")} placeholder="What this class covers" />}
          </Field>
          <Field label="Color">
            <ThemePicker value={form.theme} onChange={(theme) => setForm((f) => ({ ...f, theme }))} />
          </Field>
          <button type="submit" hidden />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinDialog({ open, onOpenChange, initialCode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  useEffect(() => {
    if (open) setCode(initialCode && initialCode !== "1" ? initialCode.toUpperCase() : "");
  }, [open, initialCode]);

  const join = useMutation({
    mutationFn: () => api.post("/classes/join", { code: code.trim() }),
    onSuccess: ({ classroom, alreadyMember }) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(alreadyMember ? `You're already in ${classroom.name}` : `Joined ${classroom.name}`);
      onOpenChange(false);
      navigate(`/app/classes/${classroom.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Join a class"
        description="Enter the code your teacher shared."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => join.mutate()} loading={join.isPending} disabled={code.trim().length < 4}>
              Join class
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4) join.mutate();
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABC2DEF"
            maxLength={12}
            autoCapitalize="characters"
            className="h-14 text-center font-mono text-2xl font-semibold tracking-[0.3em]"
            aria-label="Class code"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClassCard({ c, isTeacher }) {
  const t = classTheme(c.theme);
  return (
    <Link to={`/app/classes/${c.id}`} className="group block rounded-2xl focus-visible:outline-offset-4">
      <Card interactive className="h-full overflow-hidden">
        <div className={cn("relative h-24 bg-linear-to-br p-4", t.band)}>
          <div className="dot-grid absolute inset-0 opacity-30 [--fg:#000]" />
          <div className="relative flex items-start justify-between">
            <span className="rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-medium text-[#16140f] backdrop-blur">{c.subject || "Class"}</span>
            {c.archived ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white">
                <Archive className="size-3" /> Archived
              </span>
            ) : null}
          </div>
        </div>
        <div className="p-4">
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{c.name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">{c.section ? `Section ${c.section} · ` : ""}{isTeacher ? `Code ${c.code}` : c.teacher?.name}</p>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> {plural(c._count.members, "student")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="size-3.5" /> {c._count.assignments}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="size-3.5" /> {c._count.materials}
            </span>
            {!isTeacher && c.teacher ? <Avatar name={c.teacher.name} src={c.teacher.avatarUrl} size="xs" className="ml-auto" /> : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function ClassesPage() {
  const { isTeacher } = useAuth();
  const [params, setParams] = useSearchParams();
  const [archived, setArchived] = useState("active");
  const navigate = useNavigate();

  const createOpen = params.get("new") === "1";
  const joinParam = params.get("join");
  const closeParam = (key) => (open) => {
    if (!open) {
      params.delete(key);
      setParams(params, { replace: true });
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["classes", archived],
    queryFn: () => api.get(`/classes${archived === "archived" ? "?archived=true" : ""}`),
  });
  const classes = data?.classes ?? [];

  const openAction = () => setParams(isTeacher ? { new: "1" } : { join: "1" });

  return (
    <div>
      <PageHeader
        title="Classes"
        description={isTeacher ? "Create classes, share join codes and manage coursework." : "Everything from the classes you've joined."}
        actions={
          <>
            <Segmented
              size="sm"
              value={archived}
              onChange={setArchived}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <Button onClick={openAction}>{isTeacher ? <><Plus /> New class</> : <><KeyRound /> Join class</>}</Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : classes.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <ClassCard key={c.id} c={c} isTeacher={isTeacher} />
          ))}
        </div>
      ) : archived === "archived" ? (
        <EmptyState icon={Archive} title="No archived classes" />
      ) : (
        <EmptyState
          icon={School}
          title={isTeacher ? "Create your first class" : "Join your first class"}
          description={isTeacher ? "You'll get a join code to share with students." : "Ask your teacher for the 7-letter class code."}
          action={<Button onClick={openAction}>{isTeacher ? "New class" : "Enter a code"}</Button>}
        />
      )}

      {isTeacher ? (
        <ClassFormDialog open={createOpen} onOpenChange={closeParam("new")} onSaved={(c) => navigate(`/app/classes/${c.id}`)} />
      ) : (
        <JoinDialog open={Boolean(joinParam)} onOpenChange={closeParam("join")} initialCode={joinParam} />
      )}
    </div>
  );
}

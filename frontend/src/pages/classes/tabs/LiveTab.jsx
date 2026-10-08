import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Clock, Copy, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, dateTime, dueLabel, toLocalInput } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function countdown(ms) {
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  return `in ${Math.round(h / 24)} days`;
}

function ScheduleDialog({ open, onOpenChange, classId }) {
  const qc = useQueryClient();
  const nextHour = () => {
    const d = new Date(Date.now() + 60 * 60_000);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  };
  const [form, setForm] = useState({ title: "", description: "", startsAt: nextHour(), durationMin: 45, meetingUrl: "" });
  useEffect(() => {
    if (open) setForm({ title: "", description: "", startsAt: nextHour(), durationMin: 45, meetingUrl: "" });
  }, [open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => api.post(`/classes/${classId}/sessions`, { ...form, startsAt: new Date(form.startsAt).toISOString(), durationMin: Number(form.durationMin) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", classId, "sessions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Session scheduled — students have been notified");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Schedule a live session"
        description="We'll create a video room automatically, or paste your own Meet/Zoom link."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.title.trim().length < 2 || !form.startsAt}>
              Schedule
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title">{(p) => <Input {...p} value={form.title} onChange={set("title")} placeholder="Doubt-clearing: projectile motion" />}</Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Starts">{(p) => <Input {...p} type="datetime-local" value={form.startsAt} onChange={set("startsAt")} />}</Field>
            <Field label="Length">
              {(p) => (
                <Select {...p} value={form.durationMin} onChange={set("durationMin")}>
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Meeting link" optional hint="Leave empty to auto-create a free Jitsi room.">
            {(p) => <Input {...p} value={form.meetingUrl} onChange={set("meetingUrl")} placeholder="https://meet.google.com/…" />}
          </Field>
          <Field label="Agenda" optional>
            {(p) => <Textarea {...p} rows={3} value={form.description} onChange={set("description")} />}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LiveTab({ classroom, isTeacher }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["class", classroom.id, "sessions"], queryFn: () => api.get(`/classes/${classroom.id}/sessions`) });
  const del = useMutation({
    mutationFn: (id) => api.del(`/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", classroom.id, "sessions"] });
      toast.success("Session cancelled");
    },
  });
  const sessions = data?.sessions ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">Live classes, office hours and doubt-clearing sessions.</p>
        {isTeacher ? (
          <Button onClick={() => setOpen(true)}>
            <CalendarPlus /> Schedule
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : sessions.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.map((s) => {
            const start = new Date(s.startsAt).getTime();
            const end = start + s.durationMin * 60_000;
            const live = now >= start - 10 * 60_000 && now <= end;
            const past = now > end;
            return (
              <Card key={s.id} className={cn("p-5", live && "border-rose-300 dark:border-rose-500/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {live ? (
                        <Badge tone="danger">
                          <span className="size-1.5 animate-pulse rounded-full bg-current" /> Live
                        </Badge>
                      ) : past ? (
                        <Badge>Ended</Badge>
                      ) : (
                        <Badge tone="info">{countdown(start - now)}</Badge>
                      )}
                    </div>
                    <h3 className="mt-3 truncate font-semibold">{s.title}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                      <Clock className="size-3.5" /> {dueLabel(s.startsAt)} · {s.durationMin} min
                    </p>
                    {s.description ? <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">{s.description}</p> : null}
                  </div>
                  {isTeacher ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Cancel session"
                      onClick={async () => {
                        if (await confirm({ title: "Cancel this session?", confirmLabel: "Cancel session", danger: true })) del.mutate(s.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant={live ? "primary" : "secondary"} asChild disabled={past}>
                    <a href={s.meetingUrl} target="_blank" rel="noreferrer">
                      <Video /> {live ? "Join now" : "Open room"}
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard?.writeText(s.meetingUrl);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy /> Copy link
                  </Button>
                </div>
                <p className="sr-only">Starts {dateTime(s.startsAt)}</p>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Video} title="No upcoming sessions" description={isTeacher ? "Schedule one — students get a notification and a join button." : "When your teacher schedules a live class it'll show up here."} action={isTeacher ? <Button onClick={() => setOpen(true)}>Schedule a session</Button> : null} />
      )}
      {isTeacher ? <ScheduleDialog open={open} onOpenChange={setOpen} classId={classroom.id} /> : null}
    </div>
  );
}

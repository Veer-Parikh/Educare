import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CalendarClock, ClipboardList, Megaphone, MoreHorizontal, Paperclip, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, toForm } from "@/lib/api";
import { cn, dueLabel, fromNow } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { FileChip, FileDrop } from "@/components/ui/file-drop";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { Markdown } from "@/components/Markdown";

function Composer({ classId }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [files, setFiles] = useState([]);
  const [attach, setAttach] = useState(false);

  const post = useMutation({
    mutationFn: () => api.upload(`/classes/${classId}/announcements`, toForm({ body, pinned }, { attachments: files })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", classId, "announcements"] });
      setBody("");
      setFiles([]);
      setPinned(false);
      setAttach(false);
      toast.success("Posted to the class");
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Share an update with your class… (Markdown supported)"
          className="border-0 bg-transparent px-1 shadow-none hover:border-0 focus:ring-0"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) post.mutate();
          }}
        />
        {attach ? <FileDrop compact files={files} onChange={setFiles} max={5} className="mt-2" /> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setAttach((a) => !a)}>
              <Paperclip /> Attach
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted">
              <Switch checked={pinned} onCheckedChange={setPinned} /> Pin to top
            </label>
          </div>
          <Button size="sm" onClick={() => post.mutate()} loading={post.isPending} disabled={!body.trim()}>
            Post
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Announcement({ a, isTeacher, classId }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const refresh = () => qc.invalidateQueries({ queryKey: ["class", classId, "announcements"] });
  const pin = useMutation({ mutationFn: () => api.patch(`/announcements/${a.id}`, { pinned: !a.pinned }), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => api.del(`/announcements/${a.id}`), onSuccess: () => { refresh(); toast.success("Announcement deleted"); } });

  return (
    <Card className={cn(a.pinned && "border-brand-300 dark:border-brand-500/40")}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Avatar name={a.author.name} src={a.author.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{a.author.name}</p>
              <span className="text-xs text-faint">{fromNow(a.createdAt)}</span>
              {a.pinned ? (
                <Badge tone="brand">
                  <Pin /> Pinned
                </Badge>
              ) : null}
            </div>
            <Markdown className="mt-2">{a.body}</Markdown>
            {a.attachments.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {a.attachments.map((f) => (
                  <FileChip key={f.key ?? f.url} name={f.name} size={f.size} mime={f.mimeType} url={f.url} />
                ))}
              </ul>
            ) : null}
          </div>
          {isTeacher ? (
            <Menu>
              <MenuTrigger asChild>
                <button className="-mr-2 -mt-1 rounded-lg p-1.5 text-faint hover:bg-subtle hover:text-fg" aria-label="Announcement options">
                  <MoreHorizontal className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={a.pinned ? PinOff : Pin} onSelect={() => pin.mutate()}>
                  {a.pinned ? "Unpin" : "Pin to top"}
                </MenuItem>
                <MenuItem
                  icon={Trash2}
                  danger
                  onSelect={async () => {
                    if (await confirm({ title: "Delete this announcement?", danger: true, confirmLabel: "Delete" })) del.mutate();
                  }}
                >
                  Delete
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Upcoming({ classId }) {
  const assignments = useQuery({ queryKey: ["class", classId, "assignments"], queryFn: () => api.get(`/classes/${classId}/assignments`) });
  const sessions = useQuery({ queryKey: ["class", classId, "sessions"], queryFn: () => api.get(`/classes/${classId}/sessions`) });
  const now = Date.now();
  const due = (assignments.data?.assignments ?? []).filter((a) => a.dueAt && new Date(a.dueAt) > now && (a.myStatus ? a.myStatus === "assigned" : true)).slice(0, 4);
  const live = (sessions.data?.sessions ?? []).slice(0, 2);

  return (
    <Card>
      <CardHeader icon={CalendarClock} title="Upcoming" />
      <CardContent className="space-y-1 pt-3">
        {!due.length && !live.length ? <p className="py-2 text-sm text-muted">Nothing coming up. Enjoy it.</p> : null}
        {live.map((s) => (
          <a key={s.id} href={s.meetingUrl} target="_blank" rel="noreferrer" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-subtle">
            <span className="grid size-8 place-items-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              <CalendarClock className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{s.title}</span>
              <span className="block text-xs text-muted">{dueLabel(s.startsAt)}</span>
            </span>
          </a>
        ))}
        {due.map((a) => (
          <Link key={a.id} to={`/app/assignments/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-subtle">
            <span className="grid size-8 place-items-center rounded-lg bg-subtle text-muted">
              <ClipboardList className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{a.title}</span>
              <span className="block text-xs text-muted">Due {dueLabel(a.dueAt)}</span>
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export function useClassTutor(classroom) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ mode = "explain", prompt } = {}) =>
      api.post("/tutor/conversations", { mode, classroomId: classroom.id, title: `${classroom.name} help` }).then((r) => ({ ...r, prompt })),
    onSuccess: ({ conversation, prompt }) => navigate(`/app/tutor/${conversation.id}${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""}`),
  });
}

export default function StreamTab({ classroom, isTeacher }) {
  const { data, isLoading } = useQuery({
    queryKey: ["class", classroom.id, "announcements"],
    queryFn: () => api.get(`/classes/${classroom.id}/announcements`),
  });
  const tutor = useClassTutor(classroom);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {isTeacher ? <Composer classId={classroom.id} /> : null}
        {isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : data?.announcements?.length ? (
          data.announcements.map((a) => <Announcement key={a.id} a={a} isTeacher={isTeacher} classId={classroom.id} />)
        ) : (
          <EmptyState icon={Megaphone} title="No announcements yet" description={isTeacher ? "Post the first update for your class." : "Your teacher's updates will show up here."} />
        )}
      </div>
      <aside className="space-y-4">
        {classroom.description ? (
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">About</p>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{classroom.description}</p>
            </CardContent>
          </Card>
        ) : null}
        <Card className="ai-surface">
          <CardContent className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-4" /> Class tutor
            </p>
            <p className="mt-1 text-sm text-muted">{isTeacher ? "Preview how the tutor answers using this class's materials." : "Ask anything — answers are grounded in this class's materials."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" loading={tutor.isPending && tutor.variables?.mode !== "socratic"} onClick={() => tutor.mutate({ mode: "explain" })}>
                Ask a question
              </Button>
              <Button size="sm" variant="secondary" loading={tutor.isPending && tutor.variables?.mode === "socratic"} onClick={() => tutor.mutate({ mode: "socratic" })}>
                Guide me
              </Button>
            </div>
          </CardContent>
        </Card>
        <Upcoming classId={classroom.id} />
      </aside>
    </div>
  );
}

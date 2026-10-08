import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  BookOpen,
  Bot,
  Camera,
  Check,
  Compass,
  Copy,
  GraduationCap,
  Lightbulb,
  MessageSquarePlus,
  PanelLeft,
  Paperclip,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl, streamSSE, toForm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCelebrate } from "@/lib/rewards";
import { cn, fromNow } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { Avatar } from "@/components/ui/avatar";
import { Markdown } from "@/components/Markdown";
import { ClassDot } from "@/components/ClassChip";
import { LogoMark } from "@/components/Logo";

const MODES = [
  { value: "explain", label: "Explain", icon: Lightbulb, hint: "Clear step-by-step explanations" },
  { value: "socratic", label: "Socratic", icon: Compass, hint: "Guides you with questions — never just the answer" },
  { value: "exam", label: "Exam prep", icon: GraduationCap, hint: "High-yield, concise, quiz-me style" },
];

const STARTERS = {
  explain: ["Explain photosynthesis like I'm new to biology", "What's the difference between speed and velocity?", "Walk me through solving 2x² − 5x + 2 = 0"],
  socratic: ["Help me figure out why the sky is blue", "I'm stuck on a proof by induction", "Guide me through balancing a chemical equation"],
  exam: ["Quiz me on World War I causes", "Key formulas for kinematics, with traps to avoid", "Top 5 things examiners ask about cell division"],
};

// ---------------------------------------------------------------------------
// Conversation list
// ---------------------------------------------------------------------------

function ConversationList({ activeId, onNew, onPick }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["tutor", "conversations"], queryFn: () => api.get("/tutor/conversations") });
  const del = useMutation({
    mutationFn: (id) => api.del(`/tutor/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["tutor", "conversations"] });
      if (id === activeId) navigate("/app/tutor");
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button className="w-full" onClick={onNew}>
          <MessageSquarePlus /> New chat
        </Button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : data?.conversations?.length ? (
          <ul className="space-y-0.5">
            {data.conversations.map((c) => (
              <li key={c.id} className="group relative">
                <Link
                  to={`/app/tutor/${c.id}`}
                  onClick={onPick}
                  className={cn("block rounded-lg px-3 py-2 pr-9 transition", c.id === activeId ? "bg-surface shadow-soft ring-1 ring-border" : "hover:bg-subtle")}
                >
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                    {c.classroom ? (
                      <>
                        <ClassDot theme={c.classroom.theme} className="size-1.5" /> <span className="truncate">{c.classroom.name}</span> ·
                      </>
                    ) : c.studySetId ? (
                      <>
                        <BookOpen className="size-3" /> Your source ·
                      </>
                    ) : null}
                    <span className="shrink-0">{fromNow(c.updatedAt)}</span>
                  </span>
                </Link>
                <button
                  onClick={async () => {
                    if (await confirm({ title: "Delete this chat?", confirmLabel: "Delete", danger: true })) del.mutate(c.id);
                  }}
                  className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1.5 text-faint hover:bg-surface hover:text-rose-600 group-hover:block"
                  aria-label="Delete chat"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted">No chats yet.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <Tip content={done ? "Copied" : "Copy"}>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }}
        className="rounded-md p-1 text-faint transition hover:bg-subtle hover:text-fg"
        aria-label="Copy message"
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </Tip>
  );
}

function Message({ m, user, streaming }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] space-y-2">
          {m.attachments?.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              {m.attachments.map((a, i) =>
                (a.mimeType ?? a.type)?.startsWith("image/") ? (
                  <img key={i} src={a.preview ?? fileUrl(a.url)} alt={a.name} className="max-h-48 rounded-xl border border-border object-cover" />
                ) : (
                  <span key={i} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
                    {a.name}
                  </span>
                ),
              )}
            </div>
          ) : null}
          {m.content ? <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-on-ink">{m.content}</div> : null}
        </div>
        <Avatar name={user?.name} src={user?.avatarUrl} size="sm" className="mt-0.5 hidden sm:inline-grid" />
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-[#16140f]">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {m.content ? (
          <Markdown className={cn(streaming && "[&>*:last-child]:after:ml-0.5 [&>*:last-child]:after:inline-block [&>*:last-child]:after:h-4 [&>*:last-child]:after:w-1.5 [&>*:last-child]:after:animate-pulse [&>*:last-child]:after:rounded-sm [&>*:last-child]:after:bg-brand-500 [&>*:last-child]:after:align-middle [&>*:last-child]:after:content-['']")}>
            {m.content}
          </Markdown>
        ) : (
          <div className="flex h-8 items-center gap-1.5" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
        {!streaming && m.content ? (
          <div className="mt-1 flex opacity-0 transition group-hover:opacity-100">
            <CopyButton text={m.content} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({ onSend, onStop, streaming, initial = "" }) {
  const [text, setText] = useState(initial);
  const [files, setFiles] = useState([]);
  const ref = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => setText(initial), [initial]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const add = (list) => {
    const next = [...files, ...[...list].filter((f) => /^image\/|pdf$/.test(f.type) && f.size < 15 * 1024 * 1024)].slice(0, 3);
    setFiles(next.map((f) => Object.assign(f, { preview: f.preview ?? (f.type.startsWith("image/") ? URL.createObjectURL(f) : null) })));
  };
  const send = () => {
    if (streaming || (!text.trim() && !files.length)) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
  };

  return (
    <div
      className="rounded-2xl border border-border bg-surface shadow-soft transition focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/15"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (imgs.length) add(imgs);
      }}
    >
      {files.length ? (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((f, i) => (
            <span key={i} className="relative">
              {f.preview ? <img src={f.preview} alt="" className="size-16 rounded-lg border border-border object-cover" /> : <span className="grid h-16 w-28 place-items-center rounded-lg border border-border bg-surface-2 px-2 text-center text-xs">{f.name}</span>}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-on-ink" aria-label="Remove attachment">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Ask anything, or attach a photo of the problem…"
        className="block max-h-56 w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-relaxed outline-none placeholder:text-faint"
        aria-label="Message the tutor"
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
        <div className="flex items-center gap-1">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <Tip content="Attach image or PDF">
            <Button variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} aria-label="Attach file">
              <Paperclip />
            </Button>
          </Tip>
          <Tip content="Take a photo">
            <Button variant="ghost" size="icon-sm" onClick={() => cameraRef.current?.click()} aria-label="Take a photo" className="sm:hidden">
              <Camera />
            </Button>
          </Tip>
          <span className="hidden text-xs text-faint sm:inline">Shift + Enter for a new line</span>
        </div>
        {streaming ? (
          <Button size="icon-sm" variant="ink" onClick={onStop} aria-label="Stop generating">
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button size="icon-sm" onClick={send} disabled={!text.trim() && !files.length} aria-label="Send">
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TutorPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const celebrate = useCelebrate();
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState("explain");
  const [classroomId, setClassroomId] = useState("");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreamingState] = useState(false);
  const streamingRef = useRef(false);
  const setStreaming = (v) => {
    streamingRef.current = v;
    setStreamingState(v);
  };
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const pendingSend = useRef(null);
  const prefill = params.get("prompt") ?? "";

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api.get("/classes") });
  const convo = useQuery({ queryKey: ["tutor", "conversation", id], queryFn: () => api.get(`/tutor/conversations/${id}`), enabled: Boolean(id) });
  const conversation = convo.data?.conversation;

  // Sync from the server, but never clobber a reply that's still streaming in.
  useEffect(() => {
    if (convo.data && !streamingRef.current) {
      setMessages(convo.data.messages);
      setMode(convo.data.conversation.mode);
    }
  }, [convo.data]);
  useEffect(() => {
    if (!id) setMessages([]);
  }, [id]);

  // ?new=1 from elsewhere in the app → fresh chat (keeping any ?prompt=).
  useEffect(() => {
    if (params.get("new") && id) navigate(`/app/tutor${prefill ? `?prompt=${encodeURIComponent(prefill)}` : ""}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoscroll unless the user has scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const updateMode = useMutation({ mutationFn: (m) => api.patch(`/tutor/conversations/${id}`, { mode: m }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tutor", "conversations"] }) });

  const stream = useCallback(
    async (conversationId, text, files) => {
      const localId = `local-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: localId, role: "user", content: text, attachments: files.map((f) => ({ name: f.name, type: f.type, mimeType: f.type, preview: f.preview })) },
        { id: `${localId}-reply`, role: "model", content: "" },
      ]);
      setStreaming(true);
      stickRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamSSE(`/tutor/conversations/${conversationId}/messages`, toForm({ content: text }, { attachments: files }), {
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === "delta") setMessages((m) => m.map((x) => (x.id === `${localId}-reply` ? { ...x, content: x.content + data.text } : x)));
            else if (event === "done") {
              setMessages((m) => m.map((x) => (x.id === `${localId}-reply` ? data.message : x)));
              if (data.reward?.xp) celebrate(data.reward, "tutor");
            } else if (event === "error") {
              toast.error(data.error);
              setMessages((m) => m.map((x) => (x.id === `${localId}-reply` ? { ...x, content: x.content || "_Sorry — I couldn't finish that answer. Please try again._" } : x)));
            }
          },
        });
      } catch (err) {
        toast.error(err.message);
        setMessages((m) => m.filter((x) => x.id !== `${localId}-reply` || x.content));
      } finally {
        setStreaming(false);
        abortRef.current = null;
        qc.invalidateQueries({ queryKey: ["tutor", "conversations"] });
        qc.invalidateQueries({ queryKey: ["tutor", "conversation", conversationId] });
      }
    },
    [qc, celebrate],
  );

  // Send a message queued before the conversation existed (first message of a new chat).
  useEffect(() => {
    if (id && pendingSend.current && convo.data) {
      const { text, files } = pendingSend.current;
      pendingSend.current = null;
      stream(id, text, files);
    }
  }, [id, convo.data, stream]);

  const send = async (text, files) => {
    if (prefill) {
      params.delete("prompt");
      setParams(params, { replace: true });
    }
    if (id) return stream(id, text, files);
    try {
      const { conversation: c } = await api.post("/tutor/conversations", { mode, classroomId: classroomId || null });
      pendingSend.current = { text, files };
      qc.invalidateQueries({ queryKey: ["tutor", "conversations"] });
      navigate(`/app/tutor/${c.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const newChat = () => {
    navigate("/app/tutor");
    setListOpen(false);
  };

  const context = conversation?.classroom ? (
    <span className="inline-flex items-center gap-1.5">
      <ClassDot theme={conversation.classroom.theme} /> Using {conversation.classroom.name} materials
    </span>
  ) : conversation?.studySet ? (
    <span className="inline-flex items-center gap-1.5">
      <BookOpen className="size-3.5" /> Grounded in “{conversation.studySet.title}”
    </span>
  ) : null;

  const empty = !id || (!convo.isLoading && messages.length === 0);

  return (
    <div className="flex h-[calc(100dvh-4rem)]">
      <aside className={cn("w-72 shrink-0 border-r border-border bg-surface-2/60", listOpen ? "fixed bottom-0 left-0 top-16 z-40 block shadow-lift lg:static lg:shadow-none" : "hidden lg:block")}>
        <ConversationList activeId={id} onNew={newChat} onPick={() => setListOpen(false)} />
      </aside>
      {listOpen ? <button className="fixed inset-0 top-16 z-30 bg-black/30 lg:hidden" onClick={() => setListOpen(false)} aria-label="Close chat list" /> : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setListOpen(true)} aria-label="Show chats">
            <PanelLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{conversation?.title ?? "New chat"}</p>
            {context ? <p className="truncate text-xs text-muted">{context}</p> : null}
          </div>
          <Segmented
            size="sm"
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (id) updateMode.mutate(m);
            }}
            options={MODES.map(({ value, label, icon, hint }) => ({ value, label, icon, hint }))}
            className="hidden sm:inline-flex"
          />
        </div>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="scroll-thin flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {id && convo.isLoading ? (
              <div className="space-y-6">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-28 w-5/6 rounded-2xl" />
              </div>
            ) : empty ? (
              <div className="flex flex-col items-center pt-6 text-center sm:pt-14">
                <LogoMark className="size-12" />
                <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">What are we learning today?</h1>
                <p className="mt-2 max-w-md text-sm text-muted">{MODES.find((m) => m.value === mode)?.hint}. Attach a photo of a problem or your notes anytime.</p>

                <Segmented size="sm" value={mode} onChange={setMode} options={MODES} className="mt-6 sm:hidden" />

                {!id && classes.data?.classes?.length ? (
                  <div className="mt-6 flex w-full max-w-sm items-center gap-2">
                    <BookOpen className="size-4 shrink-0 text-muted" />
                    <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="flex-1" aria-label="Ground answers in a class">
                      <option value="">General knowledge</option>
                      {classes.data.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          Use {c.name} materials
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="mt-8 grid w-full gap-2 sm:grid-cols-3">
                  {STARTERS[mode].map((s) => (
                    <button key={s} onClick={() => send(s, [])} className="rounded-xl border border-border bg-surface p-3 text-left text-sm text-muted shadow-soft transition hover:border-border-strong hover:text-fg">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7">
                {messages.map((m, i) => (
                  <Message key={m.id} m={m} user={user} streaming={streaming && i === messages.length - 1 && m.role === "model"} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
          <div className="mx-auto max-w-3xl">
            <Composer onSend={send} onStop={() => abortRef.current?.abort()} streaming={streaming} initial={prefill} />
            <p className="mt-2 text-center text-[11px] text-faint">The tutor can make mistakes — check important facts against your materials.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

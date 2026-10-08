import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BookA,
  Check,
  Copy,
  Eye,
  EyeOff,
  Info,
  Layers,
  Library,
  Lightbulb,
  ListChecks,
  ListOrdered,
  MessagesSquare,
  Play,
  Printer,
  RotateCcw,
  ScrollText,
  Sprout,
  Target,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, plural, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { AiTag } from "@/components/AiWorking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { copyText, discussPrompt, packToMarkdown, readingMinutes, SIMPLE_PROMPT, sourceMeta, useStudyChat } from "./shared";

// The app shell's sidebar and top bar aren't marked .no-print, so hide them
// (and the page padding) while this page is printed.
const PRINT_CSS = `
@media print {
  :has(> main):has(.studio-print) > :not(main),
  :has(> * > main):has(.studio-print) > :not(:has(> main)) { display: none !important; }
  main:has(.studio-print) { padding: 0 !important; max-width: none !important; }
  .studio-print .shadow-soft { box-shadow: none !important; }
  .studio-print .avoid-break { break-inside: avoid; }
}`;

export default function StudySetPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["studySet", id], queryFn: () => api.get(`/studio/${id}`) });

  if (q.isLoading) return <SetSkeleton />;
  if (q.isError) return <Unavailable error={q.error} onRetry={() => q.refetch()} />;
  return <StudySetView data={q.data} />;
}

function StudySetView({ data }) {
  const { studySet: set, deck, quiz } = data;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const chat = useStudyChat(set);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const remove = useMutation({
    mutationFn: () => api.del(`/studio/${set.id}`),
    onSuccess: () => {
      toast.success("Study pack deleted");
      qc.setQueryData(["studio"], (old) => (old ? { ...old, studySets: old.studySets.filter((s) => s.id !== set.id) } : old));
      qc.invalidateQueries({ queryKey: ["studio"] });
      navigate("/app/studio", { replace: true });
      setTimeout(() => qc.removeQueries({ queryKey: ["studySet", set.id] }), 0);
    },
  });

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this study pack?",
      description: "The summary, key points and glossary will be removed. Its flashcard deck and quiz stay in your library.",
      confirmLabel: "Delete pack",
      danger: true,
    });
    if (ok) remove.mutate();
  };

  const onCopy = async () => {
    if (await copyText(packToMarkdown(set))) {
      setCopied(true);
      toast.success("Copied as Markdown");
    } else {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const meta = sourceMeta(set.sourceType, set.sourceName);
  const SourceIcon = meta.icon;
  const keyPoints = set.keyPoints ?? [];
  const concepts = set.concepts ?? [];
  const questions = set.questionsToPonder ?? [];
  const minutes = readingMinutes(set.summary);

  const sections = [
    set.summary && { id: "summary", label: "Summary", meta: `${minutes} min` },
    keyPoints.length && { id: "key-points", label: plural(keyPoints.length, "key point") },
    concepts.length && { id: "glossary", label: plural(concepts.length, "term") },
    questions.length && { id: "questions", label: plural(questions.length, "question") },
  ].filter(Boolean);

  const chatHint = set.hasSource
    ? "Answers are grounded in your original source."
    : set.sourceType === "topic"
      ? "This pack was made from a topic, so the tutor works from its summary."
      : "The original wasn't stored as text, so the tutor works from this pack's summary.";

  return (
    <div className="studio-print">
      <style>{PRINT_CSS}</style>

      <PageHeader
        back={{ to: "/app/studio", label: "Study Studio" }}
        className="print:mb-4 print:[&_a]:hidden"
        eyebrow={
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted">
            <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium", meta.tone)}>
              <SourceIcon className="size-3.5" />
              {meta.kind}
            </span>
            {set.sourceName && set.sourceType !== "topic" ? (
              <span className="max-w-[18rem] truncate" title={set.sourceName}>
                {set.sourceName}
              </span>
            ) : null}
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span>{shortDate(set.createdAt)}</span>
          </div>
        }
        title={set.title}
      >
        {sections.length > 1 ? (
          <nav aria-label="Sections" className="no-print mt-4 flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                {s.label}
                {s.meta ? <span className="text-faint">· {s.meta}</span> : null}
              </a>
            ))}
          </nav>
        ) : null}
      </PageHeader>

      {/* Quick actions on small screens — the full rail sits below the content. */}
      <div className="no-print -mx-4 -mt-2 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 lg:hidden">
        {deck ? (
          <Button asChild size="sm">
            <Link to={`/app/review?deck=${deck.id}`}>
              <Layers /> Flashcards
            </Link>
          </Button>
        ) : null}
        {quiz ? (
          <Button asChild size="sm" variant="secondary">
            <Link to={`/app/quizzes/${quiz.id}`}>
              <ListChecks /> Quiz
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" loading={chat.busyKey === "chat"} disabled={chat.pending} onClick={() => chat.start({ key: "chat" })}>
          {chat.busyKey === "chat" ? null : <MessagesSquare />} Chat
        </Button>
        <Button size="sm" variant="secondary" loading={chat.busyKey === "simple"} disabled={chat.pending} onClick={() => chat.start({ key: "simple", prompt: SIMPLE_PROMPT })}>
          {chat.busyKey === "simple" ? null : <Sprout />} Explain simply
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-9">
          {set.summary ? (
            <Section id="summary" icon={ScrollText} title="Summary" meta={`${minutes} min read`}>
              <Card className="print-area p-5 sm:p-7 print:p-0">
                <Markdown className="max-w-[72ch] text-[15.5px] leading-[1.75] sm:text-base">{set.summary}</Markdown>
              </Card>
            </Section>
          ) : null}

          {keyPoints.length ? (
            <Section id="key-points" icon={ListOrdered} title="Key points" meta={plural(keyPoints.length, "takeaway")}>
              <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
                {keyPoints.map((p, i) => (
                  <li key={i} className="avoid-break flex gap-3.5 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4">
                    <span className="w-7 shrink-0 font-display text-xl font-semibold leading-7 tabular-nums text-brand-600 sm:w-8 sm:text-[1.35rem] dark:text-brand-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Rich className="min-w-0 flex-1 text-[15px] leading-7 text-fg">{p}</Rich>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {concepts.length ? <Glossary concepts={concepts} /> : null}

          {questions.length ? (
            <Section id="questions" icon={Lightbulb} title="Questions to ponder" meta="No single right answer">
              <ul className="space-y-3">
                {questions.map((question, i) => (
                  <li key={i} className="avoid-break flex gap-3.5 rounded-2xl border border-border bg-surface p-4 shadow-soft sm:p-5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-subtle font-display text-sm font-semibold text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Rich className="text-[15px] font-medium leading-7 text-fg">{question}</Rich>
                      <Button
                        variant="soft"
                        size="xs"
                        className="no-print mt-2.5"
                        loading={chat.busyKey === `q${i}`}
                        disabled={chat.pending}
                        onClick={() => chat.start({ key: `q${i}`, mode: "socratic", prompt: discussPrompt(question) })}
                      >
                        {chat.busyKey === `q${i}` ? null : <MessagesSquare />} Think it through with the tutor
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <p className="print-only text-xs text-muted">Study pack made with EduCare Study Studio · {shortDate(set.createdAt)}</p>
        </div>

        {/* ---- Rail ---------------------------------------------------- */}
        <aside className="no-print space-y-4 lg:top-20 lg:[@media(min-height:52rem)]:sticky" aria-label="Study actions">
          <Card className="p-4 sm:p-5">
            <RailTitle>Practise</RailTitle>
            <div className="mt-3 space-y-2.5">
              <PracticeTile
                icon={Layers}
                tone="bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300"
                title="Flashcards"
                meta={deck ? `${plural(deck._count?.cards ?? 0, "card")} · spaced repetition` : "No deck was made for this pack"}
              >
                {deck ? (
                  <div className="mt-3 flex flex-col gap-1">
                    <Button asChild className="w-full">
                      <Link to={`/app/review?deck=${deck.id}`}>
                        <Play /> Study flashcards
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="w-full text-muted hover:text-fg">
                      <Link to={`/app/flashcards/${deck.id}`}>
                        Open deck <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </PracticeTile>
              <PracticeTile
                icon={ListChecks}
                tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                title="Quiz"
                meta={quiz ? `${plural(quiz.questionCount, "question")} · instant feedback` : "No quiz was made for this pack"}
              >
                {quiz ? (
                  <Button asChild variant="secondary" className="mt-3 w-full">
                    <Link to={`/app/quizzes/${quiz.id}`}>
                      <Target /> Take the quiz
                    </Link>
                  </Button>
                ) : null}
              </PracticeTile>
            </div>
          </Card>

          <Card className="ai-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <RailTitle>Ask the tutor</RailTitle>
              <AiTag />
            </div>
            <p className="mt-2 text-sm text-muted">Ask follow-ups, get fresh examples, or check your understanding.</p>
            <div className="mt-3.5 space-y-2">
              <Button variant="ink" className="w-full" loading={chat.busyKey === "chat"} disabled={chat.pending} onClick={() => chat.start({ key: "chat" })}>
                {chat.busyKey === "chat" ? null : <MessagesSquare />} Chat with this source
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                loading={chat.busyKey === "simple"}
                disabled={chat.pending}
                onClick={() => chat.start({ key: "simple", prompt: SIMPLE_PROMPT })}
              >
                {chat.busyKey === "simple" ? null : <Sprout />} Explain it simply
              </Button>
            </div>
            <p className="mt-3 flex gap-1.5 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {chatHint}
            </p>
          </Card>

          <Card className="p-1.5">
            <RailAction icon={copied ? Check : Copy} onClick={onCopy}>
              {copied ? "Copied!" : "Copy as Markdown"}
            </RailAction>
            <RailAction icon={Printer} onClick={() => window.print()}>
              Print or save as PDF
            </RailAction>
            <div className="mx-2.5 my-1 h-px bg-border" />
            <RailAction icon={Trash2} danger disabled={remove.isPending} onClick={onDelete}>
              {remove.isPending ? "Deleting…" : "Delete pack"}
            </RailAction>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---- Sections ------------------------------------------------------------

function Section({ id, icon: Icon, title, meta, action, children }) {
  return (
    <section id={id} className="scroll-mt-20" aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-800 print:hidden dark:bg-brand-500/15 dark:text-brand-300">
          <Icon className="size-4" />
        </span>
        <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-tight">
          {title}
        </h2>
        {meta ? <span className="text-xs text-faint">{meta}</span> : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Short AI text: plain when it's plain, Markdown (bold, math…) when it isn't. */
function Rich({ children, className }) {
  const text = String(children ?? "");
  if (!/[$*_`\\[]/.test(text)) return <p className={className}>{text}</p>;
  return <Markdown className={cn("[&_p]:my-0", className)}>{text}</Markdown>;
}

function Glossary({ concepts }) {
  const [revealed, setRevealed] = useState(() => new Set());
  const allShown = revealed.size === concepts.length;

  const toggle = (i) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const setAll = (on) => setRevealed(on ? new Set(concepts.map((_, i) => i)) : new Set());

  return (
    <Section
      id="glossary"
      icon={BookA}
      title="Glossary"
      meta={plural(concepts.length, "term")}
      action={
        <label className="no-print inline-flex cursor-pointer items-center gap-2.5 text-sm text-muted">
          <span className="tabular-nums text-xs text-faint">
            {revealed.size}/{concepts.length}
          </span>
          Show all
          <Switch checked={allShown} onCheckedChange={setAll} aria-label="Show all definitions" />
        </label>
      }
    >
      <p className="no-print -mt-1 mb-3 text-sm text-muted">Quiz yourself — recall each definition, then tap the card to check.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {concepts.map((c, i) => (
          <TermCard key={`${c.term}-${i}`} term={c.term} definition={c.definition} revealed={revealed.has(i)} onToggle={() => toggle(i)} />
        ))}
      </div>
    </Section>
  );
}

function TermCard({ term, definition, revealed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={revealed}
      className={cn(
        "avoid-break group relative flex h-full flex-col rounded-2xl border p-4 text-left transition-[background,border-color,box-shadow,transform] duration-200",
        revealed
          ? "border-brand-300 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/[0.07]"
          : "border-border bg-surface shadow-soft hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift",
        "print:border-border print:bg-transparent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Rich className="font-semibold leading-snug tracking-tight text-fg">{term}</Rich>
        <span className={cn("no-print mt-0.5 shrink-0 transition-colors", revealed ? "text-brand-700 dark:text-brand-400" : "text-faint group-hover:text-muted")}>
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </span>
      </div>
      <div className="relative mt-2 flex-1">
        <div
          aria-hidden={!revealed}
          className={cn(
            "transition-[filter,opacity] duration-300 print:opacity-100 print:filter-none",
            revealed ? "opacity-100" : "select-none opacity-50 blur-[6px]",
          )}
        >
          <Rich className="text-sm leading-relaxed text-muted">{definition}</Rich>
        </div>
        <span
          className={cn(
            "no-print pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-200",
            revealed ? "opacity-0" : "opacity-100",
          )}
        >
          <span className="rounded-full border border-border bg-surface/95 px-2.5 py-1 text-xs font-medium text-fg shadow-soft">Tap to reveal</span>
        </span>
      </div>
    </button>
  );
}

// ---- Rail bits -------------------------------------------------------------

function RailTitle({ children }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">{children}</h2>;
}

function PracticeTile({ icon: Icon, tone, title, meta, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tone)}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted">{meta}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function RailAction({ icon: Icon, danger, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50",
        danger ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10" : "text-fg hover:bg-subtle",
      )}
      {...props}
    >
      <Icon className="size-4 opacity-70" />
      {children}
    </button>
  );
}

// ---- Loading / error -----------------------------------------------------

function SetSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading study pack">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-6 w-36 rounded-full" />
      <Skeleton className="mt-3 h-8 w-3/4 max-w-xl" />
      <div className="mt-4 flex gap-1.5">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Card className="space-y-3 p-6">
            {["w-full", "w-11/12", "w-full", "w-4/5", "w-10/12", "w-3/5"].map((w) => (
              <Skeleton key={w} className={cn("h-3.5", w)} />
            ))}
          </Card>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function Unavailable({ error, onRetry }) {
  const gone = [400, 403, 404].includes(error?.status);
  return (
    <div>
      <PageHeader back={{ to: "/app/studio", label: "Study Studio" }} title="Study pack" />
      <EmptyState
        icon={gone ? Library : RotateCcw}
        title={gone ? "This study pack isn't here" : "Couldn't load this study pack"}
        description={gone ? "It may have been deleted, or it belongs to another account." : error?.message}
        action={
          gone ? (
            <Button asChild variant="secondary">
              <Link to="/app/studio">Back to Study Studio</Link>
            </Button>
          ) : (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    </div>
  );
}

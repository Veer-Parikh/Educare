import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight,
  BookA,
  Ellipsis,
  FileText,
  Image,
  Layers,
  Library,
  Lightbulb,
  ListChecks,
  ListOrdered,
  MessagesSquare,
  Minus,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, toForm } from "@/lib/api";
import { cn, fromNow, plural } from "@/lib/utils";
import { useCelebrate } from "@/lib/rewards";
import { AiTag, AiWorking } from "@/components/AiWorking";
import { EMPTY_SOURCE, SourcePicker, sourcePayload, sourceReady } from "@/components/SourcePicker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { sourceLabel, sourceMeta } from "./shared";

const OUTPUTS = [
  { icon: ScrollText, label: "Summary" },
  { icon: ListOrdered, label: "Key points" },
  { icon: BookA, label: "Glossary" },
  { icon: Lightbulb, label: "Questions to ponder" },
  { icon: Layers, label: "Flashcard deck" },
  { icon: ListChecks, label: "Quiz" },
  { icon: MessagesSquare, label: "Chat with your source" },
];

const LEVELS = ["Middle school", "Grade 10", "High school senior", "First-year university", "Postgraduate"];
const EXAMPLE_TOPICS = ["Photosynthesis", "The French Revolution", "Supply and demand", "Binary search trees", "Mitosis vs. meiosis"];

export default function StudioPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const celebrate = useCelebrate();
  const createRef = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [source, setSource] = useState(EMPTY_SOURCE);
  const [level, setLevel] = useState("");
  const [makeDeck, setMakeDeck] = useState(true);
  const [cardCount, setCardCount] = useState(12);
  const [makeQuiz, setMakeQuiz] = useState(true);
  const [quizCount, setQuizCount] = useState(6);

  const create = useMutation({
    mutationFn: () => {
      const { fields, files } = sourcePayload(source);
      const form = toForm({ ...fields, level: level.trim() || undefined, makeDeck, makeQuiz, cardCount, quizCount }, files);
      return api.upload("/studio", form);
    },
    onSuccess: ({ studySet, warnings, reward }) => {
      celebrate(reward, "study pack");
      for (const w of warnings ?? []) toast.warning(w);
      for (const key of [["studio"], ["dashboard"], ...(studySet.deckId ? [["decks"], ["review"]] : []), ...(studySet.quizId ? [["quizzes"]] : [])]) {
        qc.invalidateQueries({ queryKey: key });
      }
      const to = `/app/studio/${studySet.id}`;
      // Generation is slow — if the learner wandered off meanwhile, don't yank them back.
      if (mounted.current) navigate(to);
      else toast.success(`“${studySet.title}” is ready`, { action: { label: "Open", onClick: () => navigate(to) } });
    },
  });

  const ready = sourceReady(source);
  const submit = (e) => {
    e?.preventDefault();
    if (!ready || create.isPending) return;
    create.mutate();
    createRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const focusCreate = () => {
    createRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => createRef.current?.querySelector("input, textarea")?.focus({ preventScroll: true }), 400);
  };

  const steps = [
    "Reading your source",
    "Writing the summary",
    "Pulling out key points and terms",
    makeDeck && "Building flashcards",
    makeQuiz && "Writing quiz questions",
    "Putting your pack together",
  ].filter(Boolean);

  const youGet = ["a summary", "key points", "a glossary", "questions to ponder", makeDeck && `${cardCount} flashcards`, makeQuiz && `a ${quizCount}-question quiz`].filter(Boolean);

  return (
    <div>
      <Hero onStart={focusCreate} />

      {/* ---- Create ---------------------------------------------------- */}
      <section ref={createRef} className="mt-6 scroll-mt-24 sm:mt-8" aria-label="Create a study pack">
        {create.isPending ? (
          <div>
            <AiWorking title="Building your study pack…" steps={steps} className="min-h-[360px]" />
            <p className="mt-3 text-center text-xs text-muted">Usually 15–40 seconds. Everything is written in parallel — keep this tab open.</p>
          </div>
        ) : (
          <Card className="overflow-hidden">
            <form onSubmit={submit} className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="p-5 sm:p-6">
                <StepTitle n={1} title="Add a source" description="A topic, your own notes, a class material or a file — PDFs, docs and photos of handwriting all work." />
                <div className="mt-5">
                  <SourcePicker value={source} onChange={setSource} />
                </div>
                {source.source === "topic" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 text-xs text-faint">Try</span>
                    {EXAMPLE_TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSource({ ...source, topic: t })}
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors",
                          source.topic === t ? "border-brand-400 bg-brand-100 text-brand-900 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-5 border-t border-border bg-surface-2/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
                <StepTitle n={2} title="Tune your pack" />

                <Field label="Learner level" optional hint="We'll pitch the language and depth to match.">
                  {(p) => (
                    <>
                      <Input {...p} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. Grade 10, first-year university" maxLength={60} />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {LEVELS.map((l) => (
                          <button
                            key={l}
                            type="button"
                            aria-pressed={level === l}
                            onClick={() => setLevel(level === l ? "" : l)}
                            className={cn(
                              "h-6 rounded-full border px-2 text-[11px] font-medium transition-colors",
                              level === l
                                ? "border-brand-400 bg-brand-100 text-brand-900 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
                                : "border-border bg-surface text-muted hover:text-fg",
                            )}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </Field>

                <div className="space-y-2.5">
                  <OptionRow icon={Layers} title="Make flashcards" description="A spaced-repetition deck" checked={makeDeck} onCheckedChange={setMakeDeck}>
                    <span className="text-xs text-muted">Cards</span>
                    <Stepper label="flashcards" value={cardCount} onChange={setCardCount} min={4} max={40} step={2} />
                  </OptionRow>
                  <OptionRow icon={ListChecks} title="Make a quiz" description="Multiple choice and true/false" checked={makeQuiz} onCheckedChange={setMakeQuiz}>
                    <span className="text-xs text-muted">Questions</span>
                    <Stepper label="quiz questions" value={quizCount} onChange={setQuizCount} min={3} max={20} />
                  </OptionRow>
                </div>

                <div className="mt-auto space-y-3 pt-1">
                  <p className="text-xs leading-relaxed text-muted">
                    <span className="font-medium text-fg">You'll get</span> {youGet.slice(0, -1).join(", ")} and {youGet.at(-1)}.
                  </p>
                  <Button type="submit" size="lg" className="w-full" disabled={!ready}>
                    <Sparkles /> Create study pack
                  </Button>
                  {!ready ? <p className="text-center text-xs text-faint">{readyHint(source)}</p> : null}
                </div>
              </div>
            </form>
          </Card>
        )}
      </section>

      <StudySets onStart={focusCreate} />
    </div>
  );
}

function readyHint(v) {
  if (v.source === "topic") return "Name a topic to get started.";
  if (v.source === "text") return "Paste at least a few sentences.";
  if (v.source === "material") return "Pick a class material.";
  return "Attach a file to continue.";
}

// ---- Hero ------------------------------------------------------------------

function Hero({ onStart }) {
  return (
    <section className="ai-surface relative overflow-hidden rounded-3xl border border-border px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_80%_at_85%_40%,black,transparent)]" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <AiTag>Study Studio</AiTag>
          <h1 className="mt-4 text-balance font-display text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-[2.6rem]">
            Turn any source into a{" "}
            <span className="relative whitespace-nowrap">
              <span className="relative z-10">study pack</span>
              <span className="absolute inset-x-[-0.1em] bottom-[0.08em] h-[0.38em] rounded-sm bg-brand-400/70 dark:bg-brand-500/40" />
            </span>
            .
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted sm:text-base">
            Drop in your notes, a PDF, a photo of the whiteboard — or just name a topic. In under a minute you'll have a summary, key points, a glossary, questions to
            ponder, a flashcard deck and a quiz. Then chat with your source whenever something doesn't click.
          </p>
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {OUTPUTS.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 text-xs font-medium text-fg backdrop-blur">
                <Icon className="size-3.5 text-brand-700 dark:text-brand-400" />
                {label}
              </li>
            ))}
          </ul>
          <Button variant="link" className="mt-5 lg:hidden" onClick={onStart}>
            Start with a source <ArrowRight />
          </Button>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  const enter = (delay, from = {}) => ({
    initial: { opacity: 0, y: 10, ...from },
    animate: { opacity: 1, y: 0, x: 0 },
    transition: { duration: 0.5, delay, ease: [0.2, 0.8, 0.2, 1] },
  });
  return (
    <div aria-hidden="true" className="relative mx-auto hidden h-[300px] w-full max-w-[440px] select-none lg:block">
      {/* Sources flowing in */}
      <motion.div {...enter(0.05, { x: -12 })} className="absolute left-0 top-5">
        <SourceChip icon={FileText} label="lecture-notes.pdf" />
      </motion.div>
      <motion.div {...enter(0.15, { x: -12 })} className="absolute left-7 top-[70px]">
        <SourceChip icon={Image} label="whiteboard.jpg" />
      </motion.div>
      <motion.div {...enter(0.25, { x: -12 })} className="absolute left-1 top-[122px]">
        <SourceChip icon={Lightbulb} label="Photosynthesis" />
      </motion.div>

      {/* The pack */}
      <motion.div {...enter(0.2)} className="absolute right-0 top-0 w-[252px] rotate-[1.5deg] rounded-2xl border border-border bg-surface p-4 shadow-lift">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-brand-500 text-[#16140f]">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Photosynthesis</span>
        </div>
        <p className="mt-3.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Summary</p>
        <div className="mt-1.5 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-subtle" />
          <div className="h-1.5 w-11/12 rounded-full bg-subtle" />
          <div className="h-1.5 w-4/5 rounded-full bg-subtle" />
        </div>
        <p className="mt-3.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Key points</p>
        <ol className="mt-1.5 space-y-1.5">
          {[88, 72, 80].map((w, i) => (
            <li key={w} className="flex items-center gap-2">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-brand-100 text-[9px] font-bold text-brand-900 dark:bg-brand-500/20 dark:text-brand-200">{i + 1}</span>
              <span className="h-1.5 rounded-full bg-subtle" style={{ width: `${w}%` }} />
            </li>
          ))}
        </ol>
        <div className="mt-3.5 flex flex-wrap gap-1">
          {["Chlorophyll", "Stomata", "ATP", "Calvin cycle"].map((t) => (
            <span key={t} className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {t}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Flashcard */}
      <motion.div {...enter(0.4)} className="absolute bottom-1 left-9">
        <div className="w-[208px] -rotate-6 animate-float rounded-2xl border border-border bg-surface p-4 shadow-lift">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Flashcard · 1 of 12</p>
          <p className="mt-2 text-sm font-medium leading-snug">Which pigment captures light energy in plants?</p>
          <p className="mt-3 text-[11px] text-faint">Tap to flip</p>
        </div>
      </motion.div>

      {/* Quiz */}
      <motion.div {...enter(0.55)} className="absolute bottom-6 right-3 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-on-ink shadow-lift">
        <ListChecks className="size-4 text-brand-400 dark:text-brand-600" /> Quiz · 6 questions
      </motion.div>
    </div>
  );
}

function SourceChip({ icon: Icon, label }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface/90 pl-1 pr-3 text-xs font-medium shadow-soft backdrop-blur">
      <span className="grid size-6 place-items-center rounded-full bg-subtle text-muted">
        <Icon className="size-3.5" />
      </span>
      {label}
    </span>
  );
}

// ---- Form bits ---------------------------------------------------------------

function StepTitle({ n, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-on-ink">{n}</span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-6 tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

function OptionRow({ icon: Icon, title, description, checked, onCheckedChange, children }) {
  const id = useId();
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        checked ? "border-brand-300 bg-brand-50/70 dark:border-brand-500/30 dark:bg-brand-500/[0.06]" : "border-border bg-surface",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors", checked ? "bg-brand-500 text-[#16140f]" : "bg-subtle text-muted")}>
          <Icon className="size-4" />
        </span>
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted">{description}</span>
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked ? <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-brand-200/70 pt-2.5 dark:border-brand-500/15">{children}</div> : null}
    </div>
  );
}

/** Compact −/+ number control; typing is committed (and clamped) on blur. */
function Stepper({ value, onChange, min, max, step = 1, label }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const commit = () => {
    const n = Number.parseInt(draft, 10);
    const next = Number.isFinite(n) ? clamp(n) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  const btn = "grid size-8 place-items-center text-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-border bg-surface">
      <button type="button" className={btn} aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus className="size-3.5" />
      </button>
      <input
        value={draft}
        inputMode="numeric"
        aria-label={`Number of ${label} (${min}–${max})`}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="w-8 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
      />
      <button type="button" className={btn} aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

// ---- Library of study sets --------------------------------------------------

function StudySets({ onStart }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const list = useQuery({ queryKey: ["studio"], queryFn: () => api.get("/studio") });
  const sets = list.data?.studySets ?? [];

  const remove = useMutation({
    mutationFn: (id) => api.del(`/studio/${id}`),
    onSuccess: (_, id) => {
      qc.setQueryData(["studio"], (old) => (old ? { ...old, studySets: old.studySets.filter((s) => s.id !== id) } : old));
      qc.invalidateQueries({ queryKey: ["studio"] });
      qc.removeQueries({ queryKey: ["studySet", id] });
      toast.success("Study pack deleted");
    },
  });

  const onDelete = async (set) => {
    const ok = await confirm({
      title: `Delete “${set.title}”?`,
      description: "The summary, key points and glossary will be removed. Any flashcard deck or quiz it made stays in your library.",
      confirmLabel: "Delete pack",
      danger: true,
    });
    if (ok) remove.mutate(set.id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter((s) => `${s.title} ${s.sourceName ?? ""}`.toLowerCase().includes(q));
  }, [sets, query]);

  return (
    <section className="mt-10 sm:mt-12" aria-labelledby="studio-sets">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="studio-sets" className="text-lg font-semibold tracking-tight">
            Your study packs
          </h2>
          <p className="mt-0.5 text-sm text-muted">{list.isSuccess && sets.length ? `${plural(sets.length, "pack")} · newest first` : "Everything you've made in the Studio."}</p>
        </div>
        {sets.length > 6 ? (
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search packs" className="pl-9" aria-label="Search study packs" />
          </div>
        ) : null}
      </div>

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="mt-6 h-5 w-2/5 rounded-full" />
            </Card>
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          compact
          icon={RotateCcw}
          title="Couldn't load your study packs"
          description={list.error?.message}
          action={
            <Button variant="secondary" size="sm" onClick={() => list.refetch()}>
              Try again
            </Button>
          }
        />
      ) : sets.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Your study packs will live here"
          description="Make your first one above — try a topic you're learning this week, or a photo of today's notes. It takes under a minute."
          action={
            <Button variant="secondary" onClick={onStart}>
              <Sparkles /> Create a study pack
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState compact icon={Search} title="No packs match" description={`Nothing found for “${query.trim()}”.`} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }}>
              <StudySetCard set={s} onDelete={() => onDelete(s)} />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudySetCard({ set, onDelete }) {
  const navigate = useNavigate();
  const meta = sourceMeta(set.sourceType, set.sourceName);
  const Icon = meta.icon;
  return (
    <Card interactive className="group relative flex h-full flex-col p-4">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.tone)}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">
            <Link to={`/app/studio/${set.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand-500">
              {set.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted" title={sourceLabel(set)}>
            {sourceLabel(set)}
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="relative z-10 -mr-1 -mt-1 text-muted" aria-label={`Actions for ${set.title}`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={ArrowRight} onSelect={() => navigate(`/app/studio/${set.id}`)}>
              Open pack
            </MenuItem>
            {set.deckId ? (
              <MenuItem icon={Layers} onSelect={() => navigate(`/app/review?deck=${set.deckId}`)}>
                Study flashcards
              </MenuItem>
            ) : null}
            {set.quizId ? (
              <MenuItem icon={ListChecks} onSelect={() => navigate(`/app/quizzes/${set.quizId}`)}>
                Take the quiz
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem icon={Trash2} danger onSelect={() => setTimeout(onDelete, 0)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
        {set.deckId ? (
          <Badge tone="brand">
            <Layers /> Flashcards
          </Badge>
        ) : null}
        {set.quizId ? (
          <Badge tone="info">
            <ListChecks /> Quiz
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-faint" title={new Date(set.createdAt).toLocaleString()}>
          {fromNow(set.createdAt)}
        </span>
      </div>
    </Card>
  );
}

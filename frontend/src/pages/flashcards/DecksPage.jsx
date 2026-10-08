import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, CalendarClock, CircleCheckBig, GalleryVerticalEnd, Layers, Plus, Search, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fromNow, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { AiTag } from "@/components/AiWorking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Kbd, Skeleton } from "@/components/ui/misc";
import { GenerateDeckDialog, ReviewForecast, invalidateFlashcards } from "./shared";

const EXAMPLES = ["Photosynthesis", "The French Revolution", "Big-O notation", "Organic chemistry functional groups", "Spanish travel phrases"];

function NewDeckDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", subject: "", description: "" });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const create = useMutation({
    mutationFn: () => api.post("/decks", { title: form.title.trim(), subject: form.subject, description: form.description }),
    onSuccess: ({ deck }) => {
      invalidateFlashcards(qc);
      toast.success("Deck created — add your first cards");
      onOpenChange(false);
      setForm({ title: "", subject: "", description: "" });
      navigate(`/app/flashcards/${deck.id}`);
    },
  });

  const submit = (e) => {
    e?.preventDefault();
    if (form.title.trim()) create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New deck"
        description="Start empty and write your own cards. You can always generate more with AI later."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending} disabled={!form.title.trim()}>
              Create deck
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title">{(p) => <Input {...p} value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder="e.g. Biology — cell structure" required />}</Field>
          <Field label="Subject" optional>
            {(p) => <Input {...p} value={form.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={80} placeholder="e.g. Biology" />}
          </Field>
          <Field label="Description" optional>
            {(p) => <Textarea {...p} rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} placeholder="What's this deck for?" />}
          </Field>
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeckCard({ deck }) {
  const count = deck._count?.cards ?? 0;
  return (
    <div className="group relative h-full pt-1.5">
      {/* stacked-card motif */}
      <div aria-hidden="true" className="absolute inset-x-4 top-0 h-6 rounded-t-2xl border border-border bg-surface-2 transition-transform duration-200 group-hover:-translate-y-1" />
      <Card interactive className="relative flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
          <GalleryVerticalEnd className="size-5" />
        </span>
        {deck.due > 0 ? (
          <Badge tone="brand" dot>
            {deck.due} due
          </Badge>
        ) : count ? (
          <Badge tone="success">
            <CircleCheckBig /> Up to date
          </Badge>
        ) : (
          <Badge>Empty</Badge>
        )}
      </div>
      <h3 className="mt-4 line-clamp-2 text-[15px] font-semibold tracking-tight">
        <Link to={`/app/flashcards/${deck.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring">
          {deck.title}
        </Link>
      </h3>
      {deck.subject ? <p className="mt-0.5 truncate text-xs font-medium text-muted">{deck.subject}</p> : null}
      {deck.description ? <p className="mt-2 line-clamp-2 text-sm text-muted">{deck.description}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="size-3.5" /> {plural(count, "card")}
          <span className="text-faint">· {fromNow(deck.updatedAt)}</span>
        </span>
        {deck.due > 0 ? (
          <Button asChild size="xs" variant="soft" className="relative z-10">
            <Link to={`/app/review?deck=${deck.id}`}>
              Study <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </div>
      </Card>
    </div>
  );
}

function DueHero({ due, loading }) {
  if (loading) return <Skeleton className="h-full min-h-40 rounded-2xl" />;
  if (!due) {
    return (
      <Card className="flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CircleCheckBig className="size-5" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">You're all caught up</p>
            <p className="mt-1 text-sm text-muted">No cards are due right now. FSRS will bring each one back right before you'd forget it.</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="ai-surface relative flex h-full flex-col justify-between gap-5 overflow-hidden p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-500 text-[#16140f]">
          <BookOpenCheck className="size-5" />
        </span>
        <div>
          <p className="text-sm text-muted">Ready for review</p>
          <p className="mt-0.5 text-3xl font-semibold tracking-tight">
            {due} <span className="text-lg font-medium text-muted">{due === 1 ? "card" : "cards"}</span>
          </p>
          <p className="mt-1 text-sm text-muted">A few minutes now keeps them locked in for weeks.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link to="/app/review">
            Review {due} due <ArrowRight />
          </Link>
        </Button>
        <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
          Flip with <Kbd>Space</Kbd>, rate with <Kbd>1</Kbd>–<Kbd>4</Kbd>
        </span>
      </div>
    </Card>
  );
}

export default function DecksPage() {
  const [newOpen, setNewOpen] = useState(false);
  const [gen, setGen] = useState({ open: false, topic: "" });
  const [query, setQuery] = useState("");

  const q = useQuery({ queryKey: ["decks"], queryFn: () => api.get("/decks") });
  const decks = useMemo(() => q.data?.decks ?? [], [q.data]);
  const totalDue = decks.reduce((n, d) => n + (d.due ?? 0), 0);
  const totalCards = decks.reduce((n, d) => n + (d._count?.cards ?? 0), 0);

  const shown = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return decks;
    return decks.filter((d) => [d.title, d.subject, d.description].some((v) => v?.toLowerCase().includes(s)));
  }, [decks, query]);

  const openGen = (topic = "") => setGen({ open: true, topic });

  return (
    <div>
      <PageHeader
        title="Flashcards"
        description="Spaced repetition that schedules every card right before you'd forget it."
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(true)}>
              <Plus /> New deck
            </Button>
            <Button onClick={() => openGen()}>
              <WandSparkles /> Generate with AI
            </Button>
          </>
        }
      />

      {q.isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-5">
            <Skeleton className="h-44 rounded-2xl lg:col-span-3" />
            <Skeleton className="h-44 rounded-2xl lg:col-span-2" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : q.isError ? (
        <EmptyState icon={GalleryVerticalEnd} title="Couldn't load your decks" description={q.error?.message} action={<Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>} />
      ) : decks.length === 0 ? (
        <div className="ai-surface rounded-2xl border border-border px-6 py-12 text-center sm:py-16">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-500 text-[#16140f] shadow-soft">
            <GalleryVerticalEnd className="size-6" />
          </span>
          <div className="mt-5 flex justify-center">
            <AiTag>Fastest way to start</AiTag>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Turn anything into a deck in seconds</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Type a topic, paste your notes or upload a PDF or a photo of your notebook. AI writes focused cards; FSRS schedules the reviews.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={() => openGen()}>
              <WandSparkles /> Generate with AI
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setNewOpen(true)}>
              <Plus /> Start an empty deck
            </Button>
          </div>
          <div className="mx-auto mt-8 max-w-xl">
            <p className="text-xs font-medium text-faint">Or try one of these</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => openGen(t)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-brand-500 hover:text-fg"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <DueHero due={totalDue} />
            </div>
            <Card className="p-5 lg:col-span-2">
              <div className="mb-1 flex items-center gap-2">
                <CalendarClock className="size-4 text-muted" />
                <h2 className="text-sm font-semibold tracking-tight">Next 14 days</h2>
              </div>
              <ReviewForecast />
            </Card>
          </div>

          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight">
                Your decks <span className="font-normal text-muted">· {plural(decks.length, "deck")}, {plural(totalCards, "card")}</span>
              </h2>
              {decks.length > 5 ? (
                <div className="relative sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decks" aria-label="Search decks" className="h-9 pl-9" />
                </div>
              ) : null}
            </div>

            {shown.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((d) => (
                  <DeckCard key={d.id} deck={d} />
                ))}
                {!query ? (
                  <button
                    type="button"
                    onClick={() => openGen()}
                    className="mt-1.5 flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong/80 p-5 text-center text-sm text-muted transition hover:border-brand-500 hover:bg-brand-50/40 hover:text-fg dark:hover:bg-brand-500/5"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-subtle">
                      <WandSparkles className="size-5" />
                    </span>
                    <span className="font-medium text-fg">Generate a new deck</span>
                    <span className="text-xs">From a topic, notes or a file</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <EmptyState compact icon={Search} title="No decks match" description={`Nothing matches “${query}”.`} action={<Button variant="secondary" size="sm" onClick={() => setQuery("")}>Clear search</Button>} />
            )}
          </section>
        </div>
      )}

      <NewDeckDialog open={newOpen} onOpenChange={setNewOpen} />
      <GenerateDeckDialog open={gen.open} initialTopic={gen.topic} onOpenChange={(open) => setGen((g) => ({ ...g, open }))} />
    </div>
  );
}

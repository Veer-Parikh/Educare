import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  Ellipsis,
  GalleryVerticalEnd,
  Layers,
  ListPlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sprout,
  SquarePen,
  Trash2,
  Trophy,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, fromNow, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, Kbd, Segmented, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { CARD_STATES, GenerateDeckDialog, invalidateFlashcards, parseBulk } from "./shared";

const PAGE = 40;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "review", label: "Review" },
];

const matchesFilter = (c, f, now) =>
  f === "all" ||
  (f === "due" && new Date(c.due) <= now) ||
  (f === "new" && c.state === 0) ||
  (f === "learning" && (c.state === 1 || c.state === 3)) ||
  (f === "review" && c.state === 2);

// ---- dialogs ------------------------------------------------------------------

function EditDeckDialog({ deck, open, onOpenChange }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: deck.title, subject: deck.subject ?? "", description: deck.description ?? "" });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (open) setForm({ title: deck.title, subject: deck.subject ?? "", description: deck.description ?? "" });
  }, [open, deck.title, deck.subject, deck.description]);

  const save = useMutation({
    mutationFn: () => api.patch(`/decks/${deck.id}`, { title: form.title.trim(), subject: form.subject, description: form.description }),
    onSuccess: ({ deck: d }) => {
      qc.setQueryData(["deck", deck.id], (old) => (old ? { ...old, deck: d } : old));
      qc.invalidateQueries({ queryKey: ["decks"] });
      toast.success("Deck updated");
      onOpenChange(false);
    },
  });

  const submit = (e) => {
    e?.preventDefault();
    if (form.title.trim()) save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit deck"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending} disabled={!form.title.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title">{(p) => <Input {...p} value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} required />}</Field>
          <Field label="Subject" optional>
            {(p) => <Input {...p} value={form.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={80} placeholder="e.g. Biology" />}
          </Field>
          <Field label="Description" optional>
            {(p) => <Textarea {...p} rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />}
          </Field>
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

const BULK_PLACEHOLDER = `Mitochondria :: Site of cellular respiration; makes ATP
What does DNA polymerase do? :: Adds nucleotides to a growing DNA strand
Osmosis :: Diffusion of water across a semi-permeable membrane :: think "water moves"`;

function AddCardsDialog({ deck, open, onOpenChange }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("single");
  const [single, setSingle] = useState({ front: "", back: "", hint: "" });
  const [bulk, setBulk] = useState("");
  const [added, setAdded] = useState(0);
  const frontRef = useRef(null);
  const parsed = useMemo(() => parseBulk(bulk), [bulk]);

  useEffect(() => {
    if (open) setAdded(0);
  }, [open]);

  const add = useMutation({
    mutationFn: async (cards) => {
      let total = 0;
      for (let i = 0; i < cards.length; i += 200) {
        const { added: n } = await api.post(`/decks/${deck.id}/cards`, { cards: cards.slice(i, i + 200) });
        total += n;
      }
      return total;
    },
    onSuccess: (n) => {
      invalidateFlashcards(qc, deck.id);
      setAdded((a) => a + n);
      if (tab === "single") {
        setSingle({ front: "", back: "", hint: "" });
        toast.success("Card added");
        frontRef.current?.focus();
      } else {
        toast.success(`Added ${plural(n, "card")}`);
        setBulk("");
        onOpenChange(false);
      }
    },
  });

  const singleReady = single.front.trim() && single.back.trim();
  const submitSingle = (e) => {
    e?.preventDefault();
    if (!singleReady || add.isPending) return;
    add.mutate([{ front: single.front.trim(), back: single.back.trim(), ...(single.hint.trim() ? { hint: single.hint.trim() } : {}) }]);
  };
  const submitBulk = () => parsed.cards.length && !add.isPending && add.mutate(parsed.cards);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="Add cards"
        description={added ? `${plural(added, "card")} added so far — keep going or close when you're done.` : `Cards go into “${deck.title}” and are due for their first review right away.`}
        footer={
          tab === "single" ? (
            <>
              <span className="mr-auto hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
                <Kbd>Ctrl</Kbd>
                <Kbd>Enter</Kbd> to add
              </span>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button onClick={submitSingle} loading={add.isPending} disabled={!singleReady}>
                <Plus /> Add card
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submitBulk} loading={add.isPending} disabled={!parsed.cards.length}>
                <ListPlus /> Add {parsed.cards.length ? plural(parsed.cards.length, "card") : "cards"}
              </Button>
            </>
          )
        }
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5">
            <TabsTrigger value="single">
              <Plus /> One card
            </TabsTrigger>
            <TabsTrigger value="bulk">
              <ListPlus /> Bulk paste
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <form
              onSubmit={submitSingle}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitSingle(e);
              }}
              className="space-y-4"
            >
              <Field label="Front" hint="The question or prompt. Markdown and $math$ work.">
                {(p) => <Textarea {...p} ref={frontRef} rows={3} value={single.front} onChange={(e) => setSingle((s) => ({ ...s, front: e.target.value }))} maxLength={2000} placeholder="What is the powerhouse of the cell?" />}
              </Field>
              <Field label="Back">
                {(p) => <Textarea {...p} rows={3} value={single.back} onChange={(e) => setSingle((s) => ({ ...s, back: e.target.value }))} maxLength={4000} placeholder="The mitochondrion" />}
              </Field>
              <Field label="Hint" optional>
                {(p) => <Input {...p} value={single.hint} onChange={(e) => setSingle((s) => ({ ...s, hint: e.target.value }))} maxLength={500} placeholder="A nudge that doesn't give it away" />}
              </Field>
            </form>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-3">
            <Field
              label="One card per line"
              hint={
                <>
                  Use <code className="rounded bg-subtle px-1 font-mono">front :: back</code>, optionally <code className="rounded bg-subtle px-1 font-mono">:: hint</code>. Tab-separated rows pasted from a spreadsheet work too.
                </>
              }
            >
              {(p) => <Textarea {...p} rows={9} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={BULK_PLACEHOLDER} className="font-mono text-[13px]" />}
            </Field>
            {bulk.trim() ? (
              <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
                <p>
                  <span className="font-semibold">{plural(parsed.cards.length, "card")}</span> ready
                  {parsed.skipped.length ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      {" "}
                      · {plural(parsed.skipped.length, "line")} skipped (line {parsed.skipped.slice(0, 4).map((s) => s.line).join(", ")}
                      {parsed.skipped.length > 4 ? "…" : ""} — {parsed.skipped[0].reason})
                    </span>
                  ) : null}
                </p>
                {parsed.cards.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {parsed.cards.slice(0, 3).map((c, i) => (
                      <li key={i} className="flex min-w-0 gap-2">
                        <span className="truncate font-medium text-fg">{c.front}</span>
                        <ArrowRight className="size-3.5 shrink-0 translate-y-px" />
                        <span className="truncate">{c.back}</span>
                      </li>
                    ))}
                    {parsed.cards.length > 3 ? <li>+ {parsed.cards.length - 3} more</li> : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---- card row -----------------------------------------------------------------

function CardRow({ card, deckId }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ front: card.front, back: card.back, hint: card.hint ?? "" });
  const state = CARD_STATES[card.state] ?? CARD_STATES[0];
  const isDue = new Date(card.due) <= new Date();

  const refresh = () => invalidateFlashcards(qc, deckId);

  const save = useMutation({
    mutationFn: () => api.patch(`/cards/${card.id}`, { front: draft.front.trim(), back: draft.back.trim(), hint: draft.hint.trim() || null }),
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success("Card saved");
    },
  });
  const reset = useMutation({
    mutationFn: () => api.post(`/cards/${card.id}/reset`),
    onSuccess: () => {
      refresh();
      toast.success("Progress reset — the card is new again");
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/cards/${card.id}`),
    onSuccess: () => {
      refresh();
      toast.success("Card deleted");
    },
  });

  const startEdit = () => {
    setDraft({ front: card.front, back: card.back, hint: card.hint ?? "" });
    setEditing(true);
  };

  if (editing) {
    const ok = draft.front.trim() && draft.back.trim();
    return (
      <Card className="p-4 ring-2 ring-brand-500/30 sm:p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) save.mutate();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ok) save.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Front">{(p) => <Textarea {...p} autoFocus rows={3} value={draft.front} onChange={(e) => setDraft((d) => ({ ...d, front: e.target.value }))} maxLength={2000} />}</Field>
            <Field label="Back">{(p) => <Textarea {...p} rows={3} value={draft.back} onChange={(e) => setDraft((d) => ({ ...d, back: e.target.value }))} maxLength={4000} />}</Field>
          </div>
          <Field label="Hint" optional>
            {(p) => <Input {...p} value={draft.hint} onChange={(e) => setDraft((d) => ({ ...d, hint: e.target.value }))} maxLength={500} />}
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={save.isPending} disabled={!ok}>
              Save
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className={cn("group p-4 transition-opacity sm:p-5", (remove.isPending || reset.isPending) && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 md:gap-6">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">Front</p>
            <Markdown className="text-sm leading-relaxed">{card.front}</Markdown>
            {card.hint ? <p className="mt-1.5 text-xs text-muted">Hint: {card.hint}</p> : null}
          </div>
          <div className="min-w-0 border-t border-border pt-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">Back</p>
            <Markdown className="text-sm leading-relaxed text-muted">{card.back}</Markdown>
          </div>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Card actions" className="-mr-1.5 -mt-1.5">
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={Pencil} onSelect={startEdit}>
              Edit card
            </MenuItem>
            <MenuItem icon={RotateCcw} disabled={card.state === 0 && !card.reps} onSelect={() => reset.mutate()}>
              Reset progress
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={Trash2}
              danger
              onSelect={async () => {
                if (await confirm({ title: "Delete this card?", description: "Its review history goes with it.", confirmLabel: "Delete card", danger: true })) remove.mutate();
              }}
            >
              Delete card
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        <Badge tone={state.tone}>{state.label}</Badge>
        <span className={cn("inline-flex items-center gap-1", isDue && "font-medium text-brand-800 dark:text-brand-300")}>
          <CalendarClock className="size-3.5" />
          {isDue ? "Due now" : `Due ${fromNow(card.due)}`}
        </span>
        {card.reps ? (
          <span className="text-faint">
            {plural(card.reps, "review")}
            {card.lapses ? ` · ${plural(card.lapses, "lapse")}` : ""}
          </span>
        ) : null}
        <button type="button" onClick={startEdit} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted opacity-100 transition hover:bg-subtle hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
          <SquarePen className="size-3.5" /> Edit
        </button>
      </div>
    </Card>
  );
}

// ---- page ---------------------------------------------------------------------

export default function DeckPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const q = useQuery({ queryKey: ["deck", deckId], queryFn: () => api.get(`/decks/${deckId}`) });
  const deck = q.data?.deck;
  const cards = useMemo(() => q.data?.cards ?? [], [q.data]);
  const stats = q.data?.stats ?? { total: 0, due: 0, new: 0, mature: 0 };

  const filtered = useMemo(() => {
    const now = new Date();
    const s = search.trim().toLowerCase();
    return cards.filter((c) => matchesFilter(c, filter, now) && (!s || c.front.toLowerCase().includes(s) || c.back.toLowerCase().includes(s) || c.hint?.toLowerCase().includes(s)));
  }, [cards, search, filter]);

  const removeDeck = useMutation({
    mutationFn: () => api.del(`/decks/${deckId}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["deck", deckId] });
      invalidateFlashcards(qc);
      toast.success("Deck deleted");
      navigate("/app/flashcards");
    },
  });

  if (q.isLoading) {
    return (
      <div>
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-8 h-8 w-72 max-w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (q.isError || !deck) {
    return (
      <div>
        <PageHeader title="Deck not found" back={{ to: "/app/flashcards", label: "Flashcards" }} />
        <EmptyState
          icon={GalleryVerticalEnd}
          title={q.error?.status === 404 || q.error?.status === 403 ? "This deck doesn't exist or isn't yours" : "Couldn't load this deck"}
          description={q.error?.message}
          action={
            <Button asChild variant="secondary">
              <Link to="/app/flashcards">Back to flashcards</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const onDelete = async () => {
    if (
      await confirm({
        title: `Delete “${deck.title}”?`,
        description: `All ${plural(stats.total, "card")} and their review history will be removed. This can't be undone.`,
        confirmLabel: "Delete deck",
        danger: true,
      })
    )
      removeDeck.mutate();
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/app/flashcards", label: "Flashcards" }}
        eyebrow={deck.subject ? <Badge tone="brand">{deck.subject}</Badge> : null}
        title={
          <>
            {deck.title}
            <Button variant="ghost" size="icon-xs" onClick={() => setEditOpen(true)} aria-label="Edit deck details" className="ml-1.5 align-middle text-faint hover:text-fg">
              <Pencil />
            </Button>
          </>
        }
        description={deck.description || undefined}
        actions={
          <>
            <Button asChild variant={stats.due ? "primary" : "secondary"}>
              <Link to={`/app/review?deck=${deck.id}`}>
                <BookOpenCheck /> {stats.due ? `Study now · ${stats.due}` : "Study"}
              </Link>
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Deck options">
                  <Ellipsis />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={Pencil} onSelect={() => setEditOpen(true)}>
                  Edit details
                </MenuItem>
                <MenuItem icon={Plus} onSelect={() => setAddOpen(true)}>
                  Add cards
                </MenuItem>
                <MenuItem icon={WandSparkles} onSelect={() => setGenOpen(true)}>
                  Generate more with AI
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Trash2} danger onSelect={onDelete}>
                  Delete deck
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Layers} label="Total cards" value={stats.total} />
        <StatCard icon={CalendarClock} tone="brand" label="Due now" value={stats.due} hint={stats.due ? "Ready to review" : "Nothing due"} />
        <StatCard icon={Sprout} tone="sky" label="New" value={stats.new} hint="Never reviewed" />
        <StatCard icon={Trophy} tone="emerald" label="Mature" value={stats.mature} hint="Interval ≥ 21 days" />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Cards</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus /> Add cards
            </Button>
            <Button variant="soft" onClick={() => setGenOpen(true)}>
              <WandSparkles /> Generate more with AI
            </Button>
          </div>
        </div>

        {cards.length === 0 ? (
          <EmptyState
            icon={GalleryVerticalEnd}
            title="This deck is empty"
            description="Write cards yourself, paste a list, or let AI draft a set from a topic or your notes."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setGenOpen(true)}>
                  <WandSparkles /> Generate with AI
                </Button>
                <Button variant="secondary" onClick={() => setAddOpen(true)}>
                  <Plus /> Add cards
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLimit(PAGE);
                  }}
                  placeholder="Search cards"
                  aria-label="Search cards"
                  className="h-9 pl-9"
                />
              </div>
              <div className="scroll-thin -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <Segmented
                  size="sm"
                  value={filter}
                  onChange={(f) => {
                    setFilter(f);
                    setLimit(PAGE);
                  }}
                  options={FILTERS}
                />
              </div>
              <p className="text-xs text-muted sm:ml-auto">
                {filtered.length === cards.length ? plural(cards.length, "card") : `${filtered.length} of ${cards.length}`}
              </p>
            </div>

            {filtered.length ? (
              <div className="space-y-3">
                {filtered.slice(0, limit).map((c) => (
                  <CardRow key={c.id} card={c} deckId={deck.id} />
                ))}
                {filtered.length > limit ? (
                  <div className="pt-2 text-center">
                    <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                      Show {Math.min(PAGE, filtered.length - limit)} more
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Search}
                title="No cards match"
                description="Try a different search or filter."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </>
        )}
      </section>

      <EditDeckDialog deck={deck} open={editOpen} onOpenChange={setEditOpen} />
      <AddCardsDialog deck={deck} open={addOpen} onOpenChange={setAddOpen} />
      <GenerateDeckDialog deck={deck} open={genOpen} onOpenChange={setGenOpen} />
    </div>
  );
}

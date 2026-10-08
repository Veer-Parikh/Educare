import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api, toForm } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import { AiWorking } from "@/components/AiWorking";
import { EMPTY_SOURCE, SourcePicker, sourcePayload, sourceReady } from "@/components/SourcePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";

/** FSRS card states (0 New, 1 Learning, 2 Review, 3 Relearning). */
export const CARD_STATES = {
  0: { label: "New", tone: "info" },
  1: { label: "Learning", tone: "warning" },
  2: { label: "Review", tone: "success" },
  3: { label: "Relearning", tone: "danger" },
};

/** Everything that shows card counts or due numbers. */
export function invalidateFlashcards(qc, deckId) {
  qc.invalidateQueries({ queryKey: ["decks"] });
  qc.invalidateQueries({ queryKey: ["review"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  if (deckId) qc.invalidateQueries({ queryKey: ["deck", deckId] });
}

// ---- bulk entry ---------------------------------------------------------------

/**
 * Parse one card per line: `front :: back` (or `front :: back :: hint`).
 * Tab-separated lines (pasted from a spreadsheet) work too.
 */
export function parseBulk(text) {
  const cards = [];
  const skipped = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = (line.includes("::") ? line.split("::") : line.split("\t")).map((p) => p.trim());
    const [front, back, ...rest] = parts;
    const hint = rest.join(" ").trim();
    if (!front || !back) skipped.push({ line: i + 1, reason: "needs a front and a back" });
    else if (front.length > 2000 || back.length > 4000) skipped.push({ line: i + 1, reason: "too long" });
    else cards.push({ front, back, ...(hint ? { hint: hint.slice(0, 500) } : {}) });
  });
  return { cards, skipped };
}

// ---- AI generator -------------------------------------------------------------

const GEN_STEPS = ["Reading your source", "Picking out the key ideas", "Writing one idea per card", "Scheduling them with FSRS"];
const COUNT_PRESETS = [10, 20, 30];

/**
 * Generate a new deck from a source, or append AI cards to `deck` when given.
 * Navigates to the new deck on success.
 */
export function GenerateDeckDialog({ open, onOpenChange, deck, initialTopic = "" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [count, setCount] = useState(15);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open) {
      setSource({ ...EMPTY_SOURCE, topic: initialTopic || deck?.subject || "" });
      setTitle("");
    }
  }, [open, initialTopic, deck?.subject]);

  const gen = useMutation({
    mutationFn: () => {
      const { fields, files } = sourcePayload(source);
      return api.upload("/decks/generate", toForm({ ...fields, count, title: deck ? undefined : title.trim() || undefined, deckId: deck?.id }, files));
    },
    onSuccess: ({ deck: d, added }) => {
      invalidateFlashcards(qc, d.id);
      onOpenChange(false);
      if (deck) {
        toast.success(`Added ${plural(added, "card")} to ${deck.title}`);
      } else {
        toast.success(`Created “${d.title}” with ${plural(added, "card")}`);
        navigate(`/app/flashcards/${d.id}`);
      }
    },
  });

  const ready = sourceReady(source) && !gen.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !gen.isPending && onOpenChange(o)}>
      <DialogContent
        size="lg"
        title={deck ? "Generate more cards" : "Generate a deck with AI"}
        description={deck ? `New cards are added to “${deck.title}” and scheduled right away.` : "Point it at a topic, your notes, a class material or a file. Cards follow the one-idea-per-card rule."}
        hideClose={gen.isPending}
        footer={
          gen.isPending ? null : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => gen.mutate()} disabled={!ready}>
                <WandSparkles /> Generate {count} cards
              </Button>
            </>
          )
        }
      >
        {gen.isPending ? (
          <AiWorking title={`Writing ${count} flashcards…`} steps={GEN_STEPS} />
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) gen.mutate();
            }}
          >
            <SourcePicker value={source} onChange={setSource} />

            <Field label="Number of cards" hint="4–60. Around 15–25 is a comfortable deck to start with.">
              {(p) => (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    {...p}
                    type="range"
                    min={4}
                    max={60}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="h-2 min-w-40 flex-1 cursor-pointer accent-brand-500"
                  />
                  <span className="w-8 text-right text-sm font-semibold tabular-nums">{count}</span>
                  <div className="flex gap-1">
                    {COUNT_PRESETS.map((n) => (
                      <Button key={n} type="button" size="xs" variant={count === n ? "soft" : "ghost"} onClick={() => setCount(n)}>
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Field>

            {!deck ? (
              <Field label="Deck title" optional hint="Leave blank and we'll name it for you.">
                {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Cell biology — chapter 3" />}
              </Field>
            ) : null}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- 14-day forecast ----------------------------------------------------------

function bucketLabel(i) {
  if (i === 0) return "Due now";
  if (i === 1) return "Within a day";
  return `In ${i} days · ${format(addDays(new Date(), i), "EEE d MMM")}`;
}

/**
 * Compact column chart of cards coming due over the next two weeks.
 * One series, so one color; the peak day carries a direct label.
 */
export function ReviewForecast({ className, height = 72, showSummary = true }) {
  const q = useQuery({ queryKey: ["review", "forecast"], queryFn: () => api.get("/review/forecast") });
  const buckets = useMemo(() => q.data?.forecast ?? [], [q.data]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const upcoming = buckets.slice(1).reduce((n, b) => n + b.count, 0);
  const peak = buckets.reduce((best, b) => (b.count > (best?.count ?? 0) ? b : best), null);
  const nextDay = buckets.find((b) => b.inDays > 0 && b.count > 0);

  if (q.isLoading) {
    return (
      <div className={className}>
        <Skeleton className="w-full" style={{ height }} />
      </div>
    );
  }

  return (
    <div className={className}>
      {showSummary ? (
        <p className="mb-3 text-sm text-muted">
          {upcoming ? (
            <>
              <span className="font-medium text-fg">{plural(upcoming, "review")}</span> coming up in the next two weeks
              {nextDay ? <> · next batch {nextDay.inDays === 1 ? "within a day" : `in ${nextDay.inDays} days`}</> : null}
            </>
          ) : buckets[0]?.count ? (
            <>
              <span className="font-medium text-fg">{plural(buckets[0].count, "card")}</span> due now · nothing else scheduled for two weeks
            </>
          ) : (
            "Nothing scheduled in the next two weeks."
          )}
        </p>
      ) : null}

      <div className="relative" style={{ height }}>
        {/* baseline */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-border" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end gap-0.5" aria-hidden="true">
          {buckets.map((b) => {
            const h = b.count ? Math.max(4, (b.count / max) * (height - 18)) : 0;
            const isPeak = peak && b.inDays === peak.inDays && b.count > 0;
            return (
              <Tip key={b.inDays} content={`${bucketLabel(b.inDays)}: ${plural(b.count, "card")}`}>
                <div className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end">
                  {isPeak ? <span className="mb-1 text-[10px] font-medium tabular-nums text-muted">{b.count}</span> : null}
                  <div
                    className={cn(
                      "w-full max-w-6 rounded-t-sm transition-opacity group-hover:opacity-80",
                      b.count ? "bg-brand-600 dark:bg-brand-400" : "h-0.5 bg-border-strong",
                    )}
                    style={b.count ? { height: h } : undefined}
                  />
                </div>
              </Tip>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint" aria-hidden="true">
        <span>Now</span>
        <span>1 week</span>
        <span>2 weeks</span>
      </div>

      <table className="sr-only">
        <caption>Cards coming due over the next 14 days</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Cards</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.inDays}>
              <td>{bucketLabel(b.inDays)}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

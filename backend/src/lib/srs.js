import { fsrs, generatorParameters, Rating } from "ts-fsrs";

// FSRS (the scheduler Anki adopted) targeting 90% recall.
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

export const RATINGS = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };

const toFsrs = (c) => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsedDays,
  scheduled_days: c.scheduledDays,
  learning_steps: c.learningSteps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.lastReview ?? undefined,
});

const fromFsrs = (c) => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsedDays: c.elapsed_days,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.last_review ?? null,
});

/** Apply a 1-4 rating and return the card's new scheduling fields. */
export function reviewCard(card, rating, now = new Date()) {
  const { card: next } = scheduler.next(toFsrs(card), now, RATINGS[rating]);
  return fromFsrs(next);
}

function humanize(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d}d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo` : `${(d / 365).toFixed(1)}y`;
}

/** Interval labels for the four rating buttons, e.g. { 1: "1m", 2: "6m", 3: "10m", 4: "4d" }. */
export function previewIntervals(card, now = new Date()) {
  const preview = scheduler.repeat(toFsrs(card), now);
  const out = {};
  for (const [n, r] of Object.entries(RATINGS)) out[n] = humanize(preview[r].card.due.getTime() - now.getTime());
  return out;
}

// Shared renderers for the teacher AI tools. Used by the generator pages and by
// the library's ArtifactPage so a saved item looks (and prints) exactly like a
// freshly generated one.
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  BookOpen,
  Check,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock,
  Eye,
  Flag,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Package,
  Presentation,
  Rocket,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Ticket,
  TriangleAlert,
  Users,
} from "lucide-react";
import { cn, dateTime, plural } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Ring } from "@/components/ui/misc";
import { Tip } from "@/components/ui/menu";

// ---- constants ------------------------------------------------------------------

export const LESSON_STYLES = [
  { value: "interactive", label: "Interactive", hint: "Short explanations broken up with questioning, pair work and quick activities." },
  { value: "lecture", label: "Lecture", hint: "Structured direct instruction with worked examples and regular checks." },
  { value: "flipped", label: "Flipped", hint: "Students meet the content beforehand; class time goes on application and discussion." },
  { value: "project", label: "Project", hint: "Students build or create something that demonstrates their understanding." },
  { value: "inquiry", label: "Inquiry", hint: "Students investigate a question and construct the key idea themselves." },
];

export const SECTION_TYPES = [
  { value: "mcq", label: "Multiple choice", short: "MCQ" },
  { value: "truefalse", label: "True or false", short: "true/false" },
  { value: "fill", label: "Fill in the blanks", short: "fill-in" },
  { value: "short", label: "Short answer", short: "short" },
  { value: "long", label: "Long answer", short: "long" },
];

export const BLOOM_LEVELS = [
  { value: "remember", label: "Remember" },
  { value: "understand", label: "Understand" },
  { value: "apply", label: "Apply" },
  { value: "analyze", label: "Analyze" },
  { value: "evaluate", label: "Evaluate" },
  { value: "create", label: "Create" },
];
const HIGHER_ORDER = new Set(["analyze", "evaluate", "create"]);

// Sequential single-hue ramp (light -> dark = easy -> hard); dark mode uses its own steps.
const DIFFICULTY_MIX = [
  { value: "easy", label: "Easy", swatch: "bg-stone-300 dark:bg-stone-600" },
  { value: "medium", label: "Medium", swatch: "bg-stone-500 dark:bg-stone-400" },
  { value: "hard", label: "Hard", swatch: "bg-stone-800 dark:bg-stone-200" },
];

export const VERDICT = {
  correct: { label: "Correct", short: "correct", tone: "success", icon: CircleCheck, accent: "border-l-emerald-500" },
  partial: { label: "Partial credit", short: "partial", tone: "warning", icon: CircleMinus, accent: "border-l-amber-400" },
  incorrect: { label: "Incorrect", short: "incorrect", tone: "danger", icon: CircleX, accent: "border-l-rose-500" },
  unanswered: { label: "Not answered", short: "unanswered", tone: "neutral", icon: CircleDashed, accent: "border-l-border-strong" },
};
const VERDICT_ORDER = ["correct", "partial", "incorrect", "unanswered"];

const LEGIBILITY = {
  clear: { label: "Clear handwriting", tone: "success", icon: Eye },
  mostly_clear: { label: "Mostly legible", tone: "info", icon: Eye },
  hard_to_read: { label: "Hard to read", tone: "warning", icon: TriangleAlert },
};

const LETTERS = "abcdefgh";

// ---- small helpers -----------------------------------------------------------------

const cap = (s = "") => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

/** 2 -> "2", 2.5 -> "2.5", 2.25 -> "2.3" */
export const fmtNum = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
};

/** 90 -> "1 hour 30 minutes" */
export function fmtDuration(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return plural(r, "minute");
  return r ? `${plural(h, "hour")} ${plural(r, "minute")}` : plural(h, "hour");
}

/** Minutes offset -> "0:05", "1:30" */
const fmtClock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

export const slugify = (s = "") =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "educare";

const questionMarks = (q, section) => Number(q.marks ?? section.marksEach) || 0;

function optionsFor(type, q) {
  if (type === "truefalse") return ["True", "False"];
  if (type === "mcq") return q.options ?? [];
  return [];
}

/** Which option the answer points to: exact text, then "B" / "(b)" / "B.", then containment. */
function correctIndex(type, q) {
  const options = optionsFor(type, q);
  if (!options.length) return -1;
  const ans = String(q.answer ?? "").trim();
  const lower = ans.toLowerCase();
  let idx = options.findIndex((o) => o.trim().toLowerCase() === lower);
  if (idx < 0) {
    const letter = ans.match(/^\(?([a-h])\)?(?:[).:\s]|$)/i);
    if (letter) idx = letter[1].toLowerCase().charCodeAt(0) - 97;
  }
  if (idx < 0) idx = options.findIndex((o) => o.trim() && lower.includes(o.trim().toLowerCase()));
  return idx >= 0 && idx < options.length ? idx : -1;
}

/** Questions that the backend can turn into an interactive quiz. */
export function convertibleCount(paper) {
  return sum(paper?.sections ?? [], (s) => (["mcq", "truefalse", "fill", "short"].includes(s.type) ? s.questions.length : 0));
}

const answerLines = (type, marks) =>
  type === "long" ? Math.min(16, Math.max(8, Math.round(marks * 2))) : type === "short" ? Math.min(6, Math.max(3, Math.round(marks * 1.5))) : 0;

// ---- rich text ------------------------------------------------------------------

const MD_HINT = /[$*`#|\\]|\n|_{2,}|\[[^\]]+\]\(|^\s*(?:[-+]|\d+\.)\s/m;

function prepMarkdown(text) {
  // Keep "_____" blanks literal, and honour single line breaks from the model.
  let s = text.replace(/_{3,}/g, (m) => m.replace(/_/g, "\\_"));
  if (!s.includes("$$")) s = s.replace(/([^\n])\n(?!\n)/g, "$1  \n");
  return s;
}

/** Plain text stays plain; anything with markdown or $math$ goes through <Markdown>. Always block-level. */
export function Rich({ children, className }) {
  const text = String(children ?? "").trim();
  if (!text) return null;
  if (!MD_HINT.test(text)) return <div className={cn("text-pretty", className)}>{text}</div>;
  return <Markdown className={cn("[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>{prepMarkdown(text)}</Markdown>;
}

// ---- print ---------------------------------------------------------------------

// Hides the app chrome (sidebar, top bar, toasts) and forces a light, ink-on-paper
// palette while one of these documents is on screen. Mounted by the result views.
const PRINT_CSS = `
@media print {
  :root, :root.dark, .dark {
    --bg: #fff; --surface: #fff; --surface-2: #fff; --subtle: #f2f2f2;
    --border: #c9c9c9; --border-strong: #8c8c8c;
    --fg: #000; --muted: #2b2b2b; --faint: #555; --ink: #000; --on-ink: #fff;
    color-scheme: light;
  }
  html, body { background: #fff !important; color: #000 !important; }
  body header.sticky, body div:has(> aside), [data-sonner-toaster] { display: none !important; }
  main { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  main * { box-shadow: none !important; text-shadow: none !important; }
  main .md {
    --tw-prose-body: #000; --tw-prose-headings: #000; --tw-prose-bold: #000; --tw-prose-links: #000;
    --tw-prose-bullets: #333; --tw-prose-counters: #000; --tw-prose-quotes: #000; --tw-prose-code: #000;
  }
  main a { color: inherit !important; text-decoration: none !important; }
}`;

/**
 * Print support for a document view: injects print CSS, drops dark mode while the
 * print dialog is open and sets document.title (browsers use it as the PDF name).
 */
export function PrintStyles({ title }) {
  const titleRef = useRef(title);
  useLayoutEffect(() => {
    titleRef.current = title;
  });
  useEffect(() => {
    const root = document.documentElement;
    let restoreDark = false;
    let restoreTitle = null;
    const before = () => {
      restoreDark = root.classList.contains("dark");
      if (restoreDark) root.classList.remove("dark");
      if (titleRef.current) {
        restoreTitle = document.title;
        document.title = titleRef.current;
      }
    };
    const after = () => {
      if (restoreDark) root.classList.add("dark");
      restoreDark = false;
      if (restoreTitle !== null) document.title = restoreTitle;
      restoreTitle = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, []);
  return <style>{PRINT_CSS}</style>;
}

// ---- shared building blocks --------------------------------------------------------

function Heading({ icon: Icon, children, aside }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
        {Icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-subtle text-muted print:hidden">
            <Icon className="size-4" />
          </span>
        ) : null}
        {children}
      </h3>
      {aside}
    </div>
  );
}

function Bullets({ items, numbered, icon: Icon, iconClassName, empty = "None listed." }) {
  if (!items?.length) return <p className="text-sm text-faint">{empty}</p>;
  const Tag = numbered ? "ol" : "ul";
  return (
    <Tag className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
          {numbered ? (
            <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-muted">{i + 1}.</span>
          ) : Icon ? (
            <Icon className={cn("mt-[3px] size-4 shrink-0 text-faint", iconClassName)} />
          ) : (
            <span aria-hidden className="w-3 shrink-0 text-center text-faint">
              •
            </span>
          )}
          <Rich className="min-w-0 flex-1">{it}</Rich>
        </li>
      ))}
    </Tag>
  );
}

// ---- lesson plan ------------------------------------------------------------------

function AgendaBar({ agenda, total }) {
  let t = 0;
  return (
    <div className="no-print" aria-hidden>
      <div className="flex h-9 w-full gap-0.5">
        {agenda.map((seg, i) => {
          const start = t;
          const mins = Number(seg.minutes) || 0;
          t += mins;
          const share = total ? mins / total : 0;
          return (
            <Tip key={i} content={`${i + 1}. ${seg.title} · ${mins} min (${fmtClock(start)}–${fmtClock(start + mins)})`}>
              <div
                style={{ flex: `${Math.max(mins, 0.5)} 1 0%` }}
                className={cn(
                  "grid min-w-1.5 place-items-center text-xs font-semibold text-[#16140f] first:rounded-l-[4px] last:rounded-r-[4px]",
                  i % 2 ? "bg-brand-200 dark:bg-brand-600" : "bg-brand-400 dark:bg-brand-400",
                )}
              >
                {share >= 0.07 ? i + 1 : ""}
              </div>
            </Tip>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-faint">
        <span>0 min</span>
        <span>{total} min</span>
      </div>
    </div>
  );
}

function RoleNote({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <Icon className="size-3.5" />
        {label}
      </p>
      <Rich className="mt-1 text-sm leading-relaxed">{children}</Rich>
    </div>
  );
}

export function LessonPlanView({ plan, input = {}, title, className }) {
  const agenda = plan?.agenda ?? [];
  const planned = Number(input?.durationMin) || 0;
  const total = sum(agenda, (a) => a.minutes) || planned;
  const style = LESSON_STYLES.find((s) => s.value === input?.style);
  const starts = agenda.reduce((acc, seg, i) => [...acc, i === 0 ? 0 : acc[i - 1] + (Number(agenda[i - 1].minutes) || 0)], []);
  const meta = [
    input?.subject ? { icon: BookOpen, text: input.subject } : null,
    input?.grade ? { icon: GraduationCap, text: input.grade } : null,
    { icon: Clock, text: `${total} minutes` },
    style ? { icon: Presentation, text: `${style.label} lesson` } : null,
  ].filter(Boolean);

  return (
    <article className={cn("print-area rounded-2xl border border-border bg-surface p-5 text-fg shadow-soft sm:p-8 print:p-0", className)}>
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint">Lesson plan</p>
        <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-[1.65rem]">{title || plan.title}</h2>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
          {meta.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-1.5">
              <Icon className="size-4 text-faint" />
              {text}
            </li>
          ))}
        </ul>
        {plan.overview ? <Rich className="mt-4 max-w-3xl text-[15px] leading-relaxed">{plan.overview}</Rich> : null}
      </header>

      <div className="mt-7 space-y-8">
        <section className="break-inside-avoid">
          <Heading icon={Target}>Learning objectives</Heading>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="mb-2.5 text-xs font-medium text-muted">By the end of the lesson, students will be able to…</p>
            <Bullets items={plan.objectives} icon={Check} iconClassName="text-emerald-600 dark:text-emerald-400 print:text-black" />
          </div>
        </section>

        <div className="grid gap-8 sm:grid-cols-2">
          <section className="break-inside-avoid">
            <Heading icon={Lightbulb}>Prerequisites</Heading>
            <Bullets items={plan.prerequisites} empty="No prior knowledge needed." />
          </section>
          <section className="break-inside-avoid">
            <Heading icon={Package}>Materials</Heading>
            <Bullets items={plan.materials} empty="No special materials." />
          </section>
        </div>

        {agenda.length ? (
          <section>
            <Heading
              icon={Clock}
              aside={
                <span className="text-xs tabular-nums text-muted">
                  {plural(agenda.length, "segment")} · {total} min
                  {planned && planned !== total ? <span className="text-amber-700 dark:text-amber-300"> (planned {planned})</span> : null}
                </span>
              }
            >
              Lesson flow
            </Heading>
            <AgendaBar agenda={agenda} total={total} />
            <ol className="mt-6">
              {agenda.map((seg, i) => {
                const start = starts[i];
                const mins = Number(seg.minutes) || 0;
                const last = i === agenda.length - 1;
                return (
                  <li key={i} className="grid break-inside-avoid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3rem_1.75rem_minmax(0,1fr)] sm:gap-x-4">
                    <div className="hidden pt-1 text-right font-mono text-xs leading-5 tabular-nums sm:block">
                      <div className="text-fg">{fmtClock(start)}</div>
                      <div className="text-faint">{fmtClock(start + mins)}</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border-strong bg-surface text-xs font-semibold tabular-nums">{i + 1}</span>
                      {!last ? <span className="w-0 flex-1 border-l border-border" /> : null}
                    </div>
                    <div className={cn("min-w-0", last ? "pb-1" : "pb-7")}>
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-0.5">
                        <h4 className="font-semibold leading-6">{seg.title}</h4>
                        <span className="text-xs font-medium tabular-nums text-muted">
                          {mins} min
                          <span className="sm:hidden">
                            {" "}
                            · {fmtClock(start)}–{fmtClock(start + mins)}
                          </span>
                        </span>
                      </div>
                      <Rich className="mt-1 text-sm leading-relaxed text-muted">{seg.description}</Rich>
                      {seg.teacher || seg.students ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
                          <RoleNote icon={Presentation} label="Teacher">
                            {seg.teacher}
                          </RoleNote>
                          <RoleNote icon={Users} label="Students">
                            {seg.students}
                          </RoleNote>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="break-inside-avoid">
          <Heading icon={ListChecks}>Checks for understanding</Heading>
          <Bullets items={plan.checksForUnderstanding} />
        </section>

        <section className="break-inside-avoid">
          <Heading icon={HeartHandshake}>Differentiation</Heading>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
                <HeartHandshake className="size-3.5" /> Support
              </p>
              <Bullets items={plan.differentiation?.support} />
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
                <Rocket className="size-3.5" /> Challenge
              </p>
              <Bullets items={plan.differentiation?.challenge} />
            </div>
          </div>
        </section>

        <div className="grid gap-8 sm:grid-cols-2">
          <section className="break-inside-avoid">
            <Heading icon={BookOpen}>Homework</Heading>
            {plan.homework ? <Rich className="text-sm leading-relaxed">{plan.homework}</Rich> : <p className="text-sm text-faint">No homework set.</p>}
          </section>
          <section className="break-inside-avoid">
            <Heading icon={Ticket}>Exit ticket</Heading>
            <Bullets items={plan.exitTicket} numbered />
          </section>
        </div>
      </div>
    </article>
  );
}

export function lessonPlanMarkdown(plan, input = {}, title) {
  const agenda = plan?.agenda ?? [];
  const total = sum(agenda, (a) => a.minutes) || Number(input.durationMin) || 0;
  const style = LESSON_STYLES.find((s) => s.value === input.style);
  const L = [`# ${title || plan.title}`, ""];
  L.push(
    [input.subject && `**Subject:** ${input.subject}`, input.grade && `**Grade:** ${input.grade}`, `**Duration:** ${total} min`, style && `**Style:** ${style.label}`]
      .filter(Boolean)
      .join(" · "),
    "",
  );
  if (plan.overview) L.push(plan.overview, "");
  const list = (heading, items, numbered, level = "##") => {
    if (!items?.length) return;
    if (heading) L.push(`${level} ${heading}`, "");
    items.forEach((it, i) => L.push(`${numbered ? `${i + 1}.` : "-"} ${it}`));
    L.push("");
  };
  list("Learning objectives", plan.objectives);
  list("Prerequisites", plan.prerequisites);
  list("Materials", plan.materials);
  if (agenda.length) {
    L.push("## Lesson flow", "");
    let t = 0;
    agenda.forEach((seg, i) => {
      const mins = Number(seg.minutes) || 0;
      L.push(`### ${i + 1}. ${seg.title} — ${mins} min (${fmtClock(t)}–${fmtClock(t + mins)})`, "");
      t += mins;
      if (seg.description) L.push(seg.description, "");
      if (seg.teacher) L.push(`- **Teacher:** ${seg.teacher}`);
      if (seg.students) L.push(`- **Students:** ${seg.students}`);
      L.push("");
    });
  }
  list("Checks for understanding", plan.checksForUnderstanding);
  if (plan.differentiation?.support?.length || plan.differentiation?.challenge?.length) {
    L.push("## Differentiation", "");
    list("Support", plan.differentiation.support, false, "###");
    list("Challenge", plan.differentiation.challenge, false, "###");
  }
  if (plan.homework) L.push("## Homework", "", plan.homework, "");
  list("Exit ticket", plan.exitTicket, true);
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

// ---- question paper -----------------------------------------------------------------

function AnswerBox({ q }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10 print:border-black/40 print:bg-transparent">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 print:text-black">
          <KeyRound className="size-3.5" /> Answer
        </span>
        {q.bloom ? (
          <Badge tone="violet" className="h-5 px-2 text-[11px] print:border-black/40 print:bg-transparent print:text-black">
            {cap(q.bloom)}
          </Badge>
        ) : null}
        {q.difficulty ? (
          <Badge className="h-5 px-2 text-[11px] print:border-black/40 print:bg-transparent print:text-black">{cap(q.difficulty)}</Badge>
        ) : null}
      </div>
      <Rich className="mt-1.5 text-sm leading-relaxed">{q.answer}</Rich>
    </div>
  );
}

function PaperQuestion({ q, section, answers }) {
  const marks = questionMarks(q, section);
  const options = optionsFor(section.type, q);
  const right = answers ? correctIndex(section.type, q) : -1;
  const long = options.some((o) => String(o).length > 55);
  const lines = answers ? 0 : answerLines(section.type, marks);
  return (
    <li className="break-inside-avoid">
      <div className="flex gap-2.5 sm:gap-3">
        <span className="w-7 shrink-0 pt-px text-[15px] font-semibold tabular-nums">{q.number}.</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <Rich className="min-w-0 flex-1 text-[15px] leading-relaxed">{q.text}</Rich>
            <span className="shrink-0 pt-px text-sm font-medium tabular-nums text-muted print:text-black">[{fmtNum(marks)}]</span>
          </div>
          {options.length ? (
            <ol className={cn("mt-2.5 grid gap-x-8 gap-y-1.5", section.type === "truefalse" ? "max-w-xs grid-cols-2" : !long && "sm:grid-cols-2")}>
              {options.map((o, i) => {
                const hit = i === right;
                return (
                  <li
                    key={i}
                    className={cn(
                      "-mx-1.5 flex items-start gap-2 rounded-md px-1.5 py-0.5 text-sm leading-relaxed",
                      hit && "bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200 print:bg-transparent print:text-black",
                    )}
                  >
                    <span className="shrink-0 tabular-nums">({LETTERS[i]})</span>
                    <Rich className="min-w-0">{o}</Rich>
                    {hit ? <Check className="mt-[3px] size-4 shrink-0" aria-label="Correct option" /> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
          {answers ? <AnswerBox q={q} /> : null}
          {lines ? (
            <div className="print-only mt-2" aria-hidden>
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} className="h-8 border-b border-dotted border-black/50" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** An exam-style question paper. `answers` shows the key inline (answers + Bloom + difficulty). */
export function PaperView({ paper, answers = false, title, className }) {
  const sections = paper?.sections ?? [];
  return (
    <article
      className={cn(
        "print-area mx-auto w-full max-w-[820px] rounded-2xl border border-border bg-surface px-5 py-7 text-fg shadow-soft sm:px-10 sm:py-10 print:max-w-none print:p-0",
        className,
      )}
    >
      {answers ? (
        <p className="mb-6 rounded-lg border-2 border-dashed border-border-strong px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted print:text-black">
          Answer key &amp; marking scheme · for examiner use only
        </p>
      ) : null}

      <header className="text-center">
        {paper.subject ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted print:text-black">{paper.subject}</p> : null}
        <h2 className="mt-2 text-balance font-display text-2xl font-semibold leading-tight tracking-tight sm:text-[1.75rem]">{title || paper.title}</h2>
        {paper.grade ? <p className="mt-1.5 text-sm text-muted print:text-black">{paper.grade}</p> : null}
      </header>

      <div className="mt-6 flex flex-wrap justify-between gap-x-6 gap-y-1 border-y-2 border-fg py-2 text-sm font-medium">
        <span>Time allowed: {fmtDuration(paper.durationMin)}</span>
        <span>Maximum marks: {fmtNum(paper.totalMarks)}</span>
      </div>

      {!answers ? (
        <div className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {["Name", "Roll no.", "Date"].map((label) => (
            <div key={label} className="flex items-end gap-2">
              <span className="shrink-0 text-muted print:text-black">{label}</span>
              <span className="h-5 min-w-0 flex-1 border-b border-border-strong print:border-black" />
            </div>
          ))}
        </div>
      ) : null}

      {paper.instructions?.length ? (
        <section className="mt-6 break-inside-avoid">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em]">General instructions</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:text-muted">
            {paper.instructions.map((t, i) => (
              <li key={i}>
                <Rich>{t}</Rich>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sections.map((section) => {
        const n = section.questions.length;
        const marks = sum(section.questions, (q) => questionMarks(q, section));
        return (
          <section key={section.id ?? section.title} className="mt-9">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-strong pb-2 print:border-black">
              <h3 className="text-base font-semibold tracking-tight">{section.title}</h3>
              <span className="whitespace-nowrap text-sm tabular-nums text-muted print:text-black">
                {n} × {fmtNum(section.marksEach)} = {fmtNum(marks)} marks
              </span>
            </div>
            {n ? (
              <ol className="mt-5 space-y-5">
                {section.questions.map((q) => (
                  <PaperQuestion key={q.id ?? q.number} q={q} section={section} answers={answers} />
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-faint">No questions were generated for this section.</p>
            )}
          </section>
        );
      })}

      <p className="mt-12 text-center text-[11px] font-medium uppercase tracking-[0.3em] text-faint print:text-black">— End of paper —</p>
    </article>
  );
}

export function paperMarkdown(paper, { answers = false, title } = {}) {
  const L = [`# ${title || paper.title}${answers ? " — Answer key" : ""}`, ""];
  L.push(
    [paper.subject && `**Subject:** ${paper.subject}`, paper.grade && `**Grade:** ${paper.grade}`, `**Time allowed:** ${fmtDuration(paper.durationMin)}`, `**Maximum marks:** ${fmtNum(paper.totalMarks)}`]
      .filter(Boolean)
      .join(" · "),
    "",
  );
  if (paper.instructions?.length) {
    L.push("## General instructions", "");
    paper.instructions.forEach((t, i) => L.push(`${i + 1}. ${t}`));
    L.push("");
  }
  for (const s of paper.sections ?? []) {
    const marks = sum(s.questions, (q) => questionMarks(q, s));
    L.push(`## ${s.title}`, "", `_${s.questions.length} × ${fmtNum(s.marksEach)} = ${fmtNum(marks)} marks_`, "");
    for (const q of s.questions) {
      L.push(`**${q.number}.** ${q.text} **[${fmtNum(questionMarks(q, s))}]**`, "");
      const opts = optionsFor(s.type, q);
      if (opts.length) {
        opts.forEach((o, i) => L.push(`(${LETTERS[i]}) ${o}${i < opts.length - 1 ? "  " : ""}`));
        L.push("");
      }
      if (answers) {
        const tags = [cap(q.bloom), cap(q.difficulty)].filter(Boolean).join(" · ");
        const block = `**Answer:** ${q.answer}${tags ? `\n\n_${tags}_` : ""}`;
        L.push(...block.split("\n").map((l) => (l ? `> ${l}` : ">")), "");
      }
    }
  }
  L.push("---", "", "_End of paper_");
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/** Bloom's taxonomy distribution + difficulty mix, for the teacher (not printed). */
export function PaperBalance({ paper, input, className }) {
  const qs = (paper?.sections ?? []).flatMap((s) => s.questions.map((q) => ({ ...q, marks: questionMarks(q, s) })));
  const totalMarks = sum(qs, (q) => q.marks);
  const bloom = BLOOM_LEVELS.map((b) => {
    const items = qs.filter((q) => q.bloom === b.value);
    return { ...b, count: items.length, marks: sum(items, (q) => q.marks) };
  });
  const maxCount = Math.max(1, ...bloom.map((b) => b.count));
  const higher = sum(
    bloom.filter((b) => HIGHER_ORDER.has(b.value)),
    (b) => b.marks,
  );
  const mix = DIFFICULTY_MIX.map((d) => ({ ...d, count: qs.filter((q) => q.difficulty === d.value).length }));
  const perMark = totalMarks ? paper.durationMin / totalMarks : 0;
  const share = (n, of) => (of ? Math.round((n / of) * 100) : 0);

  if (!qs.length) return null;
  return (
    <Card className={cn("no-print p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">Paper balance</h3>
          <p className="mt-0.5 text-sm text-muted">
            {plural(qs.length, "question")} · {fmtNum(totalMarks)} marks · {fmtDuration(paper.durationMin)}
            {perMark ? ` · ${fmtNum(perMark)} min per mark` : ""}
          </p>
        </div>
        {input?.difficulty ? <Badge>Requested: {cap(input.difficulty)}</Badge> : null}
      </div>

      <div className="mt-5 grid gap-7 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <p className="text-xs font-medium text-muted">Bloom's taxonomy · questions per level</p>
          <ul className="mt-3 space-y-1.5">
            {bloom.map((b) => (
              <li key={b.value}>
                <Tip content={`${b.label}: ${plural(b.count, "question")} · ${fmtNum(b.marks)} marks (${share(b.marks, totalMarks)}% of marks)`}>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 rounded-md py-0.5 text-xs">
                    <span className="text-muted">{b.label}</span>
                    <div className="flex h-4 min-w-0 items-center gap-2 border-l border-border-strong">
                      {b.count ? <div className="h-2.5 shrink-0 rounded-r-[4px] bg-brand-700 dark:bg-brand-400" style={{ width: `${(b.count / maxCount) * 78}%` }} /> : null}
                      <span className={cn("tabular-nums", b.count ? "font-medium text-fg" : "pl-1 text-faint")}>{b.count}</span>
                    </div>
                  </div>
                </Tip>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Higher-order thinking (analyze, evaluate, create): <span className="font-medium text-fg">{share(higher, totalMarks)}% of marks</span>
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted">Difficulty mix</p>
          <div className="mt-3 flex h-3 w-full gap-0.5">
            {mix
              .filter((d) => d.count)
              .map((d) => (
                <Tip key={d.value} content={`${d.label}: ${plural(d.count, "question")} (${share(d.count, qs.length)}%)`}>
                  <div style={{ flex: `${d.count} 1 0%` }} className={cn("first:rounded-l-[4px] last:rounded-r-[4px]", d.swatch)} />
                </Tip>
              ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {mix.map((d) => (
              <li key={d.value} className="flex items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-[3px]", d.swatch)} />
                <span className="text-muted">{d.label}</span>
                <span className="ml-auto font-medium tabular-nums">{d.count}</span>
                <span className="w-9 text-right tabular-nums text-faint">{share(d.count, qs.length)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

// ---- answer check ---------------------------------------------------------------------

function AnswerPane({ label, icon: Icon, children, subdued }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-border p-3", subdued ? "bg-surface" : "bg-surface-2")}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <Icon className="size-3.5" />
        {label}
      </p>
      <Rich className={cn("mt-1.5 text-sm leading-relaxed", subdued && "italic text-muted")}>{children}</Rich>
    </div>
  );
}

function QuestionCheck({ q }) {
  const v = VERDICT[q.verdict] ?? VERDICT.incorrect;
  const Icon = v.icon;
  return (
    <li className={cn("break-inside-avoid rounded-2xl border border-l-4 border-border bg-surface p-4 shadow-soft sm:p-5", v.accent)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-subtle px-1.5 text-xs font-semibold tabular-nums print:border print:border-border">Q{q.number}</span>
          <Rich className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-relaxed">{q.question}</Rich>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Badge tone={v.tone} className="print:border-black/40 print:bg-transparent print:text-black">
            <Icon />
            {v.label}
          </Badge>
          <span className="text-sm font-semibold tabular-nums">
            {fmtNum(q.score)}
            <span className="font-normal text-muted">/{fmtNum(q.maxScore)}</span>
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-2.5 md:grid-cols-2 print:grid-cols-2">
        <AnswerPane label="Expected · answer key" icon={KeyRound}>
          {q.expected || "—"}
        </AnswerPane>
        <AnswerPane label="Student wrote · transcribed" icon={ScanLine} subdued={!q.studentAnswer}>
          {q.studentAnswer || "No answer found on the sheet."}
        </AnswerPane>
      </div>
      {q.feedback ? (
        <div className="mt-3 flex gap-2 text-sm">
          <MessageSquareText className="mt-[3px] size-4 shrink-0 text-faint" />
          <Rich className="min-w-0 flex-1 leading-relaxed text-muted">{q.feedback}</Rich>
        </div>
      ) : null}
    </li>
  );
}

export function AnswerCheckView({ result, input, title, createdAt }) {
  const questions = result?.questions ?? [];
  const total = Number(result?.totalScore) || 0;
  const max = Number(result?.maxScore) || 0;
  const pct = max ? (total / max) * 100 : 0;
  const counts = VERDICT_ORDER.map((v) => ({ v, n: questions.filter((q) => q.verdict === v).length })).filter((c) => c.n);
  const leg = LEGIBILITY[result?.legibility] ?? null;
  const LegIcon = leg?.icon;
  const ringTone = pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-brand-500" : "text-rose-500";
  const pages = input?.files?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="print-only">
        <h1 className="text-xl font-semibold">{title}</h1>
        {createdAt ? <p className="mt-1 text-sm">Checked {dateTime(createdAt)}</p> : null}
      </div>

      <Card className="break-inside-avoid overflow-hidden">
        <div className="flex flex-col items-center gap-5 p-5 text-center sm:flex-row sm:gap-7 sm:p-6 sm:text-left">
          <Ring value={pct} size={112} stroke={10} barClassName={ringTone}>
            <div className="text-center">
              <p className="text-2xl font-semibold tracking-tight">{Math.round(pct)}%</p>
              <p className="text-[11px] text-muted">score</p>
            </div>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">
              {result?.studentName ? (
                <>
                  Student · <span className="font-medium text-fg">{result.studentName}</span>
                </>
              ) : (
                "No name found on the sheet"
              )}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              {fmtNum(total)} <span className="text-lg font-medium text-muted">/ {fmtNum(max)} marks</span>
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {leg ? (
                <Badge tone={leg.tone}>
                  <LegIcon />
                  {leg.label}
                </Badge>
              ) : null}
              {counts.map(({ v, n }) => (
                <Badge key={v} tone={VERDICT[v].tone} dot>
                  {n} {VERDICT[v].short}
                </Badge>
              ))}
            </div>
            {pages || input?.strictness ? (
              <p className="mt-2.5 text-xs text-faint">
                {[pages ? `${plural(pages, "page")} checked` : null, input?.strictness ? `${cap(input.strictness)} marking` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        {result?.legibility === "hard_to_read" ? (
          <div className="flex gap-2.5 border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">Parts of this sheet were hard to read.</span> Check the transcribed answers below before relying on these marks — a sharper,
              well-lit photo taken straight on usually fixes it.
            </p>
          </div>
        ) : null}
      </Card>

      {result?.overallFeedback ? (
        <Card className="ai-surface break-inside-avoid p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Sparkles className="size-4 text-brand-700 dark:text-brand-400 print:hidden" />
            Overall feedback
          </h3>
          <Rich className="mt-2 text-sm leading-relaxed">{result.overallFeedback}</Rich>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
        <Card className="break-inside-avoid p-5">
          <Heading icon={CircleCheck}>Strengths</Heading>
          <Bullets items={result?.strengths} icon={Check} iconClassName="text-emerald-600 dark:text-emerald-400 print:text-black" empty="Nothing specific noted." />
        </Card>
        <Card className="break-inside-avoid p-5">
          <Heading icon={Flag} aside={<span className="text-xs text-faint">Most important first</span>}>
            Focus areas
          </Heading>
          <Bullets items={result?.focusAreas} numbered empty="No gaps found — nice work." />
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-semibold tracking-tight">Question by question</h3>
          <span className="text-xs text-muted">{plural(questions.length, "question")}</span>
        </div>
        {questions.length ? (
          <ol className="space-y-3">
            {questions.map((q, i) => (
              <QuestionCheck key={`${q.number}-${i}`} q={q} />
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">No questions could be matched between the key and the sheet.</p>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-px size-4 shrink-0" />
        AI-assisted marking. Handwriting transcription can be imperfect, so a teacher should review each answer before marks are recorded.
      </p>
    </div>
  );
}

export function answerCheckMarkdown(result, { title } = {}) {
  const questions = result?.questions ?? [];
  const total = Number(result?.totalScore) || 0;
  const max = Number(result?.maxScore) || 0;
  const pct = max ? Math.round((total / max) * 100) : 0;
  const L = [`# ${title || "Answer check"}`, ""];
  L.push([result?.studentName && `**Student:** ${result.studentName}`, `**Score:** ${fmtNum(total)} / ${fmtNum(max)} (${pct}%)`].filter(Boolean).join(" · "), "");
  if (result?.overallFeedback) L.push("## Overall feedback", "", result.overallFeedback, "");
  const list = (heading, items, numbered) => {
    if (!items?.length) return;
    L.push(`## ${heading}`, "");
    items.forEach((it, i) => L.push(`${numbered ? `${i + 1}.` : "-"} ${it}`));
    L.push("");
  };
  list("Strengths", result?.strengths);
  list("Focus areas", result?.focusAreas, true);
  if (questions.length) {
    L.push("## Question by question", "");
    questions.forEach((q) => {
      const v = VERDICT[q.verdict]?.label ?? q.verdict;
      L.push(`- **Q${q.number}** · ${v} · ${fmtNum(q.score)}/${fmtNum(q.maxScore)}${q.feedback ? ` — ${q.feedback}` : ""}`);
    });
    L.push("");
  }
  L.push("_AI-assisted marking — to be reviewed by a teacher._");
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

import { Link } from "react-router";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  ClipboardCheck,
  FileQuestion,
  Flame,
  GalleryVerticalEnd,
  LineChart,
  ListChecks,
  Moon,
  NotebookPen,
  ScanLine,
  Sparkles,
  Sun,
  Timer,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const STUDENT_FEATURES = [
  { icon: Bot, title: "Socratic AI tutor", text: "Grounded in your class notes. Snap a photo of a problem and it walks you to the answer — with citations." },
  { icon: Sparkles, title: "Study Studio", text: "Turn a PDF, notes or a photo into a summary, glossary, flashcards and a quiz in one go. Then chat with it." },
  { icon: GalleryVerticalEnd, title: "FSRS flashcards", text: "The scheduler behind modern Anki: every card comes back right before you'd forget it." },
  { icon: ListChecks, title: "Adaptive quizzes", text: "Every answer updates your concept mastery. One click builds a quiz on exactly what you keep missing." },
];

const TEACHER_FEATURES = [
  { icon: ClipboardCheck, title: "AI draft grading", text: "Rubric-aligned scores and feedback for every submission — you review, tweak and return." },
  { icon: ScanLine, title: "Handwritten answer checker", text: "Photograph an answer sheet, add the key, get per-question marks and feedback in seconds." },
  { icon: FileQuestion, title: "Question paper builder", text: "Sections, marks and Bloom's levels, from your own materials. Print it or turn it into a live quiz." },
  { icon: LineChart, title: "Class insights", text: "Spot at-risk students early, see which concepts the class is missing and what to reteach next." },
];

function Preview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-linear-to-br from-brand-300/40 via-orange-200/30 to-transparent blur-2xl dark:from-brand-500/20 dark:via-orange-500/10" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="rounded-3xl border border-border bg-surface p-4 shadow-lift">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-[#16140f]">
              <Bot className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Tutor · Socratic</p>
              <p className="text-[11px] text-muted">Physics — Grade 11</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Using class notes</span>
        </div>
        <div className="space-y-3 py-4 text-sm">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-on-ink">Why is the range biggest at 45°?</div>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 leading-relaxed">
            Great question. Your notes give <span className="font-mono text-[13px]">R = u² sin 2θ / g</span>{" "}
            <mark className="rounded bg-brand-100 px-1 text-[11px] font-medium text-brand-900 dark:bg-brand-500/20 dark:text-brand-200">Kinematics summary</mark>. What value of 2θ makes sin 2θ as large as possible?
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Flame, label: "Streak", value: "12 days", cls: "text-orange-500" },
            { icon: GalleryVerticalEnd, label: "Due today", value: "18 cards", cls: "text-sky-500" },
            { icon: ListChecks, label: "Mastery", value: "82%", cls: "text-emerald-500" },
          ].map(({ icon: Icon, label, value, cls }) => (
            <div key={label} className="rounded-xl border border-border bg-surface-2/60 p-2.5">
              <Icon className={`size-4 ${cls}`} />
              <p className="mt-1.5 text-[11px] text-muted">{label}</p>
              <p className="text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="absolute -bottom-24 -right-6 hidden w-56 rounded-2xl border border-border bg-surface p-3 shadow-lift sm:block"
      >
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <ClipboardCheck className="size-3.5" /> AI draft grade
        </p>
        <p className="mt-1 text-2xl font-semibold">
          17<span className="text-base text-muted">/20</span>
        </p>
        <div className="mt-2 space-y-1.5">
          {[
            ["Method", 90],
            ["Analysis", 80],
            ["Errors", 75],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-[11px]">
              <span className="w-14 text-muted">{k}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${v}%` }} />
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function FeatureGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map(({ icon: Icon, title, text }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: i * 0.06 }}
          className="rounded-2xl border border-border bg-surface p-5 shadow-soft"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
            <Icon className="size-5" />
          </span>
          <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
        </motion.div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { status } = useAuth();
  const { resolved, toggle } = useTheme();
  const authed = status === "authenticated";

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="EduCare home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme">
              {resolved === "dark" ? <Sun /> : <Moon />}
            </Button>
            {authed ? (
              <Button asChild>
                <Link to="/app">
                  Open app <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-32 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div>
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-soft">
              <Sparkles className="size-3.5 text-brand-600" /> AI tutor · FSRS flashcards · AI grading
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-6 text-balance font-display text-[2.75rem] font-semibold leading-[1.02] tracking-tight sm:text-6xl"
            >
              The classroom that <span className="relative whitespace-nowrap"><span className="relative z-10">thinks with you</span><span className="absolute inset-x-0 bottom-1 -z-0 h-4 rounded bg-brand-400/60 sm:h-5" /></span>.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
              EduCare brings classes, assignments and grading together with an AI tutor that knows your course, study tools grounded in real learning science, and insights that tell teachers who needs help — before the exam does.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to={authed ? "/app" : "/register?role=student"}>
                  {authed ? "Go to dashboard" : "Start learning"} <ArrowRight />
                </Link>
              </Button>
              {!authed ? (
                <Button size="lg" variant="secondary" asChild>
                  <Link to="/register?role=teacher">I'm a teacher</Link>
                </Button>
              ) : null}
            </motion.div>
            <p className="mt-6 text-xs text-faint">Free for classrooms · Works on any device · Sign in with email or SAP ID</p>
          </div>
          <Preview />
        </div>
      </section>

      <section className="border-y border-border bg-surface-2/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">For students</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Study like the research says you should.</h2>
              <p className="mt-3 text-muted">Retrieval practice, spacing and immediate feedback — built in, not bolted on.</p>
              <div className="mt-8">
                <FeatureGrid items={STUDENT_FEATURES} />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">For teachers</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Spend time on students, not paperwork.</h2>
              <p className="mt-3 text-muted">AI drafts the grading, papers and lesson plans. You stay in control of every mark.</p>
              <div className="mt-8">
                <FeatureGrid items={TEACHER_FEATURES} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: NotebookPen, title: "Lesson planner", text: "Timed, differentiated lesson plans with exit tickets — ready to print." },
            { icon: CalendarClock, title: "Live sessions", text: "Schedule a class call in one click; students see it with a countdown." },
            { icon: Timer, title: "Focus & streaks", text: "A built-in Pomodoro, XP, streaks and class leaderboards that reward consistency." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-2xl p-2">
              <Icon className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-400" />
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-20 overflow-hidden rounded-3xl bg-[#16140f] px-6 py-14 text-center text-[#f5f2ea] sm:px-12">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-brand-500/30 blur-3xl" />
          <h2 className="relative font-display text-4xl font-semibold tracking-tight">Bring your class along.</h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/60">Create a class, share the 7-letter join code, and you're teaching in minutes.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to={authed ? "/app" : "/register"}>
                {authed ? "Open EduCare" : "Create a free account"} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo markClassName="size-6" className="[&_span]:text-base" />
          <p>© {new Date().getFullYear()} EduCare. Learn deeper, teach smarter.</p>
        </div>
      </footer>
    </div>
  );
}

import { Link } from "react-router";
import { Bot, GalleryVerticalEnd, LineChart, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";

const POINTS = [
  { icon: Bot, title: "A tutor that knows your class", text: "Socratic AI grounded in your teacher's notes — it guides, never just hands over answers." },
  { icon: GalleryVerticalEnd, title: "Remember what you learn", text: "FSRS spaced repetition schedules every flashcard at the moment you're about to forget." },
  { icon: LineChart, title: "Teaching, with signal", text: "AI draft grading, rubric feedback and early warnings for students who are slipping." },
];

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#16140f] p-10 text-[#f5f2ea] lg:flex lg:flex-col">
        <div className="dot-grid absolute inset-0 opacity-[0.35] [--fg:#fff]" />
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-orange-500/15 blur-3xl" />
        <Link to="/" className="relative">
          <span className="inline-flex items-center gap-2.5">
            <svg viewBox="0 0 64 64" className="size-9" aria-hidden="true">
              <rect width="64" height="64" rx="16" fill="#FFC700" />
              <path d="M32 11c1.6 9.4 5.2 14.4 17 17-11.8 2.6-15.4 7.6-17 17-1.6-9.4-5.2-14.4-17-17 11.8-2.6 15.4-7.6 17-17z" fill="#16140F" />
            </svg>
            <span className="font-display text-2xl font-bold tracking-tight">
              Edu<span className="text-brand-400">Care</span>
            </span>
          </span>
        </Link>

        <div className="relative my-auto max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-200">
            <Sparkles className="size-3.5" /> The AI-native classroom
          </p>
          <h2 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Learn deeper.
            <br />
            <span className="text-brand-400">Teach smarter.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/8 text-brand-300 ring-1 ring-white/10">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">Built for classrooms that want more than a file dump.</p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Link to="/">
            <Logo />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-center text-sm text-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

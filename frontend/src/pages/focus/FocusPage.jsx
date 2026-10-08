import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, Brain, Coffee, Flag, Pause, Play, RotateCcw, SkipForward, Sparkles, Timer } from "lucide-react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { useFocus, PRESETS, clock } from "@/lib/focus";
import { cn, plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";

const TIPS = [
  { icon: Brain, title: "One task per session", text: "Decide exactly what you'll work on before you start. Switching tasks costs focus." },
  { icon: BellRing, title: "Silence the phone", text: "Even a phone face-down on the desk measurably drains attention. Put it in another room." },
  { icon: Coffee, title: "Really rest on breaks", text: "Stand up, stretch, look far away. Skip scrolling — it isn't rest for your brain." },
  { icon: Sparkles, title: "End with retrieval", text: "Spend the last 2 minutes recalling what you learned without notes. It locks it in." },
];

function BigRing({ progress, phase, children }) {
  const size = 288;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = phase === "rest" ? "text-emerald-500" : phase === "paused" ? "text-faint" : "text-brand-500";
  return (
    <div className="relative mx-auto grid aspect-square w-full max-w-72 place-items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-subtle" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          className={cn("transition-[stroke-dashoffset] duration-300 ease-linear", color)}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

function WeekChart({ refreshKey }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["activity", "summary", 30], queryFn: () => api.get("/activity/summary?days=30") });
  useEffect(() => {
    if (refreshKey) qc.invalidateQueries({ queryKey: ["activity", "summary"] });
  }, [refreshKey, qc]);

  const days = (data?.days ?? []).slice(-14).map((d) => ({ ...d, label: format(parseISO(d.day), "EEE d") }));
  const total14 = days.reduce((s, d) => s + d.focusMinutes, 0);

  return (
    <Card>
      <CardHeader icon={Timer} title="Focus time" description={data ? `${data.weekFocusMinutes} min this week · ${total14} min in 2 weeks` : "Last 14 days"} />
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ left: -22, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip
                cursor={{ fill: "var(--subtle)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
                      <p className="font-medium">{payload[0].payload.label}</p>
                      <p className="text-muted">{payload[0].value} min focused</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="focusMinutes" radius={[5, 5, 0, 0]} fill="var(--color-brand-500)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FocusPage() {
  const focus = useFocus();
  const [custom, setCustom] = useState({ focusMin: focus.focusMin, restMin: focus.restMin });
  const startRef = useRef(null);

  useEffect(() => setCustom({ focusMin: focus.focusMin, restMin: focus.restMin }), [focus.focusMin, focus.restMin]);

  const idle = focus.phase === "idle";
  const progress = focus.totalMs ? 1 - focus.remainingMs / focus.totalMs : 0;
  const activePreset = PRESETS.find((p) => p.focus === focus.focusMin && p.rest === focus.restMin)?.id;

  // Space toggles start/pause (unless typing).
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" || e.target.closest?.("input, textarea, select, button, [contenteditable='true']")) return;
      e.preventDefault();
      if (focus.phase === "focus") focus.pause();
      else if (focus.phase === "idle" || focus.phase === "paused") focus.start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  // Reflect the countdown in the tab title while running.
  useEffect(() => {
    const original = document.title;
    if (focus.phase !== "idle") document.title = `${clock(focus.remainingMs)} · ${focus.phase === "rest" ? "Break" : "Focus"} · EduCare`;
    return () => {
      document.title = original;
    };
  }, [focus.phase, focus.remainingMs]);

  const phaseLabel = { idle: "Ready", focus: "Focusing", paused: "Paused", rest: "Break" }[focus.phase];

  return (
    <div>
      <PageHeader title="Focus timer" description="Pomodoro-style sessions. Each focused minute earns XP and keeps your streak alive — the timer keeps running while you use the rest of EduCare." />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-6 sm:p-10">
          <BigRing progress={idle ? 0 : progress} phase={focus.phase}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", focus.phase === "rest" ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>{phaseLabel}</p>
            <p className="mt-2 font-mono text-6xl font-medium tabular-nums tracking-tight sm:text-7xl">{clock(focus.remainingMs)}</p>
            <p className="mt-2 max-w-48 truncate text-sm text-muted">{focus.label || (focus.phase === "rest" ? "Stretch, breathe, hydrate" : `${focus.focusMin} min focus · ${focus.restMin} min break`)}</p>
          </BigRing>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {focus.phase === "focus" ? (
              <Button size="lg" variant="ink" onClick={focus.pause}>
                <Pause /> Pause
              </Button>
            ) : focus.phase === "rest" ? (
              <Button size="lg" variant="secondary" onClick={focus.skipBreak}>
                <SkipForward /> Skip break
              </Button>
            ) : (
              <Button ref={startRef} size="lg" onClick={focus.start} className="min-w-36">
                <Play /> {focus.phase === "paused" ? "Resume" : "Start focus"}
              </Button>
            )}
            {focus.phase === "focus" || focus.phase === "paused" ? (
              <Button size="lg" variant="secondary" onClick={focus.finish}>
                <Flag /> Finish early
              </Button>
            ) : null}
            {!idle ? (
              <Button size="lg" variant="ghost" onClick={focus.reset}>
                <RotateCcw /> Reset
              </Button>
            ) : null}
          </div>
          <p className="mt-3 text-center text-xs text-faint">
            Press <Kbd>Space</Kbd> to start or pause · finishing early still logs the minutes you focused
          </p>

          <div className="mx-auto mt-10 max-w-xl space-y-5 border-t border-border pt-8">
            <Field label="What are you working on?" optional>
              {(p) => <Input {...p} value={focus.label} onChange={(e) => focus.setLabel(e.target.value)} maxLength={80} placeholder="e.g. Chemistry chapter 4 problems" />}
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium">Session length</p>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    disabled={!idle}
                    onClick={() => focus.configure({ focusMin: p.focus, restMin: p.rest })}
                    className={cn(
                      "rounded-xl border p-3 text-left transition disabled:opacity-50",
                      activePreset === p.id ? "border-brand-500 bg-brand-50 ring-3 ring-brand-500/15 dark:bg-brand-500/10" : "border-border hover:border-border-strong",
                    )}
                  >
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="text-xs text-muted">
                      {p.focus} / {p.rest} min
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Focus (min)">
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      max={180}
                      disabled={!idle}
                      value={custom.focusMin}
                      onChange={(e) => setCustom((c) => ({ ...c, focusMin: e.target.value }))}
                      onBlur={() => {
                        const v = Math.max(1, Math.min(180, Number(custom.focusMin) || 25));
                        focus.configure({ focusMin: v, restMin: focus.restMin });
                      }}
                    />
                  )}
                </Field>
                <Field label="Break (min)">
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      max={60}
                      disabled={!idle}
                      value={custom.restMin}
                      onChange={(e) => setCustom((c) => ({ ...c, restMin: e.target.value }))}
                      onBlur={() => {
                        const v = Math.max(1, Math.min(60, Number(custom.restMin) || 5));
                        focus.configure({ focusMin: focus.focusMin, restMin: v });
                      }}
                    />
                  )}
                </Field>
              </div>
              {!idle ? <p className="mt-2 text-xs text-muted">Reset the timer to change lengths.</p> : null}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-sm text-muted">Sessions completed today</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{focus.completedToday}</p>
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: Math.max(4, focus.completedToday) }).map((_, i) => (
                <span key={i} className={cn("h-2 flex-1 rounded-full", i < focus.completedToday ? "bg-brand-500" : "bg-subtle")} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{focus.completedToday >= 4 ? "Great rhythm — consider a longer break." : `${plural(Math.max(0, 4 - focus.completedToday), "session")} to a full cycle`}</p>
          </Card>
          <WeekChart refreshKey={focus.completedToday} />
          <Card>
            <CardHeader icon={Sparkles} title="Focus better" />
            <CardContent className="space-y-4 pt-3">
              {TIPS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-sm text-muted">{text}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

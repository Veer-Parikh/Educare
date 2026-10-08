import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "./api";
import { useAuth } from "./auth";
import { useCelebrate } from "./rewards";

// Global Pomodoro timer. Lives above the router so it keeps running while you
// navigate, and persists to localStorage so a refresh doesn't lose a session.

const KEY = "educare.focus";
const FocusContext = createContext(null);

export const PRESETS = [
  { id: "classic", label: "Classic", focus: 25, rest: 5 },
  { id: "deep", label: "Deep work", focus: 50, rest: 10 },
  { id: "sprint", label: "Sprint", focus: 15, rest: 3 },
];

const initial = { phase: "idle", focusMin: 25, restMin: 5, endsAt: null, remainingMs: 25 * 60_000, label: "", completedToday: 0, completedDay: null };

const today = () => new Date().toDateString();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === "object") {
      const state = { ...initial, ...raw };
      // The daily session count resets at midnight.
      if (state.completedDay !== today()) state.completedToday = 0;
      return state;
    }
  } catch {
    /* ignore */
  }
  return initial;
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.65);
    });
  } catch {
    /* audio blocked */
  }
}

export function FocusProvider({ children }) {
  const { status } = useAuth();
  const celebrate = useCelebrate();
  const [state, setState] = useState(load);
  const [now, setNow] = useState(Date.now());
  const loggingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const running = state.phase === "focus" || state.phase === "rest";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const remainingMs = running ? Math.max(0, state.endsAt - now) : state.remainingMs;

  const logFocus = useCallback(
    async (mins, label) => {
      if (status !== "authenticated" || loggingRef.current || mins < 1) return;
      loggingRef.current = true;
      try {
        const { reward } = await api.post("/activity/focus", { minutes: Math.round(mins), label: label || undefined });
        celebrate(reward, "focus session");
      } catch {
        /* offline: the session still counts locally */
      } finally {
        loggingRef.current = false;
      }
    },
    [status, celebrate],
  );

  // Phase transitions when the clock hits zero.
  useEffect(() => {
    if (!running || remainingMs > 0) return;
    chime();
    if (state.phase === "focus") {
      logFocus(state.focusMin, state.label);
      toast.success("Focus session complete — take a break.");
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification("EduCare", { body: "Focus session complete. Time for a break!" });
      }
      setState((s) => ({
        ...s,
        phase: "rest",
        endsAt: Date.now() + s.restMin * 60_000,
        completedToday: (s.completedDay === today() ? s.completedToday : 0) + 1,
        completedDay: today(),
      }));
    } else {
      toast("Break's over. Ready for another round?");
      setState((s) => ({ ...s, phase: "idle", endsAt: null, remainingMs: s.focusMin * 60_000 }));
    }
  }, [running, remainingMs, state.phase, state.focusMin, state.label, logFocus]);

  const api_ = useMemo(
    () => ({
      ...state,
      remainingMs,
      running,
      totalMs: (state.phase === "rest" ? state.restMin : state.focusMin) * 60_000,
      start: () => {
        if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
        setState((s) => ({ ...s, phase: "focus", endsAt: Date.now() + (s.phase === "paused" ? s.remainingMs : s.focusMin * 60_000) }));
      },
      pause: () => setState((s) => (s.phase === "focus" ? { ...s, phase: "paused", remainingMs: Math.max(0, s.endsAt - Date.now()), endsAt: null } : s)),
      reset: () => setState((s) => ({ ...s, phase: "idle", endsAt: null, remainingMs: s.focusMin * 60_000 })),
      /** End early and still log the minutes actually focused. */
      finish: () => {
        const elapsed = state.focusMin - (state.phase === "focus" ? Math.max(0, state.endsAt - Date.now()) : state.remainingMs) / 60_000;
        if (elapsed >= 1) logFocus(elapsed, state.label);
        setState((s) => ({ ...s, phase: "idle", endsAt: null, remainingMs: s.focusMin * 60_000 }));
      },
      skipBreak: () => setState((s) => ({ ...s, phase: "idle", endsAt: null, remainingMs: s.focusMin * 60_000 })),
      configure: ({ focusMin, restMin }) =>
        setState((s) => (s.phase === "idle" ? { ...s, focusMin, restMin, remainingMs: focusMin * 60_000 } : { ...s, focusMin, restMin })),
      setLabel: (label) => setState((s) => ({ ...s, label })),
    }),
    [state, remainingMs, running, logFocus],
  );

  return <FocusContext.Provider value={api_}>{children}</FocusContext.Provider>;
}

export const useFocus = () => useContext(FocusContext);

export const clock = (ms) => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

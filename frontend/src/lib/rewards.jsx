import { useCallback } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Flame, Sparkles } from "lucide-react";
import { useAuth } from "./auth";

const BRAND = ["#FFC700", "#FFD84D", "#FF9F1C", "#16140F", "#FFFFFF"];

export function burst(intensity = 1) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: Math.round(80 * intensity), spread: 70, startVelocity: 38, origin: { y: 0.7 }, colors: BRAND, scalar: 0.9 });
}

function RewardToast({ reward, label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-full bg-brand-500 text-ink animate-pop">
        <Sparkles className="size-4" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">+{reward.xp} XP{label ? ` · ${label}` : ""}</p>
        {reward.leveledStreak && reward.streak > 0 ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <Flame className="size-3.5 text-orange-500" /> {reward.streak}-day streak
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Returns `celebrate(reward, label?)`: shows an XP toast for API responses that
 * include a `reward`, refreshes the user's XP/streak, and throws confetti on milestones.
 */
export function useCelebrate() {
  const { refresh, user } = useAuth();
  return useCallback(
    (reward, label) => {
      if (!reward || !(reward.xp > 0 || reward.leveledStreak)) return;
      const before = user?.level?.level;
      toast.custom(() => (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-lift">
          <RewardToast reward={reward} label={label} />
        </div>
      ));
      if (reward.leveledStreak && [3, 7, 14, 30, 50, 100].includes(reward.streak)) burst(1.2);
      refresh().then((me) => {
        if (me && before && me.level.level > before) {
          burst(1.5);
          toast.success(`Level up! You're now level ${me.level.level}.`);
        }
      });
    },
    [refresh, user?.level?.level],
  );
}

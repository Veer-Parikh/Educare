import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, LogOut, RotateCcw, Repeat } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useConfirm } from "@/components/ui/confirm";

const link = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium underline-offset-4 hover:underline disabled:opacity-50 [&_svg]:size-3.5";

/** Strip shown while signed in to the in-browser demo. */
export function DemoBanner() {
  const { isDemo, isTeacher, user, startDemo, resetDemo, logout } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!isDemo) return null;

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      qc.clear();
      navigate("/app");
    } finally {
      setBusy(false);
    }
  };

  const switchRole = () => act(() => startDemo(isTeacher ? "STUDENT" : "TEACHER"));

  const reset = async () => {
    const ok = await confirm({
      title: "Reset the demo?",
      description: "Everything you've created in this demo is removed and the sample data is restored.",
      confirmLabel: "Reset demo",
      danger: true,
    });
    if (ok) await act(async () => {
      await resetDemo();
      toast.success("Demo data restored");
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-brand-300/60 bg-brand-50 px-4 py-1.5 text-center text-xs text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100">
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical className="size-3.5" />
        <span>
          <strong className="font-semibold">Demo mode</strong> · signed in as {user.name} ({isTeacher ? "teacher" : "student"}) · data stays in this browser, AI replies are simulated
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <button type="button" className={link} onClick={switchRole} disabled={busy}>
          <Repeat /> Switch to {isTeacher ? "student" : "teacher"}
        </button>
        <button type="button" className={link} onClick={reset} disabled={busy}>
          <RotateCcw /> Reset
        </button>
        <button type="button" className={link} onClick={logout} disabled={busy}>
          <LogOut /> Exit
        </button>
      </span>
    </div>
  );
}

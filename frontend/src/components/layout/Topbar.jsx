import { Link, useNavigate } from "react-router";
import { Flame, LogOut, Menu as MenuIcon, Monitor, Moon, Search, Settings, Sun, Timer, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useFocus, clock } from "@/lib/focus";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from "@/components/ui/menu";
import { NotificationsMenu } from "./Notifications";

function FocusChip() {
  const focus = useFocus();
  if (!focus || focus.phase === "idle") return null;
  const rest = focus.phase === "rest";
  return (
    <Tip content={rest ? "Break in progress" : focus.phase === "paused" ? "Focus paused" : "Focus session running"}>
      <Link
        to="/app/focus"
        className={cn(
          "hidden h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-xs font-medium tabular-nums transition sm:inline-flex",
          rest ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200",
        )}
      >
        <Timer className={cn("size-3.5", focus.phase === "focus" && "animate-pulse")} />
        {clock(focus.remainingMs)}
      </Link>
    </Tip>
  );
}

function StreakChip() {
  const { user, isStudent } = useAuth();
  if (!isStudent || !user) return null;
  const s = user.currentStreak ?? 0;
  return (
    <Tip content={s ? `${s}-day streak · keep it going today` : "Start a streak — do any activity today"}>
      <Link to="/app/progress" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold tabular-nums transition hover:border-border-strong">
        <Flame className={cn("size-3.5", s ? "text-orange-500" : "text-faint")} />
        {s}
      </Link>
    </Tip>
  );
}

export function Topbar({ onOpenNav, onOpenSearch }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-bg/80 px-4 backdrop-blur-lg md:px-6">
      <button onClick={onOpenNav} className="-ml-1 grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg lg:hidden" aria-label="Open navigation">
        <MenuIcon className="size-5" />
      </button>

      <button
        onClick={onOpenSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm text-faint shadow-soft transition hover:border-border-strong sm:max-w-sm"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search or jump to…</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <FocusChip />
        <StreakChip />
        <NotificationsMenu />
        <Menu>
          <MenuTrigger asChild>
            <button className="ml-1 rounded-full ring-offset-2 ring-offset-bg transition hover:ring-2 hover:ring-border-strong" aria-label="Account menu">
              <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
            </button>
          </MenuTrigger>
          <MenuContent className="w-60">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <MenuSeparator />
            <MenuItem icon={UserRound} onSelect={() => navigate("/app/settings")}>Profile</MenuItem>
            <MenuItem icon={Settings} onSelect={() => navigate("/app/settings#preferences")}>Settings</MenuItem>
            <MenuSeparator />
            <MenuLabel>Theme</MenuLabel>
            <div className="grid grid-cols-3 gap-1 px-1 pb-1">
              {[
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
                ["system", Monitor, "Auto"],
              ].map(([value, Icon, label]) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn("flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition", theme === value ? "bg-subtle text-fg" : "text-muted hover:bg-subtle/60")}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <MenuSeparator />
            <MenuItem icon={LogOut} onSelect={logout} danger>
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

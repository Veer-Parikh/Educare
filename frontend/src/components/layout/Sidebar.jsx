import { NavLink } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NAV, SETTINGS_ITEM } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/avatar";
import { Tip } from "@/components/ui/menu";

function useDueCount(enabled) {
  const q = useQuery({
    queryKey: ["review", "count"],
    queryFn: () => api.get("/review/queue?limit=1"),
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  return q.data?.total ?? 0;
}

function NavItem({ item, collapsed, badge, onNavigate }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
          collapsed && "justify-center px-0",
          isActive ? "bg-surface text-fg shadow-soft ring-1 ring-border" : "text-muted hover:bg-subtle hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed ? <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" /> : null}
          <Icon className={cn("size-[18px] shrink-0", isActive ? "text-fg" : "text-faint group-hover:text-fg")} />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
          {badge ? (
            <span
              className={cn(
                "grid min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold leading-5 text-[#16140f]",
                collapsed ? "absolute -right-0.5 -top-0.5 min-w-4 px-1 text-[10px] leading-4" : "ml-auto",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tip content={item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

export function Sidebar({ collapsed, onToggle, onNavigate, mobile }) {
  const { user } = useAuth();
  const groups = NAV[user?.role] ?? NAV.STUDENT;
  const due = useDueCount(Boolean(user));

  return (
    <aside className={cn("flex h-full flex-col gap-2 bg-surface-2/70", collapsed ? "w-[68px] px-2.5" : "w-64 px-3")}>
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between px-1.5")}>
        <NavLink to="/app" onClick={onNavigate} aria-label="EduCare home">
          <Logo compact={collapsed} markClassName="size-8" />
        </NavLink>
        {!mobile && !collapsed ? (
          <button onClick={onToggle} className="rounded-lg p-1.5 text-faint transition hover:bg-subtle hover:text-fg" aria-label="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className="scroll-thin -mx-1 flex-1 space-y-5 overflow-y-auto px-1 pb-4" aria-label="Main">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-1">
            {g.section ? (
              collapsed ? (
                <div className="mx-auto my-2 h-px w-6 bg-border" />
              ) : (
                <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.section}</p>
              )
            ) : null}
            {g.items.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} badge={item.badge === "due" ? due : 0} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border py-3">
        {!mobile && collapsed ? (
          <Tip content="Expand sidebar" side="right">
            <button onClick={onToggle} className="flex h-9 w-full items-center justify-center rounded-lg text-faint transition hover:bg-subtle hover:text-fg" aria-label="Expand sidebar">
              <PanelLeftOpen className="size-[18px]" />
            </button>
          </Tip>
        ) : null}
        <NavItem item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
        {user && !collapsed ? (
          <NavLink to="/app/settings" onClick={onNavigate} className="mt-2 flex items-center gap-3 rounded-xl p-2 transition hover:bg-subtle">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.role === "TEACHER" ? "Teacher" : `Level ${user.level?.level ?? 1} · ${user.xp} XP`}</p>
            </div>
          </NavLink>
        ) : null}
      </div>
    </aside>
  );
}

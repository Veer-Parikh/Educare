import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BookOpen, CalendarClock, CheckCheck, ClipboardList, GraduationCap, ListChecks, Megaphone, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fromNow } from "@/lib/utils";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";

const ICONS = {
  "assignment.new": ClipboardList,
  grade: GraduationCap,
  announcement: Megaphone,
  material: BookOpen,
  session: CalendarClock,
  quiz: ListChecks,
  "class.joined": UserPlus,
};

// Server bodies embed ISO timestamps ("due 2026-10-05T11:30:00.000Z"); show them in local time.
const localizeDates = (text) => text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));

export function NotificationsMenu() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications?limit=30"),
    refetchInterval: 60_000,
  });
  const unread = data?.unread ?? 0;

  const readAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const open = async (n) => {
    if (!n.read) api.post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
    if (n.link) navigate(n.link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-fg" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="size-[18px]" />
          {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-bg" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread ? (
            <Button variant="ghost" size="xs" onClick={() => readAll.mutate()}>
              <CheckCheck /> Mark all read
            </Button>
          ) : null}
        </div>
        <ul className="scroll-thin max-h-[60vh] overflow-y-auto">
          {(data?.notifications ?? []).length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted">You're all caught up.</li>
          ) : (
            data.notifications.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <PopoverClose asChild>
                    <button onClick={() => open(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-subtle", !n.read && "bg-brand-50/60 dark:bg-brand-500/5")}>
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-medium">{n.title}</span>
                        {n.body ? <span className="mt-0.5 line-clamp-1 block text-xs text-muted">{localizeDates(n.body)}</span> : null}
                        <span className="mt-1 block text-[11px] text-faint">{fromNow(n.createdAt)}</span>
                      </span>
                      {!n.read ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-500" /> : null}
                    </button>
                  </PopoverClose>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

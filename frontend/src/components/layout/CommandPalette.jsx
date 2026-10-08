import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { Dialog as D } from "radix-ui";
import { LogOut, Moon, Plus, School, Search, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { EXTRA_ITEMS, NAV, SETTINGS_ITEM } from "@/lib/nav";
import { ClassDot } from "@/components/ClassChip";
import { Kbd } from "@/components/ui/misc";

function Item({ icon: Icon, children, onSelect, keywords, hint }) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords ? keywords.split(" ") : undefined}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-fg outline-none data-[selected=true]:bg-subtle"
    >
      {Icon ? <Icon className="size-4 text-muted" /> : null}
      <span className="flex-1 truncate">{children}</span>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { user, logout, isTeacher } = useAuth();
  const { toggle, resolved } = useTheme();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api.get("/classes"), enabled: open && Boolean(user) });

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const pages = useMemo(() => [...(NAV[user?.role] ?? []).flatMap((g) => g.items), ...EXTRA_ITEMS.filter(() => !isTeacher), SETTINGS_ITEM], [user?.role, isTeacher]);

  const go = (to) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="anim-fade fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content className="anim-pop fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lift">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search pages, classes and actions</D.Description>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-faint" />
              <Command.Input autoFocus placeholder="Search pages, classes, actions…" className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="scroll-thin max-h-[55vh] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted">No results.</Command.Empty>

              <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
                {isTeacher ? (
                  <>
                    <Item icon={Plus} onSelect={() => go("/app/classes?new=1")} keywords="create new class">New class</Item>
                    <Item icon={Plus} onSelect={() => go("/app/tools/paper")} keywords="exam generate">Generate a question paper</Item>
                    <Item icon={Plus} onSelect={() => go("/app/tools/lesson")} keywords="plan">Plan a lesson</Item>
                  </>
                ) : (
                  <>
                    <Item icon={Plus} onSelect={() => go("/app/classes?join=1")} keywords="join code">Join a class</Item>
                    <Item icon={Plus} onSelect={() => go("/app/tutor?new=1")} keywords="ask question doubt">Ask the AI tutor</Item>
                    <Item icon={Plus} onSelect={() => go("/app/review")} keywords="flashcards review">Review due flashcards</Item>
                  </>
                )}
                <Item icon={resolved === "dark" ? Sun : Moon} onSelect={() => { toggle(); onOpenChange(false); }} keywords="theme dark light mode">
                  Switch to {resolved === "dark" ? "light" : "dark"} mode
                </Item>
              </Command.Group>

              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
                {pages.map((p) => (
                  <Item key={p.to} icon={p.icon} onSelect={() => go(p.to)} keywords={p.keywords}>
                    {p.label}
                  </Item>
                ))}
              </Command.Group>

              {classes.data?.classes?.length ? (
                <Command.Group heading="Classes" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
                  {classes.data.classes.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`class ${c.name} ${c.subject ?? ""}`}
                      onSelect={() => go(`/app/classes/${c.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-subtle"
                    >
                      <School className="size-4 text-muted" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <ClassDot theme={c.theme} />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group heading="Account" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
                <Item icon={LogOut} onSelect={() => { onOpenChange(false); logout(); }} keywords="sign out logout">Sign out</Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

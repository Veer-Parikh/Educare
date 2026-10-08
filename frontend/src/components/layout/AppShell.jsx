import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { PageSpinner } from "@/components/ui/spinner";

const COLLAPSE_KEY = "educare.sidebar.collapsed";

export function AppShell() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Scroll to top on navigation (but not on tab/hash changes within a page).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Full-bleed pages (tutor chat, space game) manage their own padding.
  const fullBleed = /^\/app\/(tutor|play)/.test(location.pathname);

  return (
    <div className="flex min-h-dvh">
      <div className={cn("sticky top-0 hidden h-dvh shrink-0 border-r border-border lg:block", collapsed ? "w-[68px]" : "w-64")}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="anim-fade fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 border-r border-border bg-bg shadow-lift lg:hidden" aria-describedby={undefined}>
            <D.Title className="sr-only">Navigation</D.Title>
            <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setMobileOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
        <main className={cn("flex-1", fullBleed ? "" : "mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8")}>
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

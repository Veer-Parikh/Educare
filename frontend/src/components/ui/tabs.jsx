import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = ({ className, ...props }) => <T.Content className={cn("outline-none", className)} {...props} />;

/** Pill-style tab list. */
export function TabsList({ className, children }) {
  return <T.List className={cn("inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1", className)}>{children}</T.List>;
}

export function TabsTrigger({ className, children, ...props }) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-all hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-soft [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </T.Trigger>
  );
}

import { DropdownMenu as M, Popover as P, Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

// ---- Dropdown menu -------------------------------------------------------------

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", sideOffset = 6, children, ...props }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("anim-pop z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lift", className)}
        {...props}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ className, icon: Icon, danger, children, ...props }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-subtle data-[disabled]:opacity-50",
        danger && "text-rose-600 data-[highlighted]:bg-rose-50 dark:text-rose-400 dark:data-[highlighted]:bg-rose-500/10",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-4 opacity-70" /> : null}
      {children}
    </M.Item>
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
export const MenuLabel = ({ children }) => <M.Label className="px-2.5 py-1.5 text-xs font-medium text-faint">{children}</M.Label>;

// ---- Popover ------------------------------------------------------------------

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, align = "end", sideOffset = 8, children, ...props }) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset} className={cn("anim-pop z-50 rounded-2xl border border-border bg-surface shadow-lift outline-none", className)} {...props}>
        {children}
      </P.Content>
    </P.Portal>
  );
}

// ---- Tooltip ------------------------------------------------------------------

export const TooltipProvider = T.Provider;

export function Tip({ content, side = "top", children }) {
  if (!content) return children;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] max-w-xs rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-on-ink shadow-lift">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

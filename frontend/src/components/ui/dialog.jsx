import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

/**
 * Centered modal (bottom sheet on small screens).
 * `footer` renders in a sticky action bar; body scrolls.
 */
export function DialogContent({ title, description, children, footer, size = "md", className, hideClose }) {
  return (
    <D.Portal>
      <D.Overlay className="anim-fade fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "anim-pop fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-lift outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          widths[size],
          className,
        )}
        onOpenAutoFocus={(e) => {
          // Focus the first field rather than the close button.
          const el = e.currentTarget?.querySelector?.("input, textarea, select");
          if (el) {
            e.preventDefault();
            el.focus();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div className="min-w-0">
            <D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          {!hideClose ? (
            <D.Close className="-mr-2 rounded-lg p-2 text-muted transition hover:bg-subtle hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          ) : null}
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5">{footer}</div> : null}
      </D.Content>
    </D.Portal>
  );
}

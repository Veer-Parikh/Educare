import { forwardRef } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const variants = {
  primary: "bg-brand-500 text-[#16140f] hover:bg-brand-400 active:bg-brand-600 shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)]",
  ink: "bg-ink text-on-ink hover:opacity-90",
  secondary: "border border-border bg-surface text-fg hover:bg-subtle hover:border-border-strong",
  ghost: "text-fg hover:bg-subtle",
  soft: "bg-subtle text-fg hover:bg-border/70",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
  "danger-ghost": "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10",
  link: "text-fg underline decoration-brand-500 decoration-2 underline-offset-4 hover:decoration-brand-600 px-0 h-auto",
};

const sizes = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icon: "size-9 rounded-lg",
  "icon-sm": "size-8 rounded-lg",
  "icon-xs": "size-7 rounded-md",
};

export const Button = forwardRef(function Button(
  { className, variant = "primary", size = "md", asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border,opacity,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner className="size-4" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});

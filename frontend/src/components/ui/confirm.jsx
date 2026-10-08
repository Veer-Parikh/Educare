import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";

const ConfirmContext = createContext(null);

/**
 * Promise-based confirmation dialog:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete class?", danger: true })) ...
 */
export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((o) => {
    setOpts({ confirmLabel: "Confirm", cancelLabel: "Cancel", ...o });
    return new Promise((resolve) => (resolver.current = resolve));
  }, []);

  const close = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <A.Root open={Boolean(opts)} onOpenChange={(open) => !open && close(false)}>
        <A.Portal>
          <A.Overlay className="anim-fade fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]" />
          <A.Content className="anim-pop fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-lift">
            <A.Title className="text-lg font-semibold tracking-tight">{opts?.title}</A.Title>
            <A.Description className="mt-2 text-sm text-muted">{opts?.description ?? "This can't be undone."}</A.Description>
            <div className="mt-6 flex justify-end gap-2">
              <A.Cancel asChild>
                <Button variant="secondary">{opts?.cancelLabel}</Button>
              </A.Cancel>
              <A.Action asChild>
                <Button variant={opts?.danger ? "danger" : "primary"} onClick={() => close(true)}>
                  {opts?.confirmLabel}
                </Button>
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

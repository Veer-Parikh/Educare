import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";
import { queryClient } from "@/lib/query";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import { FocusProvider } from "@/lib/focus";
import { TooltipProvider } from "@/components/ui/menu";
import { ConfirmProvider } from "@/components/ui/confirm";
import App from "./App";

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{ classNames: { toast: "!rounded-xl !border-border !bg-surface !text-fg !shadow-lift", description: "!text-muted" } }}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <FocusProvider>
            <TooltipProvider>
              <ConfirmProvider>
                <App />
                <ThemedToaster />
              </ConfirmProvider>
            </TooltipProvider>
          </FocusProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

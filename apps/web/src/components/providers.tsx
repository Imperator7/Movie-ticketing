"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { DemoControlsLoader } from "@/components/demo-controls-loader";
import { Devtools } from "@/components/devtools";
import { MockProvider } from "@/components/mock-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/query-client";

/** App-wide client providers: theme, API mocking (dev only), React Query, tooltips and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider>
      <MockProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
          <Devtools />
          <DemoControlsLoader />
        </QueryClientProvider>
      </MockProvider>
    </ThemeProvider>
  );
}

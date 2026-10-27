"use client";

import { useEffect, useState, type ReactNode } from "react";

// Constant-folded at build time: in production this is `false`, so the `@/mocks/browser` import
// below (and msw itself) never reaches the bundle.
const MOCKING_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

/** Starts the MSW service worker before the app renders (development only, when mocking is enabled). */
export function MockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKING_ENABLED);

  useEffect(() => {
    if (!MOCKING_ENABLED) return;
    let cancelled = false;
    void import("@/mocks/browser")
      .then(({ startMocking }) => startMocking())
      .catch((error: unknown) => {
        // Never block the app on the mock worker (e.g. a browser without service workers).
        console.error("[MSW] could not start, using the real API", error);
      })
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}

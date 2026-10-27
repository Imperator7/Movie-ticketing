"use client";

import { lazy, Suspense } from "react";

// `process.env.NODE_ENV` is inlined at build time, so the devtools chunk is dropped from production builds.
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
      )
    : null;

export function Devtools() {
  if (!ReactQueryDevtools) return null;
  return (
    <Suspense fallback={null}>
      <ReactQueryDevtools initialIsOpen={false} />
    </Suspense>
  );
}

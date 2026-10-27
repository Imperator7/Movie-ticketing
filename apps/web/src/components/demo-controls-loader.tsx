"use client";

import { lazy, Suspense } from "react";

// Build-time constant: `false` in production, so the demo panel (and the mock server it imports)
// is dropped from the bundle. The expression is repeated in mock-provider.tsx on purpose.
const DemoControls =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_MOCKING === "enabled"
    ? lazy(() => import("@/mocks/demo-controls"))
    : null;

export function DemoControlsLoader() {
  if (!DemoControls) return null;
  return (
    <Suspense fallback={null}>
      <DemoControls />
    </Suspense>
  );
}

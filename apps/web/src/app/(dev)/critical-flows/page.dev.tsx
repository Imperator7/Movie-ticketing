import type { Metadata } from "next";
import { CriticalFlowsView } from "@/features/dev-api-flow/critical-flows-view";
import { loadCriticalFlows } from "@/features/dev-api-flow/load-critical-flows";

export const metadata: Metadata = {
  title: "Critical flows · Movie Ticketing",
  description:
    "Code review of seat booking, payments, cancel, expiry and refresh against the design",
};

// Dev-only page (only exists with INCLUDE_DEV_PAGES=1, never in the production export).
export default function CriticalFlowsPage() {
  // Read inside the component: on every request in `next dev`, so it follows each change.
  return <CriticalFlowsView data={loadCriticalFlows()} />;
}

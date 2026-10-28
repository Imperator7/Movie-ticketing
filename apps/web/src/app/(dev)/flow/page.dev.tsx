import type { Metadata } from "next";
import { FlowView } from "@/features/dev-flow/flow-view";
import { loadFlow } from "@/features/dev-flow/load-flow";

export const metadata: Metadata = {
  title: "Flow · Movie Ticketing",
  description: "Customer journey, the API request pipeline and the build status of every operation",
};

// Dev-only page (only exists with INCLUDE_DEV_PAGES=1, never in the production export).
export default function FlowPage() {
  // Read inside the component: on every request in `next dev`, so it follows each merge.
  return <FlowView data={loadFlow()} />;
}

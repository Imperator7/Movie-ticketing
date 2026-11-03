import type { Metadata } from "next";
import { ApiFlowView } from "@/features/dev-api-flow/api-flow-view";
import { loadApiFlow } from "@/features/dev-api-flow/load-api-flow";

export const metadata: Metadata = {
  title: "API flow · Movie Ticketing",
  description: "The main flows step by step and every endpoint traced to the code that runs it",
};

// Dev-only page (only exists with INCLUDE_DEV_PAGES=1, never in the production export).
export default function ApiFlowPage() {
  // Read inside the component: on every request in `next dev`, so it follows each change.
  return <ApiFlowView data={loadApiFlow()} />;
}

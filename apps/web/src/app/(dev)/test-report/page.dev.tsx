import type { Metadata } from "next";
import { loadReport } from "@/features/test-report/load-report";
import { TestReportView } from "@/features/test-report/report-view";

export const metadata: Metadata = {
  title: "Test report · Movie Ticketing",
  description: "Latest run of every test suite and the OpenAPI conformance checks",
};

// Dev-only page (only exists with INCLUDE_DEV_PAGES=1, never in the production export).
export default function TestReportPage() {
  // Read inside the component: on every request in `next dev`.
  return <TestReportView state={loadReport()} />;
}

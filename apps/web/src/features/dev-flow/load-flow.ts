import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { loadReport } from "@/features/test-report/load-report";
import {
  conformanceByOperation,
  operationsFromSpec,
  parseImplemented,
  type CheckStatus,
  type Operation,
} from "./flow";

export interface FlowData {
  operations: Operation[];
  live: Set<string>;
  conformance: Map<string, CheckStatus>;
  /** When the test report was generated, or null without one. */
  reportAt: string | null;
}

/** Repo root (the dev server runs with cwd apps/web). */
const repoRoot = (cwd: string = process.cwd()) => path.join(cwd, "..", "..");

/** Reads the contract, the API's implemented-operations allowlist and the latest test report. Server-only (fs). */
export function loadFlow(root: string = repoRoot()): FlowData {
  const spec: unknown = parse(readFileSync(path.join(root, "docs", "openapi.yaml"), "utf-8"));
  const allowlist = readFileSync(
    path.join(root, "apps", "api", "src", "contract", "implemented-operations.ts"),
    "utf-8",
  );
  const report = loadReport(path.join(root, "reports", "test-report.json"));
  return {
    operations: operationsFromSpec(spec),
    live: parseImplemented(allowlist),
    conformance: conformanceByOperation(report.kind === "ready" ? report.report.conformance : null),
    reportAt: report.kind === "ready" ? report.report.generatedAt : null,
  };
}

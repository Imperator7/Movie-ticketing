import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseReport, type TestReport } from "./report";

export const REPORT_COMMAND = "npm run test:report";
export const QUICK_COMMAND = "npm run test:report -- --quick";

export type ReportState =
  | { kind: "missing"; path: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: TestReport; now: number };

/** Repo-root reports/test-report.json (the dev server runs with cwd apps/web). */
export function reportPath(cwd: string = process.cwd()): string {
  return path.join(cwd, "..", "..", "reports", "test-report.json");
}

/** Reads the report at request time. Server-only (fs). */
export function loadReport(file: string = reportPath(), now: number = Date.now()): ReportState {
  if (!existsSync(file)) return { kind: "missing", path: file };
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return { kind: "error", message: "The report file could not be read." };
  }
  const parsed = parseReport(text);
  return parsed.ok
    ? { kind: "ready", report: parsed.report, now }
    : { kind: "error", message: parsed.message };
}

import { z } from "zod";

/**
 * The test report written by `scripts/test-report.mjs` (reports/test-report.json). The JSDoc typedefs at
 * the top of that script are the contract; the schema below mirrors them. Pure functions only, so the
 * dev page `/test-report` and its tests share one place for parsing and summarizing.
 */

export const REPORT_SCHEMA_VERSION = 1;

const status = z.enum(["passed", "failed", "skipped"]);
export type Status = z.infer<typeof status>;

const testCase = z.object({
  name: z.string(),
  ancestors: z.array(z.string()),
  status,
  durationMs: z.number().nullable(),
  failure: z.string().nullable(),
});

const testFile = z.object({ file: z.string(), status, tests: z.array(testCase) });

const totals = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

const suite = z.object({
  id: z.string(),
  label: z.string(),
  command: z.string(),
  status,
  durationMs: z.number(),
  totals,
  files: z.array(testFile),
  error: z.string().nullable(),
});

const conformanceCheck = z.object({
  name: z.string(),
  request: z.string(),
  expectedStatus: z.number(),
  actualStatus: z.number(),
  status,
  errors: z.array(z.string()),
});

const conformanceOperation = z.object({
  operationId: z.string(),
  method: z.string(),
  path: z.string(),
  tag: z.string(),
  implemented: z.boolean(),
  status,
  checks: z.array(conformanceCheck),
});

const conformance = z.object({
  specVersion: z.string(),
  operations: z.array(conformanceOperation),
});

const report = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  generatedAt: z.string(),
  git: z.object({ commit: z.string(), branch: z.string(), dirty: z.boolean() }),
  quick: z.boolean(),
  status,
  suites: z.array(suite),
  conformance: conformance.nullable(),
});

export type TestCase = z.infer<typeof testCase>;
export type TestFile = z.infer<typeof testFile>;
export type Suite = z.infer<typeof suite>;
export type ConformanceCheck = z.infer<typeof conformanceCheck>;
export type ConformanceOperation = z.infer<typeof conformanceOperation>;
export type Conformance = z.infer<typeof conformance>;
export type TestReport = z.infer<typeof report>;

export type ParseResult =
  | { ok: true; report: TestReport }
  | { ok: false; kind: "invalid-json" | "version" | "shape"; message: string };

/** Parses the file's text. Never throws: an old or malformed report becomes a clear message. */
export function parseReport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, kind: "invalid-json", message: "The report file is not valid JSON." };
  }
  const version =
    typeof raw === "object" && raw !== null && "schemaVersion" in raw
      ? raw.schemaVersion
      : undefined;
  if (version !== REPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      kind: "version",
      message: `The report has schemaVersion ${JSON.stringify(version)}, this page understands ${String(REPORT_SCHEMA_VERSION)}. Run \`npm run test:report\` again.`,
    };
  }
  const parsed = report.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join(".") || "(root)" : "(unknown)";
    return {
      ok: false,
      kind: "shape",
      message: `The report does not match the expected shape (at ${where}). Run \`npm run test:report\` again.`,
    };
  }
  return { ok: true, report: parsed.data };
}

// ---------------------------------------------------------------- summaries

export interface Totals {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/** Sum of every suite's totals. */
export function overallTotals(r: TestReport): Totals {
  return r.suites.reduce<Totals>(
    (acc, s) => ({
      total: acc.total + s.totals.total,
      passed: acc.passed + s.totals.passed,
      failed: acc.failed + s.totals.failed,
      skipped: acc.skipped + s.totals.skipped,
    }),
    { total: 0, passed: 0, failed: 0, skipped: 0 },
  );
}

export function failedTests(file: TestFile): TestCase[] {
  return file.tests.filter((t) => t.status === "failed");
}

/** A suite with only its failing files and tests (for "show only failures"). */
export function onlyFailures(s: Suite): Suite {
  return {
    ...s,
    files: s.files.map((f) => ({ ...f, tests: failedTests(f) })).filter((f) => f.tests.length > 0),
  };
}

export const testTitle = (t: TestCase): string => [...t.ancestors, t.name].join(" › ");

export interface TagGroup {
  tag: string;
  operations: ConformanceOperation[];
  implemented: number;
  failed: number;
}

/** Operations grouped by tag, in the order tags first appear in the spec. */
export function groupByTag(c: Conformance): TagGroup[] {
  const groups = new Map<string, TagGroup>();
  for (const op of c.operations) {
    let group = groups.get(op.tag);
    if (!group) {
      group = { tag: op.tag, operations: [], implemented: 0, failed: 0 };
      groups.set(op.tag, group);
    }
    group.operations.push(op);
    if (op.implemented) group.implemented += 1;
    if (op.status === "failed") group.failed += 1;
  }
  return [...groups.values()];
}

export interface Coverage {
  implemented: number;
  operations: number;
  checks: number;
  passedChecks: number;
  failedChecks: number;
}

export function coverage(c: Conformance): Coverage {
  const checks = c.operations.flatMap((op) => op.checks);
  return {
    implemented: c.operations.filter((op) => op.implemented).length,
    operations: c.operations.length,
    checks: checks.length,
    passedChecks: checks.filter((k) => k.status === "passed").length,
    failedChecks: checks.filter((k) => k.status === "failed").length,
  };
}

/** "12 of 23 operations implemented · 40 checks · all passing" */
export function coverageLine(c: Conformance): string {
  const v = coverage(c);
  const state = v.failedChecks === 0 ? "all passing" : `${String(v.failedChecks)} failing`;
  return `${String(v.implemented)} of ${String(v.operations)} operations implemented · ${String(v.checks)} ${v.checks === 1 ? "check" : "checks"} · ${state}`;
}

// ---------------------------------------------------------------- formatting

/** "just now", "3 minutes ago", "2 hours ago", "5 days ago". */
export function relativeTime(iso: string, now: number): string {
  const diff = now - Date.parse(iso);
  if (Number.isNaN(diff)) return "unknown time";
  const seconds = Math.round(diff / 1000);
  if (seconds < 45) return "just now";
  const plural = (n: number, unit: string) => `${String(n)} ${unit}${n === 1 ? "" : "s"} ago`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.round(hours / 24), "day");
}

/** "28 Oct 2026, 16:02:49" in Bangkok time. */
export function bangkokTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 1000) return `${String(Math.round(ms))} ms`;
  const seconds = ms / 1000;
  return seconds < 60
    ? `${seconds.toFixed(1)} s`
    : `${String(Math.floor(seconds / 60))} m ${String(Math.round(seconds % 60))} s`;
}

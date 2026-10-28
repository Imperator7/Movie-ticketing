import { CircleCheck, CircleX, MinusCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "cn";
import { CopyCommand, FailuresOnly } from "./client-parts";
import { QUICK_COMMAND, REPORT_COMMAND, type ReportState } from "./load-report";
import {
  bangkokTimestamp,
  coverage,
  coverageLine,
  failedTests,
  formatDurationMs,
  groupByTag,
  overallTotals,
  relativeTime,
  testTitle,
  type ConformanceOperation,
  type Status,
  type Suite,
  type TestReport,
} from "./report";

/** Rows that pass or are skipped are hidden when "Show only failures" is on. */
const HIDE_WHEN_ONLY_FAILURES = "group-data-[only-failures=true]/report:hidden";

const STATUS_STYLE: Record<Status, string> = {
  passed: "border-success/40 bg-success/15 text-success",
  failed: "border-destructive/50 bg-destructive/15 text-destructive",
  skipped: "border-border bg-muted text-muted-foreground",
};

const STATUS_ICON = { passed: CircleCheck, failed: CircleX, skipped: MinusCircle } as const;

export function StatusBadge({ status, large = false }: { status: Status; large?: boolean }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium capitalize",
        large ? "px-4 py-1.5 text-lg" : "px-2 py-0.5 text-xs",
        STATUS_STYLE[status],
      )}
    >
      <Icon aria-hidden className={large ? "size-5" : "size-3.5"} />
      {status}
    </span>
  );
}

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-info/15 text-info",
  POST: "bg-success/15 text-success",
  PUT: "bg-warning/15 text-warning",
  PATCH: "bg-warning/15 text-warning",
  DELETE: "bg-destructive/15 text-destructive",
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-block w-16 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-xs font-semibold",
        METHOD_STYLE[method] ?? "bg-muted text-muted-foreground",
      )}
    >
      {method}
    </span>
  );
}

function Counts({ totals }: { totals: Suite["totals"] }) {
  return (
    <p className="flex flex-wrap gap-x-3 font-mono text-sm tabular">
      <span className="text-success">{totals.passed} passed</span>
      <span
        className={totals.failed > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}
      >
        {totals.failed} failed
      </span>
      <span className="text-muted-foreground">{totals.skipped} skipped</span>
      <span className="text-muted-foreground">{totals.total} total</span>
    </p>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- header + cards

function Header({ report, now }: { report: TestReport; now: number }) {
  const totals = overallTotals(report);
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold">Test report</h1>
        <StatusBadge status={report.status} large />
      </div>
      <p className="text-sm text-muted-foreground">
        Generated {relativeTime(report.generatedAt, now)} ·{" "}
        <time dateTime={report.generatedAt}>{bangkokTimestamp(report.generatedAt)} (Bangkok)</time>
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm">
        <span>{report.git.branch}</span>
        <span>@ {report.git.commit}</span>
        {report.git.dirty ? (
          <span className="rounded bg-warning/15 px-1.5 text-warning">uncommitted changes</span>
        ) : (
          <span className="text-muted-foreground">clean</span>
        )}
        <span className="font-sans text-muted-foreground">
          {totals.passed} / {totals.total} tests passed
          {totals.failed > 0 ? `, ${String(totals.failed)} failed` : ""}
        </span>
      </p>
      {report.quick ? (
        <Alert variant="info">
          <TriangleAlert aria-hidden />
          <AlertTitle>Quick report</AlertTitle>
          <AlertDescription>
            Integration tests and DB checks were skipped. Run the full report for those:
            <code className="ml-1 font-mono">{REPORT_COMMAND}</code>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="max-w-xl">
        <p className="mb-1 text-xs text-muted-foreground">Refresh this report</p>
        <CopyCommand command={REPORT_COMMAND} />
      </div>
    </header>
  );
}

function SuiteCards({ suites }: { suites: Suite[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {suites.map((suite) => (
        <li
          key={suite.id}
          data-status={suite.status}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm leading-snug font-semibold">{suite.label}</h3>
            <StatusBadge status={suite.status} />
          </div>
          <Counts totals={suite.totals} />
          <p className="text-xs text-muted-foreground">{formatDurationMs(suite.durationMs)}</p>
          <code className="truncate font-mono text-xs text-muted-foreground">{suite.command}</code>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- conformance

function OperationRow({ op }: { op: ConformanceOperation }) {
  const failed = op.status === "failed";
  return (
    <details
      open={failed}
      data-status={op.status}
      className={cn(
        "group/op border-t border-border first:border-t-0",
        failed ? "" : HIDE_WHEN_ONLY_FAILURES,
      )}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm marker:content-none hover:bg-muted/50">
        <MethodBadge method={op.method} />
        <code className="font-mono">{op.path}</code>
        <span className="text-muted-foreground">{op.operationId}</span>
        <span className="ml-auto flex items-center gap-2">
          {op.implemented ? (
            <span className="text-xs text-muted-foreground">implemented</span>
          ) : (
            <span className="text-xs text-muted-foreground">not yet</span>
          )}
          <StatusBadge status={op.status} />
        </span>
      </summary>
      {op.checks.length > 0 ? (
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Check</th>
                <th className="py-1 pr-3 font-medium">Request</th>
                <th className="py-1 pr-3 font-medium">Expected</th>
                <th className="py-1 pr-3 font-medium">Actual</th>
                <th className="py-1 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {op.checks.map((check) => (
                <tr
                  key={`${check.name}-${check.request}`}
                  className="border-t border-border align-top"
                >
                  <td className="py-1.5 pr-3">{check.name}</td>
                  <td className="py-1.5 pr-3 font-mono break-all">{check.request}</td>
                  <td className="py-1.5 pr-3 font-mono">{check.expectedStatus}</td>
                  <td className="py-1.5 pr-3 font-mono">{check.actualStatus}</td>
                  <td className="py-1.5">
                    <StatusBadge status={check.status} />
                    {check.errors.length > 0 ? (
                      <ul className="mt-1 list-disc pl-4 text-destructive">
                        {check.errors.map((error) => (
                          <li key={error} className="font-mono break-words">
                            {error}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}

function Conformance({ report }: { report: TestReport }) {
  if (!report.conformance) {
    return (
      <Section title="OpenAPI conformance">
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No conformance data in this report.</p>
          <p>
            Conformance runs inside the API integration tests, which did not run
            {report.quick ? " (quick mode)" : ""}. Generate a full report with{" "}
            <code className="font-mono">{REPORT_COMMAND}</code> (needs Docker).
          </p>
        </div>
      </Section>
    );
  }
  const c = report.conformance;
  const v = coverage(c);
  return (
    <Section
      title="OpenAPI conformance"
      note={
        <>
          Spec version {c.specVersion} ·{" "}
          <span className={v.failedChecks > 0 ? "font-medium text-destructive" : undefined}>
            {coverageLine(c)}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {groupByTag(c).map((group) => (
          <div key={group.tag} className="overflow-hidden rounded-xl border border-border bg-card">
            <h3 className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2 text-sm font-semibold">
              {group.tag}
              <span className="text-xs font-normal text-muted-foreground">
                {group.implemented} of {group.operations.length} implemented
                {group.failed > 0 ? ` · ${String(group.failed)} failing` : ""}
              </span>
            </h3>
            {group.operations.map((op) => (
              <OperationRow key={op.operationId} op={op} />
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- suites detail

function SuiteDetail({ suite }: { suite: Suite }) {
  const failed = suite.status === "failed";
  return (
    <details
      open={failed}
      data-status={suite.status}
      className={cn(
        "rounded-xl border border-border bg-card",
        failed ? "" : HIDE_WHEN_ONLY_FAILURES,
      )}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 marker:content-none hover:bg-muted/50">
        <span className="font-semibold">{suite.label}</span>
        <StatusBadge status={suite.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          {suite.totals.total} tests · {formatDurationMs(suite.durationMs)}
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {suite.error ? (
          <pre className="overflow-x-auto rounded-lg bg-destructive/10 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
            {suite.error}
          </pre>
        ) : null}
        {suite.files.length === 0 && !suite.error ? (
          <p className="text-sm text-muted-foreground">
            {suite.status === "skipped" ? "Not run in this report." : "No test files reported."}
          </p>
        ) : null}
        {suite.files.map((file) => {
          const failures = failedTests(file);
          return (
            <details
              key={file.file}
              open={failures.length > 0}
              data-status={file.status}
              className={cn(
                "rounded-lg border border-border",
                failures.length > 0 ? "" : HIDE_WHEN_ONLY_FAILURES,
              )}
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-1.5 text-sm marker:content-none hover:bg-muted/50">
                <code className="min-w-0 flex-1 font-mono text-xs break-all">{file.file}</code>
                <span className="text-xs text-muted-foreground">{file.tests.length} tests</span>
                <StatusBadge status={file.status} />
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {file.tests.map((test, index) => (
                  <li
                    key={`${testTitle(test)}-${String(index)}`}
                    data-status={test.status}
                    className={cn(
                      "px-3 py-1.5 text-sm",
                      test.status === "failed" ? "" : HIDE_WHEN_ONLY_FAILURES,
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 break-words">{testTitle(test)}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatDurationMs(test.durationMs)}
                      </span>
                      <StatusBadge status={test.status} />
                    </div>
                    {test.failure ? (
                      <pre className="mt-1.5 overflow-x-auto rounded-lg bg-destructive/10 p-2 font-mono text-xs whitespace-pre-wrap text-destructive">
                        {test.failure}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- states

export function ReportEmpty({ path }: { path: string }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border p-8">
      <h2 className="text-xl font-semibold">No report yet</h2>
      <p className="max-w-prose text-muted-foreground">
        There is no report at <code className="font-mono text-xs break-all">{path}</code>. Generate
        one from the repo root:
      </p>
      <div className="w-full max-w-xl">
        <CopyCommand command={REPORT_COMMAND} />
        <p className="mt-3 mb-1 text-xs text-muted-foreground">
          Faster, unit suites only (no Docker, no database):
        </p>
        <CopyCommand command={QUICK_COMMAND} />
      </div>
    </div>
  );
}

export function ReportError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" role="alert">
      <CircleX aria-hidden />
      <AlertTitle>The report could not be shown</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <div className="mt-3 max-w-xl">
          <CopyCommand command={REPORT_COMMAND} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function TestReportView({ state }: { state: ReportState }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      {state.kind === "missing" ? (
        <>
          <h1 className="text-3xl font-bold">Test report</h1>
          <ReportEmpty path={state.path} />
        </>
      ) : state.kind === "error" ? (
        <>
          <h1 className="text-3xl font-bold">Test report</h1>
          <ReportError message={state.message} />
        </>
      ) : (
        <>
          <Header report={state.report} now={state.now} />
          <SuiteCards suites={state.report.suites} />
          <FailuresOnly>
            <Conformance report={state.report} />
            <Section title="Suites" note="Failed suites, files and tests are expanded.">
              <div className="flex flex-col gap-3">
                {state.report.suites.map((suite) => (
                  <SuiteDetail key={suite.id} suite={suite} />
                ))}
              </div>
            </Section>
          </FailuresOnly>
        </>
      )}
    </main>
  );
}

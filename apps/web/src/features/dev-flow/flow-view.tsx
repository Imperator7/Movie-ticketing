import type { ReactNode } from "react";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { cn } from "@/lib/utils";
import {
  FLOW_CHART_CSS,
  GLOBAL_OPERATIONS,
  PIPELINE,
  SCREENS,
  pipelineChart,
  screenFlowChart,
  screenStatus,
  screensByOperation,
  stagesFor,
  type CheckStatus,
  type ScreenStatus,
} from "./flow";
import type { FlowData } from "./load-flow";

const SCREEN_STATUS: Record<ScreenStatus, { label: string; className: string }> = {
  live: { label: "Real API", className: "bg-success text-success-foreground" },
  partial: { label: "Partly real", className: "bg-warning text-warning-foreground" },
  mock: { label: "Mock only", className: "bg-muted text-muted-foreground" },
};

const CHECK: Record<CheckStatus, { label: string; className: string }> = {
  passed: { label: "✓ conforms", className: "text-success" },
  failed: { label: "✗ fails", className: "text-destructive" },
  skipped: { label: "– skipped", className: "text-muted-foreground" },
  "not-run": { label: "– no report", className: "text-muted-foreground" },
};

/** Stages that differ between operations (the rest run for every request). */
const VARYING_STAGES = new Set(["JwtAuthGuard", "OriginGuard", "@CacheControl interceptor"]);

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

function OperationChip({ id, live }: { id: string; live: boolean }) {
  return (
    <code
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-xs",
        live
          ? "bg-success/15 text-foreground"
          : "bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
      )}
      title={live ? "Implemented in the API" : "Mock only (not implemented yet)"}
    >
      {id}
    </code>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function FlowView({ data }: { data: FlowData }) {
  const { operations, live, conformance, reportAt } = data;
  const usedBy = screensByOperation();
  const liveCount = operations.filter((op) => live.has(op.operationId)).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header>
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Dev map</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          UI flow and API pipeline
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          <strong className="text-foreground">
            {liveCount} of {operations.length}
          </strong>{" "}
          contract operations run on the real API. Sources: <code>docs/openapi.yaml</code>,{" "}
          <code>apps/api/src/contract/implemented-operations.ts</code> and the test report
          {reportAt
            ? ` (${new Date(reportAt).toLocaleString("en-GB")})`
            : " (none yet: npm run test:report)"}
          . Refresh after a merge.
        </p>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-3 text-sm">
          <a href="#journey" className="underline-offset-4 hover:underline">
            Customer journey
          </a>
          <a href="#pipeline" className="underline-offset-4 hover:underline">
            Request pipeline
          </a>
          <a href="#operations" className="underline-offset-4 hover:underline">
            Every operation
          </a>
        </nav>
      </header>

      <Section
        id="journey"
        title="Customer journey"
        intro="Screens and how a customer moves between them. Green = every call on the real API, amber = some, grey = still on the mock (npm run dev:mock -w web shows them all). Struck-through calls aren't implemented yet."
      >
        <div data-flow-chart>
          <style>{FLOW_CHART_CSS}</style>
          <MermaidDiagram chart={screenFlowChart(live)} />
        </div>
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Screen</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">API calls</th>
                <th className="px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {SCREENS.map((screen) => {
                const status = SCREEN_STATUS[screenStatus(screen, live)];
                return (
                  <tr key={screen.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">
                      {screen.open ? (
                        <a
                          href={screen.open}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {screen.label} ↗
                        </a>
                      ) : (
                        screen.label
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {screen.route}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {screen.operations.map((id) => (
                          <OperationChip key={id} id={id} live={live.has(id)} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Pill className={status.className}>{status.label}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3 className="mt-6 text-sm font-semibold">Calls made outside one screen</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {GLOBAL_OPERATIONS.map((global) => (
            <li
              key={`${global.operationId}-${global.where}`}
              className="flex flex-wrap items-center gap-2"
            >
              <OperationChip id={global.operationId} live={live.has(global.operationId)} />
              <span className="text-muted-foreground">{global.where}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="pipeline"
        title="Request pipeline"
        intro="The path every API request takes, in order. Dashed = planned (AWS, Phase 8). Anything that throws ends in AllExceptionsFilter, which returns the contract's Error body."
      >
        <MermaidDiagram chart={pipelineChart()} />
        <ol className="mt-6 divide-y divide-border rounded-lg border border-border text-sm">
          {PIPELINE.map((stage, index) => (
            <li
              key={stage.name}
              className={cn(
                "grid gap-1 px-3 py-2 sm:grid-cols-[2rem_14rem_1fr_16rem]",
                stage.planned && "opacity-60",
              )}
            >
              <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
              <span className="font-medium">{stage.name}</span>
              <span>
                {stage.what}
                {stage.only ? (
                  <span className="text-muted-foreground"> · only {stage.only}</span>
                ) : null}
              </span>
              <code className="font-mono text-xs text-muted-foreground">{stage.source}</code>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="operations"
        title="Every operation"
        intro="Each contract operation: whether it's built, whether the runtime conformance test passed on the last report, which optional pipeline stages it goes through, and which screens call it."
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Operation</th>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Auth</th>
                <th className="px-3 py-2">Built</th>
                <th className="px-3 py-2">Conformance</th>
                <th className="px-3 py-2">Extra stages</th>
                <th className="px-3 py-2">Responses</th>
                <th className="px-3 py-2">Used by</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((op) => {
                const isLive = live.has(op.operationId);
                const check = CHECK[conformance.get(op.operationId) ?? "not-run"];
                return (
                  <tr key={op.operationId} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <code className="font-mono text-xs">{op.operationId}</code>
                      <div className="text-xs text-muted-foreground">{op.tag}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      <span className="font-semibold">{op.method}</span> {op.path}
                    </td>
                    <td className="px-3 py-2 text-xs">{op.auth}</td>
                    <td className="px-3 py-2">
                      <Pill
                        className={
                          isLive ? SCREEN_STATUS.live.className : SCREEN_STATUS.mock.className
                        }
                      >
                        {isLive ? "Live" : "Not yet"}
                      </Pill>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-xs whitespace-nowrap",
                        isLive ? check.className : "text-muted-foreground",
                      )}
                    >
                      {isLive ? check.label : "–"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {stagesFor(op)
                        .filter((name) => VARYING_STAGES.has(name))
                        .join(", ") || "–"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {op.statuses.join(" ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {(usedBy.get(op.operationId) ?? []).join(", ") || "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}

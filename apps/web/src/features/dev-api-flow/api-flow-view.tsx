import type { ReactNode } from "react";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { cn } from "@/lib/utils";
import type { TableUse } from "./code-scan";
import { ACTORS, journeyChart, JOURNEYS, type Actor } from "./journeys";
import type { ApiFlowData, CallNode, CodeRef, NodeKind, OperationCode } from "./load-api-flow";

const ACTOR_STYLE: Record<Actor, string> = {
  browser: "bg-primary/15 text-foreground",
  api: "bg-success/15 text-foreground",
  db: "bg-warning/20 text-foreground",
  stripe: "bg-accent text-accent-foreground",
  job: "bg-muted text-muted-foreground",
};

const KIND: Record<NodeKind, { label: string; className: string }> = {
  controller: { label: "controller", className: "bg-primary/15 text-foreground" },
  service: { label: "service", className: "bg-success/15 text-foreground" },
  helper: { label: "helper", className: "bg-muted text-muted-foreground" },
  port: { label: "port", className: "bg-warning/20 text-foreground" },
  adapter: { label: "adapter", className: "bg-accent text-accent-foreground" },
};

const TABLE_KIND: Record<TableUse["kind"], string> = {
  read: "read",
  write: "write",
  sql: "SQL",
};

export function Pill({ className, children }: { className: string; children: ReactNode }) {
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

/** Opens the file at the line in VS Code; the path text can be copied for any other editor. */
export function FileLink({ root, refTo }: { root: string; refTo: CodeRef }) {
  const location = `${refTo.file}:${String(refTo.line)}`;
  return (
    <a
      href={`vscode://file/${root}/${location}`}
      className="font-mono text-xs break-all text-primary underline-offset-4 hover:underline"
      title="Open in VS Code"
    >
      {location}
    </a>
  );
}

export function CodePreview({ refTo, open = false }: { refTo: CodeRef; open?: boolean }) {
  const lines = refTo.code.split("\n");
  return (
    <details className="group/code mt-1" open={open}>
      <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
        <span className="group-open/code:hidden">Show code</span>
        <span className="hidden group-open/code:inline">Hide code</span>
        <span> ({lines.length + refTo.truncated} lines)</span>
      </summary>
      <pre className="mt-2 max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/40 py-2 text-xs leading-5">
        <code>
          {lines.map((text, index) => (
            <span key={index} className="flex">
              <span className="w-12 shrink-0 pr-3 text-right text-muted-foreground select-none">
                {refTo.line + index}
              </span>
              <span className="pr-4 whitespace-pre">{text}</span>
            </span>
          ))}
          {refTo.truncated > 0 ? (
            <span className="block pl-12 text-muted-foreground">
              … {refTo.truncated} more lines, open the file to read them
            </span>
          ) : null}
        </code>
      </pre>
    </details>
  );
}

function Tables({ tables }: { tables: TableUse[] }) {
  if (tables.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tables.map((use) => (
        <code
          key={use.table}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[11px]",
            use.kind === "read"
              ? "bg-muted text-muted-foreground"
              : "bg-warning/20 text-foreground",
          )}
          title={`${TABLE_KIND[use.kind]} · ${use.table}`}
        >
          {use.table}
          <span className="ml-1 opacity-70">{TABLE_KIND[use.kind]}</span>
        </code>
      ))}
    </span>
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
      <div className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CallTree({ node, root }: { node: CallNode; root: string }) {
  const kind = KIND[node.kind];
  return (
    <li className="mt-2">
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill className={kind.className}>{kind.label}</Pill>
          <code className="font-mono text-sm font-semibold">{node.ref.name}</code>
          {node.via ? (
            <code className="font-mono text-xs text-muted-foreground">
              {node.via === "implements" ? "implements the port" : `via ${node.via}…)`}
            </code>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <FileLink root={root} refTo={node.ref} />
          <Tables tables={node.tables} />
        </div>
        <CodePreview refTo={node.ref} />
      </div>
      {node.children.length > 0 ? (
        <ul className="ml-3 border-l border-border pl-3 sm:ml-5 sm:pl-4">
          {node.children.map((child) => (
            <CallTree
              key={`${child.ref.file}:${String(child.ref.line)}`}
              node={child}
              root={root}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OperationRow({ op, root }: { op: OperationCode; root: string }) {
  const { operation } = op;
  return (
    <details
      id={`op-${operation.operationId}`}
      className="border-t border-border first:border-t-0 open:bg-muted/20"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 select-none hover:bg-muted/40">
        <span className="w-14 font-mono text-xs font-semibold">{operation.method}</span>
        <span className="font-mono text-xs break-all">{operation.path}</span>
        <code className="font-mono text-xs text-muted-foreground">{operation.operationId}</code>
        {op.live ? null : <Pill className="bg-muted text-muted-foreground">Not built</Pill>}
        <span className="ml-auto">
          <Tables tables={op.tables} />
        </span>
      </summary>
      <div className="grid gap-4 px-3 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <h4 className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Called from (web)
          </h4>
          {op.web.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No screen calls it through the generated client
              {operation.operationId === "refresh" ? " (api-client calls it directly)" : ""}.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {op.web.map((caller) => (
                <li
                  key={`${caller.ref.file}:${String(caller.ref.line)}`}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-sm font-semibold">{caller.ref.name}</code>
                    <code className="font-mono text-xs text-muted-foreground">
                      uses {caller.identifier}
                    </code>
                  </div>
                  <FileLink root={root} refTo={caller.ref} />
                  <CodePreview refTo={caller.ref} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Server code (in call order)
          </h4>
          {op.tree ? (
            <ul>
              <CallTree node={op.tree} root={root} />
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Not in the API yet: only the contract and the mock know it.
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

export function ApiFlowView({ data }: { data: ApiFlowData }) {
  const { root, operations, journeys, missing } = data;
  const tags = [...new Set(operations.map((op) => op.operation.tag))];
  const liveCount = operations.filter((op) => op.live).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header>
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Dev map</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          API flow and the code behind it
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          The main flows step by step, then every endpoint ({liveCount} of {operations.length}{" "}
          built) traced from the screen that calls it through the controller and services down to
          the tables. Read from the code on every page load, so it follows each change. File links
          open VS Code at the line; <strong className="text-foreground">Show code</strong> reads it
          right here.
        </p>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-3 text-sm">
          {journeys.map((journey) => (
            <a
              key={journey.id}
              href={`#journey-${journey.id}`}
              className="underline-offset-4 hover:underline"
            >
              {journey.title}
            </a>
          ))}
          <a href="#endpoints" className="underline-offset-4 hover:underline">
            Every endpoint
          </a>
        </nav>
        {missing.length > 0 ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            Some steps no longer point at real code (renamed or moved?): {missing.join(" · ")}
          </p>
        ) : null}
      </header>

      {journeys.map((journey, index) => (
        <Section
          key={journey.id}
          id={`journey-${journey.id}`}
          title={journey.title}
          intro={journey.summary}
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
              <MermaidDiagram chart={journeyChart(JOURNEYS[index] ?? journey)} />
            </div>
            <ol className="space-y-3">
              {journey.steps.map((step, stepIndex) => (
                <li
                  key={`${journey.id}-${String(stepIndex)}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2"
                >
                  <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-muted font-mono text-xs">
                    {stepIndex + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill className={ACTOR_STYLE[step.actor]}>{ACTORS[step.actor]}</Pill>
                      {step.to ? (
                        <>
                          <span aria-hidden className="text-muted-foreground">
                            →
                          </span>
                          <Pill className={ACTOR_STYLE[step.to]}>{ACTORS[step.to]}</Pill>
                        </>
                      ) : null}
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                    {step.ref ? (
                      <div className="mt-1">
                        <code className="mr-2 font-mono text-xs">{step.ref.name}</code>
                        <FileLink root={root} refTo={step.ref} />
                        <CodePreview refTo={step.ref} />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      ))}

      <Section
        id="endpoints"
        title="Every endpoint"
        intro={
          <>
            Click an endpoint to see who calls it and the code it runs, in order. Pills:{" "}
            <Pill className={KIND.controller.className}>controller</Pill> receives the request,{" "}
            <Pill className={KIND.service.className}>service</Pill> holds the logic,{" "}
            <Pill className={KIND.port.className}>port</Pill> is an interface with swappable
            implementations, each shown as an{" "}
            <Pill className={KIND.adapter.className}>adapter</Pill> (Stripe or fake: which one runs
            depends on <code>PAYMENTS_PROVIDER</code>),{" "}
            <Pill className={KIND.helper.className}>helper</Pill> is a private method or a shared
            function. Tables: <span className="font-medium text-foreground">write</span> /{" "}
            <span className="font-medium text-foreground">SQL</span> (hand-written) are highlighted.
          </>
        }
      >
        <div className="space-y-6">
          {tags.map((tag) => (
            <div key={tag}>
              <h3 className="text-sm font-semibold">{tag}</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                {operations
                  .filter((op) => op.operation.tag === tag)
                  .map((op) => (
                    <OperationRow key={op.operation.operationId} op={op} root={root} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

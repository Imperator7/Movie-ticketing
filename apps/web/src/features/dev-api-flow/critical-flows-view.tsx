import type { ReactNode } from "react";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { cn } from "@/lib/utils";
import { CodePreview, FileLink, Pill } from "./api-flow-view";
import { BOOKING_STATES, PAYMENT_STATES, type Verdict } from "./critical-flows";
import type { CodeRef } from "./load-api-flow";
import type { CriticalFlowsData, ResolvedCheckpoint, ResolvedTest } from "./load-critical-flows";

const VERDICT: Record<Verdict, { icon: string; label: string; className: string; border: string }> =
  {
    matches: {
      icon: "✓",
      label: "Matches the design",
      className: "bg-success/15 text-foreground",
      border: "border-border",
    },
    note: {
      icon: "!",
      label: "Note: trade-off",
      className: "bg-warning/20 text-foreground",
      border: "border-warning/60",
    },
    gap: {
      icon: "✕",
      label: "Gap: decide or fix",
      className: "bg-destructive/15 text-foreground",
      border: "border-destructive/60",
    },
  };

const anchor = (flowId: string, index: number) => `${flowId}-${String(index + 1)}`;

function Label({ children }: { children: ReactNode }) {
  return (
    <h5 className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h5>
  );
}

function Spans({
  refs,
  root,
  openFirst,
}: {
  refs: (CodeRef | null)[];
  root: string;
  openFirst: boolean;
}) {
  return (
    <ul className="mt-2 space-y-2">
      {refs.map((ref, index) =>
        ref ? (
          <li
            key={`${ref.file}:${String(ref.line)}`}
            className="min-w-0 rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code className="font-mono text-sm font-semibold">{ref.name}</code>
              <FileLink root={root} refTo={ref} />
              <span className="text-xs text-muted-foreground">
                lines {ref.line}–{ref.endLine}
              </span>
            </div>
            <CodePreview refTo={ref} open={openFirst && index === 0} />
          </li>
        ) : (
          <li key={`missing-${String(index)}`} className="text-sm text-destructive">
            This anchor no longer matches the code (renamed or moved?).
          </li>
        ),
      )}
    </ul>
  );
}

function Tests({ tests, root }: { tests: ResolvedTest[]; root: string }) {
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {tests.map((test) => (
        <li key={test.name} className="min-w-0">
          <span className="text-muted-foreground">“{test.name}”</span>{" "}
          {test.line === null ? (
            <span className="text-destructive">(not found)</span>
          ) : (
            <a
              href={`vscode://file/${root}/${test.file}:${String(test.line)}`}
              className="font-mono text-xs break-all text-primary underline-offset-4 hover:underline"
              title="Open in VS Code"
            >
              {test.file.split("/").pop()}:{test.line}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function CheckpointCard({
  checkpoint,
  id,
  number,
  root,
}: {
  checkpoint: ResolvedCheckpoint;
  id: string;
  number: number;
  root: string;
}) {
  const verdict = VERDICT[checkpoint.verdict];
  return (
    <li
      id={id}
      className={cn("scroll-mt-4 rounded-lg border bg-card/40 p-3 sm:p-4", verdict.border)}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{checkpoint.rule}</p>
          {checkpoint.design ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Design: {checkpoint.design}</p>
          ) : null}
        </div>
        <Pill className={verdict.className}>
          <span aria-hidden className="mr-1 font-mono">
            {verdict.icon}
          </span>
          {verdict.label}
        </Pill>
      </div>

      {checkpoint.finding ? (
        <p
          className={cn(
            "mt-3 rounded-md px-3 py-2 text-sm",
            checkpoint.verdict === "gap" ? "bg-destructive/10" : "bg-warning/10",
          )}
        >
          {checkpoint.finding}
        </p>
      ) : null}

      <Label>How the code does it</Label>
      <p className="mt-1 text-sm">{checkpoint.how}</p>

      <Label>Check while reading</Label>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {checkpoint.review.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>

      <Label>Code (in the order it runs)</Label>
      <Spans refs={checkpoint.code} root={root} openFirst />

      {checkpoint.db.length > 0 ? (
        <>
          <Label>Database backstop</Label>
          <Spans refs={checkpoint.db} root={root} openFirst={false} />
        </>
      ) : null}

      {checkpoint.tests.length > 0 ? (
        <>
          <Label>Covered by</Label>
          <Tests tests={checkpoint.tests} root={root} />
        </>
      ) : null}
    </li>
  );
}

export function CriticalFlowsView({ data }: { data: CriticalFlowsData }) {
  const { root, flows, missing } = data;
  const all = flows.flatMap((flow) =>
    flow.checkpoints.map((checkpoint, index) => ({ flow, checkpoint, index })),
  );
  const count = (verdict: Verdict) => all.filter((item) => item.checkpoint.verdict === verdict);
  const flagged = all.filter((item) => item.checkpoint.verdict !== "matches");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header>
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Code review
        </p>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          Critical flows: does the code do what the design says?
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Seat booking, payments, cancel, expiry and session refresh, walked in the order the code
          runs. Each checkpoint gives the design rule, the exact lines that implement it (read live
          from the repo), what to check while reading, the database constraint that backs it up, and
          the tests that cover it. Read a flow top to bottom with the code open.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(["matches", "note", "gap"] as const).map((verdict) => (
            <div
              key={verdict}
              className={cn("rounded-lg border bg-card p-3", VERDICT[verdict].border)}
            >
              <Pill className={VERDICT[verdict].className}>
                <span aria-hidden className="mr-1 font-mono">
                  {VERDICT[verdict].icon}
                </span>
                {VERDICT[verdict].label}
              </Pill>
              <p className="mt-2 font-heading text-3xl font-semibold">{count(verdict).length}</p>
            </div>
          ))}
        </div>

        {flagged.length > 0 ? (
          <div className="mt-4 rounded-lg border border-border bg-card p-3">
            <h2 className="text-sm font-semibold">Worth your attention</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {flagged.map(({ flow, checkpoint, index }) => (
                <li key={anchor(flow.id, index)} className="flex flex-wrap items-baseline gap-2">
                  <Pill className={VERDICT[checkpoint.verdict].className}>
                    {checkpoint.verdict}
                  </Pill>
                  <a
                    href={`#${anchor(flow.id, index)}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {flow.title} · {index + 1}
                  </a>
                  <span className="text-muted-foreground">{checkpoint.rule}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {missing.length > 0 ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            Some anchors no longer match the code: {missing.join(" · ")}
          </p>
        ) : null}

        <nav aria-label="Flows" className="mt-4 flex flex-wrap gap-3 text-sm">
          {flows.map((flow) => (
            <a key={flow.id} href={`#${flow.id}`} className="underline-offset-4 hover:underline">
              {flow.title}
            </a>
          ))}
        </nav>
      </header>

      <section aria-labelledby="states" className="mt-12">
        <h2 id="states" className="font-heading text-2xl font-semibold tracking-tight">
          State machines
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every arrow is one guarded update in the code below. Nothing else may change these
          statuses.
        </p>
        <div className="mt-4 grid gap-4">
          <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">Booking</h3>
            <MermaidDiagram chart={BOOKING_STATES} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">Payment (one per PaymentIntent)</h3>
            <MermaidDiagram chart={PAYMENT_STATES} />
          </div>
        </div>
      </section>

      {flows.map((flow) => (
        <section
          key={flow.id}
          id={flow.id}
          aria-labelledby={`${flow.id}-title`}
          className="mt-14 scroll-mt-4"
        >
          <h2
            id={`${flow.id}-title`}
            className="font-heading text-2xl font-semibold tracking-tight"
          >
            {flow.title}
          </h2>
          <p className="mt-1 font-mono text-sm break-all text-muted-foreground">{flow.request}</p>
          <p className="mt-2 max-w-3xl text-sm">{flow.purpose}</p>
          <ol className="mt-4 space-y-4">
            {flow.checkpoints.map((checkpoint, index) => (
              <CheckpointCard
                key={anchor(flow.id, index)}
                checkpoint={checkpoint}
                id={anchor(flow.id, index)}
                number={index + 1}
                root={root}
              />
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}

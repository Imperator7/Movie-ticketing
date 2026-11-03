import path from "node:path";
import { findDefinition, lineAt } from "./code-scan";
import {
  CRITICAL_FLOWS,
  type Checkpoint,
  type CodeSpan,
  type CriticalFlow,
  type TestRef,
} from "./critical-flows";
import { codeRef, qualified, Repo, repoRoot, toPosix, type CodeRef } from "./load-api-flow";

export interface ResolvedTest extends TestRef {
  /** 1-based line of the `it("…")`, or null when the title isn't found. */
  line: number | null;
}

export interface ResolvedCheckpoint extends Omit<Checkpoint, "code" | "db" | "tests"> {
  code: (CodeRef | null)[];
  db: (CodeRef | null)[];
  tests: ResolvedTest[];
}

export interface ResolvedFlow extends Omit<CriticalFlow, "checkpoints"> {
  checkpoints: ResolvedCheckpoint[];
}

export interface CriticalFlowsData {
  /** Absolute repo root with forward slashes, for editor links. */
  root: string;
  flows: ResolvedFlow[];
  /** Anchors (code spans, test titles) that no longer match the files. */
  missing: string[];
}

/** One code span → the exact lines it names, or null when its anchor no longer matches. */
export function resolveSpan(repo: Repo, span: CodeSpan): CodeRef | null {
  const source = repo.read(span.file);
  if (source === null) return null;
  if ("def" in span) {
    const found = findDefinition(source, span.def);
    return found ? codeRef(span.file, source, found, qualified(source, found, span.def)) : null;
  }
  const start = source.indexOf(span.from);
  if (start < 0) return null;
  let end: number;
  if (span.to === undefined) {
    const newline = source.indexOf("\n", start);
    end = newline < 0 ? source.length : newline;
  } else {
    const toAt = source.indexOf(span.to, start);
    if (toAt < 0) return null;
    end = toAt + span.to.length;
  }
  const lineStart = source.lastIndexOf("\n", start) + 1;
  return codeRef(
    span.file,
    source,
    { start: lineStart, end },
    span.label ?? path.posix.basename(span.file),
  );
}

/** The line of a test title (`it("<name>"`), or null. */
export function resolveTest(repo: Repo, test: TestRef): ResolvedTest {
  const source = repo.read(test.file);
  const at = source?.indexOf(`"${test.name}"`) ?? -1;
  return { ...test, line: source && at >= 0 ? lineAt(source, at) : null };
}

const describeSpan = (span: CodeSpan) =>
  "def" in span ? `${span.file} → ${span.def}` : `${span.file} → ${span.from.slice(0, 50)}`;

/** Reads every anchor of CRITICAL_FLOWS from the repo. Server-only (fs); runs on each dev request. */
export function loadCriticalFlows(root: string = repoRoot()): CriticalFlowsData {
  const repo = new Repo(root);
  const missing: string[] = [];
  const spans = (flowId: string, list: readonly CodeSpan[] | undefined) =>
    (list ?? []).map((span) => {
      const ref = resolveSpan(repo, span);
      if (!ref) missing.push(`${flowId}: ${describeSpan(span)}`);
      return ref;
    });

  const flows = CRITICAL_FLOWS.map((flow): ResolvedFlow => ({
    ...flow,
    checkpoints: flow.checkpoints.map((checkpoint): ResolvedCheckpoint => {
      const tests = (checkpoint.tests ?? []).map((test) => {
        const resolved = resolveTest(repo, test);
        if (resolved.line === null) missing.push(`${flow.id}: test "${test.name}"`);
        return resolved;
      });
      return {
        ...checkpoint,
        code: spans(flow.id, checkpoint.code),
        db: spans(flow.id, checkpoint.db),
        tests,
      };
    }),
  }));
  return { root: toPosix(path.resolve(root)), flows, missing };
}

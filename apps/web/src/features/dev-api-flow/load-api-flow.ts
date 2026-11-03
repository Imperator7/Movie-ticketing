import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { operationsFromSpec, parseImplemented, type Operation } from "@/features/dev-flow/flow";
import {
  enclosingClass,
  fieldTypes,
  findDefinition,
  findText,
  importedName,
  lineAt,
  memberCalls,
  namedImports,
  operationOfIdentifier,
  plainCalls,
  tablesFromSchema,
  tablesIn,
  type Span,
  type TableUse,
} from "./code-scan";
import { JOURNEYS, type Journey, type JourneyStep } from "./journeys";

/** A piece of code: where it is and what it says. */
export interface CodeRef {
  /** Repo-relative, forward slashes. */
  file: string;
  line: number;
  endLine: number;
  /** `BookingService.create`, `createBooking`, … */
  name: string;
  /** The code itself (capped), for the inline preview. */
  code: string;
  /** Lines cut from the preview. */
  truncated: number;
}

/** port = an abstract class the code depends on; adapter = one of its implementations (Stripe, fake, …). */
export type NodeKind = "controller" | "service" | "helper" | "port" | "adapter";

export interface CallNode {
  kind: NodeKind;
  ref: CodeRef;
  /** How the parent calls it: `this.bookings.create(`. */
  via: string;
  tables: TableUse[];
  children: CallNode[];
}

export interface WebCaller {
  ref: CodeRef;
  /** Identifier used: `useGetBooking`, `login`. */
  identifier: string;
}

export interface OperationCode {
  operation: Operation;
  live: boolean;
  web: WebCaller[];
  /** Controller method and everything it calls; null when not built (or not found). */
  tree: CallNode | null;
  /** Every table touched anywhere in the tree. */
  tables: TableUse[];
}

export interface ResolvedStep extends JourneyStep {
  ref: CodeRef | null;
}

export interface ApiFlowData {
  /** Absolute repo root with forward slashes, for editor links. */
  root: string;
  operations: OperationCode[];
  journeys: (Omit<Journey, "steps"> & { steps: ResolvedStep[] })[];
  /** Journey steps whose code couldn't be found (shown as a warning; the test fails on them). */
  missing: string[];
}

const MAX_PREVIEW_LINES = 80;
const MAX_DEPTH = 3;
/** Fields that are infrastructure, not part of the flow. */
const SKIP_FIELDS = new Set(["logger", "config", "prisma"]);

export const repoRoot = (cwd: string = process.cwd()) => path.join(cwd, "..", "..");
export const toPosix = (p: string) => p.split(path.sep).join("/");

export class Repo {
  private readonly cache = new Map<string, string>();

  constructor(readonly root: string) {}

  read(file: string): string | null {
    const cached = this.cache.get(file);
    if (cached !== undefined) return cached;
    const absolute = path.join(this.root, file);
    if (!existsSync(absolute)) return null;
    const text = readFileSync(absolute, "utf-8").replaceAll("\r\n", "\n");
    this.cache.set(file, text);
    return text;
  }

  /** Every file under `dir` (repo-relative) matching `test`. */
  list(dir: string, test: (file: string) => boolean): string[] {
    const out: string[] = [];
    const walk = (relative: string) => {
      const absolute = path.join(this.root, relative);
      if (!existsSync(absolute)) return;
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "generated") walk(child);
        } else if (test(child)) out.push(child);
      }
    };
    walk(dir);
    return out.sort();
  }

  /** API files with a class that extends `base` (the implementations of a port). */
  implementationsOf(base: string): string[] {
    if (!base) return [];
    const pattern = new RegExp(`class\\s+\\w+\\s+extends\\s+${base}\\b`);
    return this.list(
      "apps/api/src",
      (file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"),
    ).filter((file) => pattern.test(this.read(file) ?? ""));
  }

  /** Resolves an import specifier from `fromFile` to a repo file (`./x.js` → `./x.ts`, `@/` → web src). */
  resolveImport(fromFile: string, specifier: string): string | null {
    let base: string;
    if (specifier.startsWith("@/")) base = `apps/web/src/${specifier.slice(2)}`;
    else if (specifier.startsWith("."))
      base = path.posix.join(path.posix.dirname(fromFile), specifier);
    else return null;
    const stem = base.replace(/\.(js|ts|tsx)$/, "");
    for (const candidate of [`${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`]) {
      if (this.read(candidate) !== null) return candidate;
    }
    return null;
  }
}

export function codeRef(file: string, source: string, span: Span, name: string): CodeRef {
  const line = lineAt(source, span.start);
  const lines = source.split("\n");
  const endLine = Math.max(line, lineAt(source, Math.max(span.start, span.end - 1)));
  const shown = Math.min(endLine, line + MAX_PREVIEW_LINES - 1);
  return {
    file,
    line,
    endLine,
    name,
    code: lines.slice(line - 1, shown).join("\n"),
    truncated: endLine - shown,
  };
}

/** A step pointing at a call inside a function: show from that line to the end of the statement-ish block. */
function textRef(file: string, source: string, span: Span, name: string): CodeRef {
  const lines = source.split("\n");
  const line = lineAt(source, span.start);
  const shown = Math.min(lines.length, line + 11);
  return {
    file,
    line,
    endLine: line,
    name,
    code: lines.slice(line - 1, shown).join("\n"),
    truncated: 0,
  };
}

export function qualified(source: string, span: Span, name: string): string {
  const owner = enclosingClass(source, span.start);
  return owner && owner !== name ? `${owner}.${name}` : name;
}

/** Builds the call tree under one definition. */
function buildNode(
  repo: Repo,
  models: Map<string, string>,
  file: string,
  name: string,
  kind: NodeKind,
  via: string,
  depth: number,
  visited: Set<string>,
): CallNode | null {
  const source = repo.read(file);
  if (source === null) return null;
  const span = findDefinition(source, name);
  if (!span) return null;
  const key = `${file}#${name}`;
  visited.add(key);
  const body = source.slice(span.start, span.end);
  const node: CallNode = {
    kind,
    ref: codeRef(file, source, span, qualified(source, span, name)),
    via,
    tables: tablesIn(body, models),
    children: [],
  };
  if (kind === "port") {
    // Show what actually runs: every class that extends the port and implements this method.
    const owner = enclosingClass(source, span.start) ?? "";
    for (const implFile of repo.implementationsOf(owner)) {
      if (visited.has(`${implFile}#${name}`)) continue;
      const impl = buildNode(
        repo,
        models,
        implFile,
        name,
        "adapter",
        "implements",
        depth + 1,
        visited,
      );
      if (impl && !/^\s*abstract\b/.test(impl.ref.code)) node.children.push(impl);
    }
    return node;
  }
  if (depth >= MAX_DEPTH) return node;

  const fields = fieldTypes(source);
  const imports = namedImports(source);
  const add = (child: CallNode | null) => {
    if (child) node.children.push(child);
  };

  for (const call of memberCalls(body)) {
    if (call.field === null) {
      if (call.method === name || visited.has(`${file}#${call.method}`)) continue;
      add(
        buildNode(
          repo,
          models,
          file,
          call.method,
          "helper",
          `this.${call.method}(`,
          depth + 1,
          visited,
        ),
      );
      continue;
    }
    if (SKIP_FIELDS.has(call.field)) continue;
    const type = fields.get(call.field);
    const specifier = type ? imports.get(type) : undefined;
    const target = specifier ? repo.resolveImport(file, specifier) : null;
    if (!target || visited.has(`${target}#${call.method}`)) continue;
    const targetSource = repo.read(target) ?? "";
    const isPort = new RegExp(`abstract\\s+class\\s+${type ?? ""}\\b`).test(targetSource);
    add(
      buildNode(
        repo,
        models,
        target,
        call.method,
        isPort ? "port" : kind === "controller" ? "service" : "helper",
        `this.${call.field}.${call.method}(`,
        depth + 1,
        visited,
      ),
    );
  }

  // Plain functions imported from our own files (pure rules, shared helpers).
  const local = [...imports].filter(([, from]) => from.startsWith("."));
  for (const fn of plainCalls(
    body,
    local.map(([symbol]) => symbol),
  )) {
    const target = repo.resolveImport(file, imports.get(fn) ?? "");
    if (!target || visited.has(`${target}#${fn}`)) continue;
    add(buildNode(repo, models, target, fn, "helper", `${fn}(`, depth + 1, visited));
  }
  return node;
}

function allTables(node: CallNode | null): TableUse[] {
  const merged = new Map<string, TableUse>();
  const visit = (n: CallNode) => {
    for (const use of n.tables) {
      const existing = merged.get(use.table);
      if (!existing || existing.kind === "read") merged.set(use.table, use);
    }
    n.children.forEach(visit);
  };
  if (node) visit(node);
  return [...merged.values()].sort((a, b) => a.table.localeCompare(b.table));
}

/** Web files that call each operation through the generated client (`useGetBooking`, `login`, …). */
function webCallers(repo: Repo, operationIds: Set<string>): Map<string, WebCaller[]> {
  const callers = new Map<string, WebCaller[]>();
  const files = repo.list(
    "apps/web/src",
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      !/\.test\.tsx?$/.test(file) &&
      !file.includes("/mocks/") &&
      !file.includes("/api/generated/") &&
      !file.includes("/dev-"),
  );
  for (const file of files) {
    const source = repo.read(file) ?? "";
    for (const [local, from] of namedImports(source)) {
      if (!from.startsWith("@/api/generated/endpoints")) continue;
      const exported = importedName(source, local);
      const operationId = operationOfIdentifier(exported, operationIds);
      if (!operationId) continue;
      // First use after the imports.
      const pattern = new RegExp(`(?<![\\w.])${local}\\s*(?:<[^>()]*>)?\\(`, "g");
      const importEnd = source.lastIndexOf("\nimport ");
      const afterImports = importEnd < 0 ? 0 : source.indexOf("\n", importEnd + 1);
      pattern.lastIndex = afterImports;
      const match = pattern.exec(source);
      if (!match) continue;
      const span = { start: match.index, end: match.index + local.length };
      const owner = /export function (\w+)|function (\w+)/.exec(
        source
          .slice(0, match.index)
          .split(/\n(?=export function |function )/)
          .pop() ?? "",
      );
      const name = owner?.[1] ?? owner?.[2] ?? path.posix.basename(file);
      callers.set(operationId, [
        ...(callers.get(operationId) ?? []),
        { identifier: local, ref: textRef(file, source, span, name) },
      ]);
    }
  }
  return callers;
}

function resolveStep(repo: Repo, step: JourneyStep): CodeRef | null {
  if (!step.file || !step.find) return null;
  const source = repo.read(step.file);
  if (source === null) return null;
  const definition = /^\w+$/.test(step.find) ? findDefinition(source, step.find) : null;
  if (definition)
    return codeRef(step.file, source, definition, qualified(source, definition, step.find));
  const text = findText(source, step.find);
  return text ? textRef(step.file, source, text, path.posix.basename(step.file)) : null;
}

/** Reads the contract, the controllers and the web client usage. Server-only (fs); runs on each dev request. */
export function loadApiFlow(root: string = repoRoot()): ApiFlowData {
  const repo = new Repo(root);
  const spec: unknown = parse(repo.read("docs/openapi.yaml") ?? "");
  const operations = operationsFromSpec(spec);
  const live = parseImplemented(repo.read("apps/api/src/contract/implemented-operations.ts") ?? "");
  const models = tablesFromSchema(repo.read("apps/api/prisma/schema.prisma") ?? "");
  const controllers = repo.list("apps/api/src", (file) => file.endsWith(".controller.ts"));
  const web = webCallers(repo, new Set(operations.map((op) => op.operationId)));

  const codes = operations.map((operation): OperationCode => {
    let tree: CallNode | null = null;
    for (const file of controllers) {
      const source = repo.read(file) ?? "";
      if (!findDefinition(source, operation.operationId)) continue;
      tree = buildNode(repo, models, file, operation.operationId, "controller", "", 0, new Set());
      if (tree) break;
    }
    return {
      operation,
      live: live.has(operation.operationId),
      web: web.get(operation.operationId) ?? [],
      tree,
      tables: allTables(tree),
    };
  });

  const missing: string[] = [];
  const journeys = JOURNEYS.map((journey) => ({
    ...journey,
    steps: journey.steps.map((step): ResolvedStep => {
      const ref = resolveStep(repo, step);
      if (step.file && !ref) missing.push(`${journey.id}: ${step.file} → ${step.find ?? ""}`);
      return { ...step, ref };
    }),
  }));

  return { root: toPosix(path.resolve(root)), operations: codes, journeys, missing };
}

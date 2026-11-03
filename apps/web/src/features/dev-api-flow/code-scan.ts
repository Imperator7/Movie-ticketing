/**
 * Small, dependency-free source scanning for the dev-only `/api-flow` page: find where a function or method is
 * defined, where its body ends, what it calls and which tables it touches. Heuristics tuned to this repo's
 * Prettier-formatted TypeScript (bodies open with `{` at the end of a line), not a general parser.
 * code-scan.test.ts covers the edge cases; api-flow.test.ts checks every live operation still resolves.
 */

export interface Span {
  /** Index of the first character of the definition. */
  start: number;
  /** Index just after the definition (after the closing `}` or `;`). */
  end: number;
}

/** 1-based line number of a character index. */
export function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Index just after a '…' or "…" string (strings can't span lines, so a stray JSX apostrophe stops at the newline). */
function skipQuoted(source: string, open: number): number {
  const quote = source[open];
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") i++;
    else if (c === quote || c === "\n") return i + 1;
  }
  return source.length;
}

/** Index just after a `…` template literal, including nested `${ … }` expressions. */
export function skipTemplate(source: string, open: number): number {
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") i++;
    else if (c === "`") return i + 1;
    else if (c === "$" && source[i + 1] === "{") {
      const close = matchBrace(source, i + 1);
      if (close < 0) return source.length;
      i = close;
    }
  }
  return source.length;
}

/** Index of the `}` matching the `{` at `open`, skipping strings, templates and comments; -1 if unbalanced. */
export function matchBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const newline = source.indexOf("\n", i);
      if (newline < 0) return -1;
      i = newline;
    } else if (c === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close < 0) return -1;
      i = close + 1;
    } else if (c === '"' || c === "'") {
      i = skipQuoted(source, i) - 1;
    } else if (c === "`") {
      i = skipTemplate(source, i) - 1;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the `)` matching the `(` at `open` (no strings with parens in parameter lists here). */
function matchParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "`") i = skipTemplate(source, i) - 1;
    else if (c === '"' || c === "'") i = skipQuoted(source, i) - 1;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * The end of a definition starting at `start`: the matching `}` of its body, where the body is the first `{` that
 * ends a line (Prettier style) or an empty `{}`; or the first `;` at top level when there is no body (abstract
 * methods, plain constants).
 */
function definitionEnd(source: string, start: number): number {
  let parens = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "`") {
      i = skipTemplate(source, i) - 1;
    } else if (c === '"' || c === "'") {
      i = skipQuoted(source, i) - 1;
    } else if (c === "(") {
      parens++;
    } else if (c === ")") {
      parens--;
    } else if (parens === 0 && c === ";") {
      return i + 1;
    } else if (parens === 0 && c === "{") {
      if (source[i + 1] === "}") return i + 2;
      if (/^[ \t]*\r?\n/.test(source.slice(i + 1, i + 3))) {
        const close = matchBrace(source, i);
        return close < 0 ? source.length : close + 1;
      }
    }
  }
  return source.length;
}

const MODIFIERS = "(?:(?:public|private|protected|static|override|readonly|abstract|async)\\s+)*";

/**
 * Where `name` is defined: a function, class, `const name =`, or a class method / abstract method. A method is
 * told apart from a call statement by what follows its parameter list (`{` or a `:` return type, not `;`).
 */
export function findDefinition(source: string, name: string): Span | null {
  const n = escapeRegExp(name);
  const simple = [
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${n}\\b`, "m"),
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:abstract\\s+)?class\\s+${n}\\b`, "m"),
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:const|let)\\s+${n}\\s*[:=]`, "m"),
  ];
  for (const pattern of simple) {
    const match = pattern.exec(source);
    if (match) {
      const start = match.index + (match[0].length - match[0].trimStart().length);
      return { start, end: definitionEnd(source, start) };
    }
  }
  const method = new RegExp(`^([ \\t]+)${MODIFIERS}${n}\\s*(?:<[^>()]*>)?\\(`, "gm");
  for (let match = method.exec(source); match; match = method.exec(source)) {
    const open = match.index + match[0].length - 1;
    const close = matchParen(source, open);
    if (close < 0) continue;
    const after = source.slice(close + 1).trimStart()[0];
    if (after !== "{" && after !== ":") continue;
    const start = match.index + (match[1]?.length ?? 0);
    return { start, end: definitionEnd(source, start) };
  }
  return null;
}

/** Where `text` first appears (for steps that point at a line inside a function, e.g. a call). */
export function findText(source: string, text: string): Span | null {
  const start = source.indexOf(text);
  return start < 0 ? null : { start, end: start + text.length };
}

/** The class a position sits in (the last `class X` before it whose body contains it). */
export function enclosingClass(source: string, index: number): string | null {
  const pattern = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
  let found: string | null = null;
  for (
    let match = pattern.exec(source);
    match && match.index < index;
    match = pattern.exec(source)
  ) {
    const end = definitionEnd(source, match.index);
    if (end > index) found = match[1] ?? null;
  }
  return found;
}

/** Constructor-injected fields: `private readonly bookings: BookingService` → bookings → BookingService. */
export function fieldTypes(source: string): Map<string, string> {
  const fields = new Map<string, string>();
  const pattern = /(?:private|protected|public)\s+(?:readonly\s+)?(\w+)\s*:\s*([A-Z]\w*)/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] && match[2]) fields.set(match[1], match[2]);
  }
  return fields;
}

/** Named imports of a file: symbol → module specifier (type-only imports included, `as` renames resolved). */
export function namedImports(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const [, names = "", from = ""] = match;
    for (const raw of names.split(",")) {
      const parts = raw
        .replace(/\btype\s+/, "")
        .trim()
        .split(/\s+as\s+/);
      const local = (parts[1] ?? parts[0] ?? "").trim();
      if (local) imports.set(local, from);
    }
  }
  return imports;
}

/** The original (exported) name behind a local import alias: `register as registerAccount` → register. */
export function importedName(source: string, local: string): string {
  const match = new RegExp(`\\b(\\w+)\\s+as\\s+${escapeRegExp(local)}\\b`).exec(source);
  return match?.[1] ?? local;
}

export interface MemberCall {
  /** Injected field (`this.<field>.<method>(`), or null for the class's own method (`this.<method>(`). */
  field: string | null;
  method: string;
}

/** `this.x.y(` and `this.y(` calls, in order of first appearance, without duplicates. */
export function memberCalls(body: string): MemberCall[] {
  const seen = new Set<string>();
  const calls: MemberCall[] = [];
  for (const match of body.matchAll(/\bthis\.(\w+)(?:\.(\w+))?\s*(?:<[^>()]*>)?\(/g)) {
    const call: MemberCall = match[2]
      ? { field: match[1] ?? null, method: match[2] }
      : { field: null, method: match[1] ?? "" };
    const key = `${call.field ?? ""}.${call.method}`;
    if (!seen.has(key)) {
      seen.add(key);
      calls.push(call);
    }
  }
  return calls;
}

/**
 * Plain calls `name(` of the given (imported) names, in order of first appearance. Constructors (`new X(`) and
 * decorators (`@X(`) aren't steps of the flow, so they're left out.
 */
export function plainCalls(body: string, names: Iterable<string>): string[] {
  const found: { name: string; at: number }[] = [];
  for (const name of names) {
    const at = body.search(
      new RegExp(`(?<![.\\w@])(?<!new\\s+)${escapeRegExp(name)}\\s*(?:<[^>()]*>)?\\(`),
    );
    if (at >= 0) found.push({ name, at });
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.name);
}

const PRISMA_METHODS =
  "findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy";

/** Prisma model accessor → table name, from schema.prisma (`model BookingSeat { … @@map("booking_seats") }`). */
export function tablesFromSchema(schema: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model = "", body = ""] = match;
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model;
    map.set(model.charAt(0).toLowerCase() + model.slice(1), table);
  }
  return map;
}

export interface TableUse {
  table: string;
  /** "read", "write", or "sql" for hand-written SQL (`$queryRaw` / `$executeRaw`). */
  kind: "read" | "write" | "sql";
}

/** Tables a body touches through Prisma (`tx.booking.update(`) and raw SQL (`FROM seat_locks`). */
export function tablesIn(body: string, models: Map<string, string>): TableUse[] {
  const uses = new Map<string, TableUse>();
  const add = (table: string, kind: TableUse["kind"]) => {
    const existing = uses.get(table);
    if (!existing || (existing.kind === "read" && kind !== "read"))
      uses.set(table, { table, kind });
  };
  const prisma = new RegExp(`\\.(\\w+)\\.(${PRISMA_METHODS})\\s*\\(`, "g");
  for (const match of body.matchAll(prisma)) {
    const table = models.get(match[1] ?? "");
    if (table)
      add(table, /^(find|count|aggregate|groupBy)/.test(match[2] ?? "") ? "read" : "write");
  }
  for (const match of body.matchAll(/\$(?:query|execute)Raw(?:<[^`]*?>)?`/g)) {
    const open = match.index + match[0].length - 1;
    const sql = body.slice(open, skipTemplate(body, open));
    for (const ref of sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
      const table = ref[1] ?? "";
      if ([...models.values()].includes(table) || table.includes("_")) add(table, "sql");
    }
  }
  return [...uses.values()];
}

/** `useGetBooking` → getBooking, `login` → login; null when it isn't one of the operations (e.g. a query key). */
export function operationOfIdentifier(identifier: string, operations: Set<string>): string | null {
  if (operations.has(identifier)) return identifier;
  const hook = /^use([A-Z]\w*)$/.exec(identifier)?.[1];
  if (hook) {
    const id = hook.charAt(0).toLowerCase() + hook.slice(1);
    if (operations.has(id)) return id;
  }
  return null;
}

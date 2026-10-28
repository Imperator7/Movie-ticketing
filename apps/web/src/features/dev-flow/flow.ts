/**
 * Data and pure helpers for the dev-only `/flow` page: how a customer moves through the screens, which API
 * operations each screen calls, and the path every API request takes through the server.
 *
 * Only the screen map and the pipeline stages are written by hand. Whether an operation is live comes from the
 * API's contract allowlist (apps/api/src/contract/implemented-operations.ts), the operations themselves from
 * docs/openapi.yaml, and the conformance results from reports/test-report.json, so the page follows each merge.
 * flow.test.ts fails if a screen names an operation or route that doesn't exist.
 */

// ---------------------------------------------------------------- screens (the customer journey)

export interface ScreenLink {
  to: string;
  label: string;
}

export interface Screen {
  id: string;
  label: string;
  /** Route under /<locale>, with its query parameters. */
  route: string;
  /** Folder under src/app/[locale] (empty = the home page). */
  dir: string;
  /** Example URL to open in the app (dev:mock), or null when it needs an id from a previous step. */
  open: string | null;
  /** operationIds the screen calls (docs/openapi.yaml). */
  operations: readonly string[];
  next: readonly ScreenLink[];
}

export const SCREENS: readonly Screen[] = [
  {
    id: "home",
    label: "Home",
    route: "/",
    dir: "",
    open: "/th",
    operations: ["listMovies"],
    next: [
      { to: "movies", label: "See all" },
      { to: "movie", label: "Movie card" },
    ],
  },
  {
    id: "movies",
    label: "Movies",
    route: "/movies?genre=&q=&page=",
    dir: "movies",
    open: "/th/movies",
    operations: ["listGenres", "listMovies"],
    next: [{ to: "movie", label: "Movie card" }],
  },
  {
    id: "movie",
    label: "Movie",
    route: "/movie?slug=&date=",
    dir: "movie",
    open: null,
    operations: ["getMovie", "listMovieShowtimes"],
    next: [{ to: "showtime", label: "Showtime" }],
  },
  {
    id: "showtime",
    label: "Seats",
    route: "/showtime?id=&seats=",
    dir: "showtime",
    open: null,
    operations: ["getShowtime", "getSeatMap", "getActiveBooking", "createBooking"],
    next: [
      { to: "login", label: "Buy (logged out)" },
      { to: "checkout", label: "Buy" },
    ],
  },
  {
    id: "login",
    label: "Log in",
    route: "/login?next=",
    dir: "login",
    open: "/th/login",
    operations: ["login"],
    next: [
      { to: "register", label: "No account" },
      { to: "showtime", label: "Back to ?next=" },
    ],
  },
  {
    id: "register",
    label: "Register",
    route: "/register?next=",
    dir: "register",
    open: "/th/register",
    operations: ["register"],
    next: [{ to: "showtime", label: "Back to ?next=" }],
  },
  {
    id: "checkout",
    label: "Checkout",
    route: "/checkout?bookingId=",
    dir: "checkout",
    open: null,
    operations: ["getBooking", "createPaymentIntent", "cancelBooking"],
    next: [
      { to: "complete", label: "Pay" },
      { to: "showtime", label: "Cancel / time's up" },
    ],
  },
  {
    id: "complete",
    label: "Payment result",
    route: "/checkout/complete?bookingId=",
    dir: "checkout/complete",
    open: null,
    operations: ["getBooking"],
    next: [{ to: "booking", label: "Confirmed" }],
  },
  {
    id: "booking",
    label: "Ticket",
    route: "/booking?id=",
    dir: "booking",
    open: null,
    operations: ["getBooking"],
    next: [{ to: "bookings", label: "My bookings" }],
  },
  {
    id: "bookings",
    label: "My bookings",
    route: "/bookings?scope=",
    dir: "bookings",
    open: "/th/bookings",
    operations: ["listMyBookings"],
    next: [{ to: "booking", label: "Open ticket" }],
  },
];

/** Calls made on every page, not by one screen (shown separately). */
export const GLOBAL_OPERATIONS: readonly { operationId: string; where: string }[] = [
  { operationId: "refresh", where: "App load and 401 retry (api-client, serialized across tabs)" },
  { operationId: "getActiveBooking", where: "Active-booking banner (app load, window focus)" },
  { operationId: "cancelBooking", where: "Active-booking banner: give up" },
  { operationId: "logout", where: "User menu" },
];

// ---------------------------------------------------------------- the API request pipeline

export type PipelineLayer = "edge" | "express" | "nest" | "data";

export interface PipelineStage {
  layer: PipelineLayer;
  name: string;
  /** Where it is wired. */
  source: string;
  what: string;
  /** Which requests it applies to, when not all of them. */
  only?: string;
  /** Not built yet (deployment phases). */
  planned?: boolean;
}

/** In request order. Checked against apps/api/src/app.setup.ts, app.module.ts and common.module.ts. */
export const PIPELINE: readonly PipelineStage[] = [
  {
    layer: "edge",
    name: "CloudFront + ALB",
    source: "Phase 8 / AWS",
    what: "TLS, CDN cache for public GETs, forwards X-Forwarded-For",
    planned: true,
  },
  {
    layer: "express",
    name: "no-store default",
    source: "app.setup.ts · noStoreByDefault",
    what: "Cache-Control: no-store on every response unless a route opts in",
  },
  {
    layer: "express",
    name: "trust proxy",
    source: "app.setup.ts · TRUST_PROXY_HOPS",
    what: "Real client IP from X-Forwarded-For (0 hops = trust nobody)",
  },
  {
    layer: "express",
    name: "helmet",
    source: "app.setup.ts",
    what: "Security headers (CSP relaxed only while Swagger is on)",
  },
  {
    layer: "express",
    name: "CORS",
    source: "app.setup.ts · WEB_ORIGINS",
    what: "Allowed web origins with credentials",
    only: "development (same origin behind CloudFront in production)",
  },
  {
    layer: "express",
    name: "cookie-parser + JSON body",
    source: "app.setup.ts",
    what: "Reads the refresh cookie `rt`; JSON body size limit",
  },
  {
    layer: "express",
    name: "pino-http",
    source: "logger.config.ts · genReqId",
    what: "X-Request-Id, access log, secret redaction",
  },
  {
    layer: "nest",
    name: "AppThrottlerGuard",
    source: "app.module.ts · APP_GUARD #1",
    what: "Rate limits before auth, so floods are cheap to reject (429)",
  },
  {
    layer: "nest",
    name: "JwtAuthGuard",
    source: "app.module.ts · APP_GUARD #2",
    what: "Bearer access token (HS256) → current user, else 401",
    only: "operations with security (skipped for @Public)",
  },
  {
    layer: "nest",
    name: "OriginGuard",
    source: "auth.controller.ts · @UseGuards",
    what: "Origin must be an allowed web origin, else 403 (CSRF defence)",
    only: "cookie endpoints: refresh, logout",
  },
  {
    layer: "nest",
    name: "@CacheControl interceptor",
    source: "common/http/cache-control.ts",
    what: "Sets the public cache header after a successful handler",
    only: "public catalog GETs",
  },
  {
    layer: "nest",
    name: "ZodValidationPipe",
    source: "common.module.ts · APP_PIPE",
    what: "Strict DTOs (unknown keys rejected) → 422 VALIDATION_FAILED",
  },
  {
    layer: "nest",
    name: "Controller → Service",
    source: "src/<module>/",
    what: "Authorization inside the query; server computes prices, statuses, deadlines",
  },
  {
    layer: "data",
    name: "Prisma (app_user)",
    source: "prisma.service.ts",
    what: "DML-only role, connection pool, transactions",
  },
  {
    layer: "data",
    name: "Postgres 17",
    source: "docker/postgres",
    what: "Constraints decide races (partial unique index on seat locks)",
  },
  {
    layer: "nest",
    name: "AllExceptionsFilter",
    source: "common.module.ts · APP_FILTER",
    what: "Every error → contract Error + ErrorCode, forced no-store",
    only: "when anything above throws",
  },
];

// ---------------------------------------------------------------- operations (from the spec)

export type OperationStatus = "live" | "planned";
export type CheckStatus = "passed" | "failed" | "skipped" | "not-run";

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  tag: string;
  /** "public" (security: []), "bearer", or "cookie". */
  auth: "public" | "bearer" | "cookie";
  statuses: string[];
}

interface SpecOperation {
  operationId?: unknown;
  tags?: unknown;
  security?: unknown;
  responses?: unknown;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Every operation of a parsed docs/openapi.yaml, in spec order. */
export function operationsFromSpec(spec: unknown): Operation[] {
  const root = (spec ?? {}) as { paths?: Record<string, Record<string, SpecOperation>> };
  const result: Operation[] = [];
  for (const [path, item] of Object.entries(root.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op || typeof op.operationId !== "string") continue;
      result.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        tag: Array.isArray(op.tags) && typeof op.tags[0] === "string" ? op.tags[0] : "",
        auth: authOf(op.security),
        statuses: Object.keys(op.responses ?? {}),
      });
    }
  }
  return result;
}

function authOf(security: unknown): Operation["auth"] {
  if (!Array.isArray(security)) return "bearer"; // the spec's global default
  if (security.length === 0) return "public";
  const schemes = security.flatMap((entry) => Object.keys(entry as Record<string, unknown>));
  return schemes.includes("refreshCookie") ? "cookie" : "bearer";
}

/** The operationIds listed in implemented-operations.ts (its string literals inside the array). */
export function parseImplemented(source: string): Set<string> {
  const body = /IMPLEMENTED_OPERATIONS\s*=\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? "";
  const withoutComments = body.replace(/\/\/.*$/gm, "");
  return new Set([...withoutComments.matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1] ?? ""));
}

/** Which pipeline stages run for an operation (by name, in order). */
export function stagesFor(op: Pick<Operation, "auth" | "method" | "tag">): string[] {
  return PIPELINE.filter((stage) => {
    if (stage.planned || stage.name === "AllExceptionsFilter" || stage.name === "CORS")
      return false;
    if (stage.name === "JwtAuthGuard") return op.auth === "bearer";
    if (stage.name === "OriginGuard") return op.auth === "cookie";
    if (stage.name === "@CacheControl interceptor")
      return op.auth === "public" && op.method === "GET" && op.tag === "Catalog";
    return true;
  }).map((stage) => stage.name);
}

// ---------------------------------------------------------------- statuses

export type ScreenStatus = "live" | "partial" | "mock";

/** live = every operation is implemented, mock = none, partial = some. */
export function screenStatus(screen: Pick<Screen, "operations">, live: Set<string>): ScreenStatus {
  const count = screen.operations.filter((id) => live.has(id)).length;
  if (count === 0) return "mock";
  return count === screen.operations.length ? "live" : "partial";
}

/** operationId → conformance status, from the test report's conformance section. */
export function conformanceByOperation(
  conformance: { operations: { operationId: string; status: CheckStatus }[] } | null | undefined,
): Map<string, CheckStatus> {
  return new Map((conformance?.operations ?? []).map((op) => [op.operationId, op.status]));
}

/** operationId → screen labels that call it (global calls included). */
export function screensByOperation(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (id: string, label: string) => {
    map.set(id, [...(map.get(id) ?? []), label]);
  };
  for (const screen of SCREENS) for (const id of screen.operations) add(id, screen.label);
  for (const global of GLOBAL_OPERATIONS) add(global.operationId, "Global");
  return map;
}

// ---------------------------------------------------------------- mermaid sources

const escapeLabel = (text: string) => text.replace(/"/g, "#quot;");

/** Screen flowchart; node colour = live / partial / mock. */
export function screenFlowChart(live: Set<string>): string {
  const lines = ["flowchart LR"];
  for (const screen of SCREENS) {
    lines.push(
      `  ${screen.id}["${escapeLabel(`<b>${screen.label}</b><br/><small>${screen.route}</small>`)}"]:::${screenStatus(screen, live)}`,
    );
  }
  for (const screen of SCREENS) {
    for (const link of screen.next) {
      lines.push(`  ${screen.id} -- "${escapeLabel(link.label)}" --> ${link.to}`);
    }
  }
  // Mermaid can't parse var() in classDef, so these only mark the nodes; FLOW_CHART_CSS colours them with tokens.
  lines.push(
    "  classDef live stroke-width:2px",
    "  classDef partial stroke-width:2px",
    "  classDef mock stroke-width:1px",
  );
  return lines.join("\n");
}

/** The request pipeline as a top-down chart grouped by layer. */
export function pipelineChart(): string {
  const layers: Record<PipelineLayer, string> = {
    edge: "Edge (AWS)",
    express: "Express middleware",
    nest: "Nest",
    data: "Data",
  };
  const ids = PIPELINE.map((_, index) => `s${String(index)}`);
  const lines = ["flowchart TB", '  client(["Browser · api-client"])'];
  for (const layer of Object.keys(layers) as PipelineLayer[]) {
    lines.push(`  subgraph ${layer}["${layers[layer]}"]`);
    PIPELINE.forEach((stage, index) => {
      if (stage.layer !== layer) return;
      const label = stage.only
        ? `<b>${stage.name}</b><br/><small>${stage.only}</small>`
        : `<b>${stage.name}</b>`;
      lines.push(
        `    ${ids[index] ?? ""}["${escapeLabel(label)}"]${stage.planned ? ":::planned" : ""}`,
      );
    });
    lines.push("  end");
  }
  const filterIndex = PIPELINE.findIndex((stage) => stage.name === "AllExceptionsFilter");
  const chain = ids.filter((_, index) => index !== filterIndex);
  lines.push(`  client --> ${chain.join(" --> ")}`);
  const filterId = ids[filterIndex] ?? "";
  const handlerId = ids[PIPELINE.findIndex((stage) => stage.name === "Controller → Service")] ?? "";
  lines.push(`  ${handlerId} -. "any stage throws" .-> ${filterId}`);
  lines.push(`  ${filterId} -. "Error JSON" .-> client`);
  lines.push("  classDef planned stroke-dasharray:4 3,opacity:0.6");
  return lines.join("\n");
}

/**
 * Colours for the screen-flow classes, scoped to a wrapper with `data-flow-chart`. Design tokens, so the chart
 * follows light/dark like the rest of the app (Mermaid's own classDef can't take CSS variables).
 */
export const FLOW_CHART_CSS = [
  ["live", "--color-success", "--color-success-foreground", "solid"],
  ["partial", "--color-warning", "--color-warning-foreground", "solid"],
  ["mock", "--color-muted", "--color-foreground", "dashed"],
]
  .map(
    ([name, fill, text, line]) =>
      `[data-flow-chart] .node.${name ?? ""} :is(rect,polygon,path){fill:var(${fill ?? ""})!important;stroke:var(${line === "dashed" ? "--color-muted-foreground" : (fill ?? "")})!important;${line === "dashed" ? "stroke-dasharray:4 3;" : ""}}` +
      `[data-flow-chart] .node.${name ?? ""} :is(.nodeLabel,span,p){color:var(${text ?? ""})!important}`,
  )
  .join("");

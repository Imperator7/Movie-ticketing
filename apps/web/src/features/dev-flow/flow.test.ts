import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  FLOW_CHART_CSS,
  GLOBAL_OPERATIONS,
  PIPELINE,
  SCREENS,
  conformanceByOperation,
  operationsFromSpec,
  parseImplemented,
  pipelineChart,
  screenFlowChart,
  screenStatus,
  screensByOperation,
  stagesFor,
} from "./flow";

const repoRoot = path.join(process.cwd(), "..", "..");
const spec: unknown = parse(readFileSync(path.join(repoRoot, "docs", "openapi.yaml"), "utf-8"));
const operations = operationsFromSpec(spec);
const operationIds = new Set(operations.map((op) => op.operationId));

describe("the hand-written map matches the repo", () => {
  it("every screen and global call names a real contract operation", () => {
    const named = [
      ...SCREENS.flatMap((screen) => screen.operations),
      ...GLOBAL_OPERATIONS.map((global) => global.operationId),
    ];
    expect(named.filter((id) => !operationIds.has(id))).toEqual([]);
  });

  it("every screen is a real route folder under app/[locale]", () => {
    const missing = SCREENS.filter(
      (screen) =>
        !existsSync(path.join(process.cwd(), "src", "app", "[locale]", screen.dir, "page.tsx")),
    );
    expect(missing.map((screen) => screen.id)).toEqual([]);
  });

  it("every screen link points at a known screen", () => {
    const ids = new Set(SCREENS.map((screen) => screen.id));
    const broken = SCREENS.flatMap((screen) => screen.next.filter((link) => !ids.has(link.to)));
    expect(broken).toEqual([]);
  });

  it("the real allowlist parses to contract operations", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps", "api", "src", "contract", "implemented-operations.ts"),
      "utf-8",
    );
    const live = parseImplemented(source);
    expect(live.size).toBeGreaterThan(0);
    expect([...live].filter((id) => !operationIds.has(id))).toEqual([]);
  });
});

describe("operationsFromSpec", () => {
  it("reads method, path, tag, auth and statuses", () => {
    const ops = operationsFromSpec({
      security: [{ bearerAuth: [] }],
      paths: {
        "/a": { get: { operationId: "a", tags: ["T"], security: [], responses: { "200": {} } } },
        "/b": { post: { operationId: "b", responses: { "201": {}, "401": {} } } },
        "/c": { post: { operationId: "c", security: [{ refreshCookie: [] }], responses: {} } },
      },
    });
    expect(ops).toEqual([
      { operationId: "a", method: "GET", path: "/a", tag: "T", auth: "public", statuses: ["200"] },
      {
        operationId: "b",
        method: "POST",
        path: "/b",
        tag: "",
        auth: "bearer",
        statuses: ["201", "401"],
      },
      { operationId: "c", method: "POST", path: "/c", tag: "", auth: "cookie", statuses: [] },
    ]);
  });

  it("finds the cookie endpoints in the real spec", () => {
    const cookie = operations.filter((op) => op.auth === "cookie").map((op) => op.operationId);
    expect(cookie).toEqual(expect.arrayContaining(["refresh", "logout"]));
  });

  it("tolerates an empty document", () => {
    expect(operationsFromSpec(undefined)).toEqual([]);
  });
});

describe("parseImplemented", () => {
  it("reads the array's string literals and ignores comments", () => {
    const source = `export const IMPLEMENTED_OPERATIONS = [\n  // "notMe"\n  "getMovie",\n  "listMovies", // Phase 3\n] as const;\nconst other = ["x"];`;
    expect([...parseImplemented(source)]).toEqual(["getMovie", "listMovies"]);
  });

  it("returns an empty set without the array", () => {
    expect(parseImplemented("export {}").size).toBe(0);
  });
});

describe("statuses", () => {
  it("screenStatus: live, partial, mock", () => {
    const live = new Set(["a", "b"]);
    expect(screenStatus({ operations: ["a", "b"] }, live)).toBe("live");
    expect(screenStatus({ operations: ["a", "z"] }, live)).toBe("partial");
    expect(screenStatus({ operations: ["z"] }, live)).toBe("mock");
  });

  it("conformanceByOperation maps the report, or nothing", () => {
    const map = conformanceByOperation({
      operations: [{ operationId: "getMovie", status: "passed" }],
    });
    expect(map.get("getMovie")).toBe("passed");
    expect(conformanceByOperation(null).size).toBe(0);
  });

  it("screensByOperation includes global calls", () => {
    const usedBy = screensByOperation();
    expect(usedBy.get("getBooking")).toEqual(["Checkout", "Payment result", "Ticket"]);
    expect(usedBy.get("refresh")).toEqual(["Global"]);
  });
});

describe("stagesFor", () => {
  it("public catalog GET: cache interceptor, no auth guards", () => {
    const stages = stagesFor({ auth: "public", method: "GET", tag: "Catalog" });
    expect(stages).toContain("@CacheControl interceptor");
    expect(stages).not.toContain("JwtAuthGuard");
    expect(stages).not.toContain("OriginGuard");
  });

  it("bearer: JWT guard, never the public cache", () => {
    const stages = stagesFor({ auth: "bearer", method: "GET", tag: "Bookings" });
    expect(stages).toContain("JwtAuthGuard");
    expect(stages).not.toContain("@CacheControl interceptor");
  });

  it("cookie: Origin guard, no JWT", () => {
    const stages = stagesFor({ auth: "cookie", method: "POST", tag: "Auth" });
    expect(stages).toContain("OriginGuard");
    expect(stages).not.toContain("JwtAuthGuard");
  });

  it("keeps pipeline order and leaves out planned stages and the error filter", () => {
    const stages = stagesFor({ auth: "bearer", method: "POST", tag: "Bookings" });
    expect(stages.indexOf("AppThrottlerGuard")).toBeLessThan(stages.indexOf("JwtAuthGuard"));
    expect(stages.indexOf("JwtAuthGuard")).toBeLessThan(stages.indexOf("ZodValidationPipe"));
    expect(stages).not.toContain("CloudFront + ALB");
    expect(stages).not.toContain("AllExceptionsFilter");
  });
});

describe("charts", () => {
  it("screen flow has a node per screen with its status class, and every edge", () => {
    const chart = screenFlowChart(new Set(["listMovies"]));
    expect(chart.startsWith("flowchart LR")).toBe(true);
    expect(chart).toContain(":::live"); // home (listMovies only)
    expect(chart).toMatch(/movies\[.*\]:::partial/); // listGenres not in the set
    expect(chart).toContain(":::mock");
    const edges = SCREENS.reduce((sum, screen) => sum + screen.next.length, 0);
    expect(chart.split("\n").filter((line) => line.includes("-->"))).toHaveLength(edges);
  });

  it("pipeline chart chains every stage and routes errors to the filter", () => {
    const chart = pipelineChart();
    for (const stage of PIPELINE) expect(chart).toContain(stage.name);
    expect(chart).toContain("any stage throws");
    expect(chart.match(/-\. "any stage throws" \.->/g)).toHaveLength(1);
    expect(chart).toContain("Error JSON");
    expect(chart).toContain(":::planned");
  });

  it("escapes quotes in labels", () => {
    expect(screenFlowChart(new Set())).not.toMatch(/"[^"\n]*"[^"\n]*"\]/);
  });
});

describe("FLOW_CHART_CSS", () => {
  it("colours every status class with design tokens only", () => {
    for (const name of ["live", "partial", "mock"])
      expect(FLOW_CHART_CSS).toContain(`.node.${name}`);
    expect(FLOW_CHART_CSS).toContain("var(--color-success)");
    expect(FLOW_CHART_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("the chart itself has no CSS variables (Mermaid can't parse them)", () => {
    expect(screenFlowChart(new Set())).not.toContain("var(");
  });
});

import { describe, expect, it } from "vitest";
import fixture from "./fixture-failing.json";
import {
  bangkokTimestamp,
  coverage,
  coverageLine,
  formatDurationMs,
  groupByTag,
  onlyFailures,
  overallTotals,
  parseReport,
  relativeTime,
  testTitle,
  type TestReport,
} from "./report";

const parsed = (value: unknown) => parseReport(JSON.stringify(value));
function ready(): TestReport {
  const result = parsed(fixture);
  if (!result.ok) throw new Error(result.message);
  return result.report;
}

describe("parseReport", () => {
  it("accepts a report in the script's shape (with conformance and failures)", () => {
    const r = ready();
    expect(r.status).toBe("failed");
    expect(r.conformance?.operations).toHaveLength(7);
  });

  it("accepts conformance: null (integration tests did not run)", () => {
    const result = parsed({ ...fixture, conformance: null });
    expect(result.ok && result.report.conformance).toBeNull();
  });

  it("reports invalid JSON clearly", () => {
    const result = parseReport("{ nope");
    expect(result).toMatchObject({ ok: false, kind: "invalid-json" });
  });

  it("guards the schemaVersion (old or future reports)", () => {
    for (const version of [0, 2, "1", undefined]) {
      const result = parsed({ ...fixture, schemaVersion: version });
      expect(result).toMatchObject({ ok: false, kind: "version" });
      expect(result.ok ? "" : result.message).toMatch(/npm run test:report/);
    }
    expect(parseReport("[]")).toMatchObject({ ok: false, kind: "version" });
  });

  it("names the place where the shape is wrong", () => {
    const broken = structuredClone(fixture) as { suites: { totals: unknown }[] };
    broken.suites[0] = { ...broken.suites[0], totals: "many" };
    const result = parsed(broken);
    expect(result).toMatchObject({ ok: false, kind: "shape" });
    expect(result.ok ? "" : result.message).toContain("suites.0.totals");
  });
});

describe("summaries", () => {
  it("overallTotals adds up every suite", () => {
    expect(overallTotals(ready())).toEqual({ total: 5, passed: 4, failed: 1, skipped: 0 });
  });

  it("onlyFailures keeps failing files and tests only", () => {
    const suite = ready().suites[0];
    if (!suite) throw new Error("no suite");
    const failing = onlyFailures(suite);
    expect(failing.files).toHaveLength(1);
    expect(failing.files[0]?.file).toContain("catalog.spec.ts");
    expect(failing.files[0]?.tests.map(testTitle)).toEqual([
      "listMovies › pagination › caps the page size at 50",
    ]);
    // The suite itself is untouched.
    expect(suite.files).toHaveLength(2);
  });

  it("a suite without failures has no files left after onlyFailures", () => {
    const web = ready().suites.find((s) => s.id === "web-unit");
    expect(web && onlyFailures(web).files).toEqual([]);
  });

  it("groupByTag keeps the spec order and counts implemented and failing operations", () => {
    const conformance = ready().conformance;
    if (!conformance) throw new Error("no conformance");
    const groups = groupByTag(conformance);
    expect(groups.map((g) => g.tag)).toEqual(["Health", "Catalog", "Bookings", "Payments"]);
    const catalog = groups.find((g) => g.tag === "Catalog");
    expect(catalog).toMatchObject({ implemented: 3, failed: 1 });
    expect(catalog?.operations).toHaveLength(3);
    expect(groups.find((g) => g.tag === "Bookings")).toMatchObject({ implemented: 0, failed: 0 });
  });

  it("coverage and coverageLine", () => {
    const conformance = ready().conformance;
    if (!conformance) throw new Error("no conformance");
    expect(coverage(conformance)).toEqual({
      implemented: 4,
      operations: 7,
      checks: 5,
      passedChecks: 4,
      failedChecks: 1,
    });
    expect(coverageLine(conformance)).toBe("4 of 7 operations implemented · 5 checks · 1 failing");
    const green = {
      ...conformance,
      operations: conformance.operations.map((op) => ({
        ...op,
        status: op.implemented ? ("passed" as const) : op.status,
        checks: op.checks.map((c) => ({ ...c, status: "passed" as const, errors: [] })),
      })),
    };
    expect(coverageLine(green)).toBe("4 of 7 operations implemented · 5 checks · all passing");
    expect(coverageLine({ ...green, operations: green.operations.slice(0, 1) })).toBe(
      "1 of 1 operations implemented · 1 check · all passing",
    );
  });
});

describe("formatting", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");

  it("relativeTime", () => {
    expect(relativeTime("2026-10-28T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-28T11:59:00Z", now)).toBe("1 minute ago");
    expect(relativeTime("2026-10-28T11:30:00Z", now)).toBe("30 minutes ago");
    expect(relativeTime("2026-10-28T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-10-25T12:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("garbage", now)).toBe("unknown time");
  });

  it("bangkokTimestamp is Bangkok time (UTC+7)", () => {
    expect(bangkokTimestamp("2026-10-28T09:02:49.034Z")).toBe("28 Oct 2026, 16:02:49");
  });

  it("formatDurationMs", () => {
    expect(formatDurationMs(null)).toBe("–");
    expect(formatDurationMs(12)).toBe("12 ms");
    expect(formatDurationMs(4967)).toBe("5.0 s");
    expect(formatDurationMs(125_000)).toBe("2 m 5 s");
  });
});

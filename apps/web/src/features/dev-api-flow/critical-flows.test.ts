import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRITICAL_FLOWS } from "./critical-flows";
import { Repo } from "./load-api-flow";
import { loadCriticalFlows, resolveSpan, resolveTest } from "./load-critical-flows";

const root = path.join(process.cwd(), "..", "..");
const data = loadCriticalFlows(root);

describe("the /critical-flows page points at real code", () => {
  it("every code span, DB span and test title still matches the files", () => {
    expect(data.missing).toEqual([]);
  });

  it("every span is a readable size (≤ 80 lines)", () => {
    const tooLong = data.flows.flatMap((flow) =>
      flow.checkpoints.flatMap((checkpoint) =>
        [...checkpoint.code, ...checkpoint.db]
          .filter((ref) => ref !== null && ref.endLine - ref.line + 1 > 80)
          .map((ref) => `${flow.id}: ${ref?.file ?? ""}:${String(ref?.line ?? 0)}`),
      ),
    );
    expect(tooLong).toEqual([]);
  });

  it("every flow has checkpoints, and every checkpoint shows code", () => {
    for (const flow of CRITICAL_FLOWS) {
      expect(flow.checkpoints.length).toBeGreaterThan(0);
      for (const checkpoint of flow.checkpoints) expect(checkpoint.code.length).toBeGreaterThan(0);
    }
  });

  it("notes and gaps explain themselves", () => {
    const silent = CRITICAL_FLOWS.flatMap((flow) => flow.checkpoints).filter(
      (checkpoint) => checkpoint.verdict !== "matches" && !checkpoint.finding,
    );
    expect(silent).toEqual([]);
  });
});

describe("span resolution", () => {
  const repo = new Repo(root);
  const file = "apps/api/src/booking/booking-support.ts";

  it("a from/to span covers the lines from `from` to the end of `to`", () => {
    const ref = resolveSpan(repo, {
      file,
      from: "export function shouldExpireBooking(",
      to: 'return gatewayOutcome !== "in_progress" || holdOver;',
    });
    expect(ref?.code.startsWith("export function shouldExpireBooking(")).toBe(true);
    expect(ref?.code.trimEnd().endsWith("holdOver;")).toBe(true);
  });

  it("a span without `to` is the single line, starting at its indentation", () => {
    const ref = resolveSpan(repo, { file, from: "const holdOver =" });
    expect(ref?.line).toBe(ref?.endLine);
    expect(ref?.code.trim().startsWith("const holdOver =")).toBe(true);
  });

  it("unknown anchors and test titles resolve to null", () => {
    expect(resolveSpan(repo, { file, from: "no such text anywhere" })).toBeNull();
    expect(resolveSpan(repo, { file, def: "noSuchFunction" })).toBeNull();
    expect(
      resolveTest(repo, {
        file: "apps/api/test/booking.int-spec.ts",
        name: "a title no test has: 7f3c",
      }).line,
    ).toBeNull();
  });
});

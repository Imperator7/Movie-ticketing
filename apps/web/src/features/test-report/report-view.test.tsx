import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "./fixture-failing.json";
import { loadReport, type ReportState } from "./load-report";
import { parseReport } from "./report";
import { TestReportView } from "./report-view";

const NOW = Date.parse("2026-10-28T09:12:00Z");

function readyState(patch: Record<string, unknown> = {}): ReportState {
  const result = parseReport(JSON.stringify({ ...fixture, ...patch }));
  if (!result.ok) throw new Error(result.message);
  return { kind: "ready", report: result.report, now: NOW };
}

describe("TestReportView empty states", () => {
  it("missing report: explains how to generate it, with the full and the quick command", () => {
    render(<TestReportView state={{ kind: "missing", path: "/repo/reports/test-report.json" }} />);
    expect(screen.getByRole("heading", { name: "No report yet" })).toBeInTheDocument();
    expect(screen.getByText("/repo/reports/test-report.json")).toBeInTheDocument();
    expect(screen.getByText("npm run test:report")).toBeInTheDocument();
    expect(screen.getByText("npm run test:report -- --quick")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Copy / })).toHaveLength(2);
  });

  it("malformed or old report: a clear error, not a crash", () => {
    render(
      <TestReportView
        state={{
          kind: "error",
          message: "The report has schemaVersion 0, this page understands 1.",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The report could not be shown");
    expect(screen.getByRole("alert")).toHaveTextContent("schemaVersion 0");
  });
});

describe("loadReport (fs)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "report-"));

  it("missing file", () => {
    expect(loadReport(path.join(dir, "nope.json")).kind).toBe("missing");
  });

  it("garbage and old schema versions become an error state", () => {
    const garbage = path.join(dir, "garbage.json");
    writeFileSync(garbage, "not json");
    expect(loadReport(garbage).kind).toBe("error");
    const old = path.join(dir, "old.json");
    writeFileSync(old, JSON.stringify({ schemaVersion: 0 }));
    expect(loadReport(old)).toMatchObject({ kind: "error" });
  });

  it("a valid report", () => {
    const good = path.join(dir, "good.json");
    writeFileSync(good, JSON.stringify(fixture));
    expect(loadReport(good, NOW)).toMatchObject({ kind: "ready", now: NOW });
  });
});

describe("TestReportView with a failing report", () => {
  it("header: failed badge, time, git, refresh command", () => {
    render(<TestReportView state={readyState()} />);
    expect(screen.getByRole("heading", { name: "Test report" })).toBeInTheDocument();
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        (_, el) => el?.tagName === "P" && el.textContent.includes("Generated 9 minutes ago"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("28 Oct 2026, 16:02:49 (Bangkok)")).toBeInTheDocument();
    expect(screen.getByText("@ 7594352")).toBeInTheDocument();
    expect(screen.getByText("uncommitted changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy npm run test:report" })).toBeInTheDocument();
    expect(screen.queryByText("Quick report")).not.toBeInTheDocument();
  });

  it("quick mode shows the notice", () => {
    render(<TestReportView state={readyState({ quick: true })} />);
    expect(screen.getByText("Quick report")).toBeInTheDocument();
    expect(screen.getByText(/Integration tests and DB checks were skipped/)).toBeInTheDocument();
  });

  it("suite cards show counts, duration and the command", () => {
    render(<TestReportView state={readyState()} />);
    const card = screen.getByRole("heading", { name: "Web unit", level: 3 }).closest("li");
    if (!card) throw new Error("no card");
    expect(within(card).getByText("2 passed")).toBeInTheDocument();
    expect(within(card).getByText("npm run test -w web")).toBeInTheDocument();
    expect(within(card).getByText("12.0 s")).toBeInTheDocument();
  });

  it("failed tests are expanded with the failure message in a monospace block", () => {
    render(<TestReportView state={readyState()} />);
    const message = screen.getByText(/expected 51 to be less than or equal to 50/);
    expect(message.tagName).toBe("PRE");
    expect(message).toHaveClass("font-mono");
    expect(message.closest("details")).toHaveAttribute("open");
    // A passing file stays collapsed.
    const passing = screen.getByText("apps/api/prisma/seed/layout.spec.ts").closest("details");
    expect(passing).not.toHaveAttribute("open");
  });

  it("a crashed suite shows its output tail", () => {
    render(<TestReportView state={readyState()} />);
    expect(screen.getByText(/Connection refused/).tagName).toBe("PRE");
  });

  it("conformance: coverage line, tag groups, expanded failing operation with its errors", () => {
    render(<TestReportView state={readyState()} />);
    expect(
      screen.getByText("4 of 7 operations implemented · 5 checks · 1 failing"),
    ).toBeInTheDocument();
    for (const tag of ["Health", "Catalog", "Bookings", "Payments"]) {
      expect(
        screen.getByRole("heading", { name: new RegExp(`^${tag}`), level: 3 }),
      ).toBeInTheDocument();
    }
    const failing = screen.getByText("listMovies").closest("details");
    expect(failing).toHaveAttribute("open");
    expect(
      within(failing as HTMLElement).getByText("status: expected 422, got 200"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("not yet")).toHaveLength(3);
    expect(screen.getAllByText("POST").length).toBe(3);
  });

  it("conformance: null shows an empty state that explains why", () => {
    render(<TestReportView state={readyState({ conformance: null, quick: true })} />);
    expect(screen.getByText("No conformance data in this report.")).toBeInTheDocument();
    expect(screen.getByText(/did not run \(quick mode\)/)).toBeInTheDocument();
  });

  it("'Show only failures' toggles the attribute that hides passing rows", async () => {
    const { container } = render(<TestReportView state={readyState()} />);
    const wrapper = container.querySelector("[data-only-failures]");
    expect(wrapper).toHaveAttribute("data-only-failures", "false");
    // Passing rows carry the hide class, failing ones do not.
    const passingTest = screen.getByText("formatBaht › formats whole baht").closest("li");
    const failingTest = screen.getByText(/caps the page size at 50/).closest("li");
    expect(passingTest?.className).toContain("group-data-[only-failures=true]/report:hidden");
    expect(failingTest?.className).not.toContain("hidden");

    await userEvent.click(screen.getByRole("checkbox", { name: "Show only failures" }));
    expect(wrapper).toHaveAttribute("data-only-failures", "true");
  });
});

describe("TestReportView with a passing report", () => {
  it("shows a passed badge and no failure blocks", () => {
    const passing = {
      status: "passed",
      suites: fixture.suites.filter((s) => s.id === "web-unit").map((s) => ({ ...s })),
      conformance: null,
    };
    render(<TestReportView state={readyState(passing)} />);
    expect(screen.getAllByText("passed").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("pre")).toHaveLength(0);
  });
});

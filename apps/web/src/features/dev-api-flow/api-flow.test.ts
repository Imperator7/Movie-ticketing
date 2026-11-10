import path from "node:path";
import { describe, expect, it } from "vitest";
import { JOURNEYS, journeyChart } from "./journeys";
import { loadApiFlow, type CallNode } from "./load-api-flow";

const data = loadApiFlow(path.join(process.cwd(), "..", ".."));

const names = (node: CallNode | null): string[] =>
  node ? [node.ref.name, ...node.children.flatMap(names)] : [];

describe("the /api-flow page follows the real code", () => {
  it("every journey step points at code that exists", () => {
    expect(data.missing).toEqual([]);
  });

  it("every live operation resolves to a controller method that calls a service", () => {
    const broken = data.operations
      .filter((op) => op.live && (!op.tree || op.tree.children.length === 0))
      .map((op) => op.operation.operationId);
    expect(broken).toEqual([]);
  });

  it("traces createBooking down to the transaction and its tables", () => {
    const op = data.operations.find((o) => o.operation.operationId === "createBooking");
    expect(names(op?.tree ?? null)).toEqual(
      expect.arrayContaining([
        "BookingController.createBooking",
        "BookingService.create",
        "BookingService.createInTransaction",
      ]),
    );
    expect(op?.tables.map((t) => t.table)).toEqual(
      expect.arrayContaining(["bookings", "booking_seats", "booking_events"]),
    );
  });

  it("shows the Stripe and fake adapters under the payment port", () => {
    const op = data.operations.find((o) => o.operation.operationId === "createPaymentIntent");
    const all = names(op?.tree ?? null);
    expect(all).toEqual(
      expect.arrayContaining([
        "PaymentProvider.createIntent",
        "StripePaymentProvider.createIntent",
        "FakePaymentProvider.createIntent",
      ]),
    );
    expect(all).not.toContain("AppException");
  });

  it("finds the web code that calls an operation", () => {
    const op = data.operations.find((o) => o.operation.operationId === "getSeatMap");
    expect(op?.web.map((w) => w.ref.file)).toContain(
      "apps/web/src/features/showtimes/showtime-view.tsx",
    );
  });

  it("draws every journey as a sequence diagram", () => {
    for (const journey of JOURNEYS) {
      const chart = journeyChart(journey);
      expect(chart.startsWith("sequenceDiagram")).toBe(true);
      expect(chart.split("\n").filter((line) => line.includes("->>"))).toHaveLength(
        journey.steps.length,
      );
    }
  });
});

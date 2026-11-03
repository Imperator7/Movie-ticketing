import { describe, expect, it } from "vitest";
import { shouldExpireBooking } from "./booking-support.js";
import { combineCancelOutcomes } from "./payment-gateway.js";

describe("shouldExpireBooking (expiry job)", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  const holdLater = new Date(now.getTime() + 60_000);
  const holdOver = new Date(now.getTime() - 1);

  it("cancels when nothing is in flight", () => {
    expect(shouldExpireBooking("cancelled", holdLater, now)).toBe(true);
    expect(shouldExpireBooking("nothing_to_cancel", holdLater, now)).toBe(true);
  });

  it("waits for the webhook while a payment is in flight and the hold is not over", () => {
    expect(shouldExpireBooking("in_progress", holdLater, now)).toBe(false);
  });

  it("cancels anyway once the hold is over (a late success is refunded)", () => {
    expect(shouldExpireBooking("in_progress", holdOver, now)).toBe(true);
    expect(shouldExpireBooking("in_progress", now, now)).toBe(true);
  });
});

describe("combineCancelOutcomes", () => {
  it("nothing cancelled when there is nothing", () => {
    expect(combineCancelOutcomes([])).toBe("nothing_to_cancel");
    expect(combineCancelOutcomes(["nothing_to_cancel", "nothing_to_cancel"])).toBe(
      "nothing_to_cancel",
    );
  });

  it("cancelled when at least one was", () => {
    expect(combineCancelOutcomes(["nothing_to_cancel", "cancelled"])).toBe("cancelled");
  });

  it("in progress wins over everything, in any order", () => {
    expect(combineCancelOutcomes(["cancelled", "in_progress"])).toBe("in_progress");
    expect(combineCancelOutcomes(["in_progress", "cancelled"])).toBe("in_progress");
  });
});

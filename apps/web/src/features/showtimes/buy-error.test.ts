import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import type { ErrorCode } from "@/api/generated/model";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { buyErrorAction } from "./buy-error";

const error = (code: ErrorCode, details?: Record<string, unknown>, status = 409) =>
  new ApiError({ status, code, message: code, details });

describe("buyErrorAction (POST /bookings errors)", () => {
  it("SEAT_TAKEN: the seats from details.seatIds", () => {
    expect(buyErrorAction(error("SEAT_TAKEN", { seatIds: ["a", "b"] }))).toEqual({
      type: "seat-taken",
      seatIds: ["a", "b"],
    });
  });

  it("SEAT_TAKEN without usable details still rolls back (no ids)", () => {
    expect(buyErrorAction(error("SEAT_TAKEN"))).toEqual({ type: "seat-taken", seatIds: [] });
    expect(buyErrorAction(error("SEAT_TAKEN", { seatIds: [1, "a", null] }))).toEqual({
      type: "seat-taken",
      seatIds: ["a"],
    });
  });

  it("ACTIVE_BOOKING_EXISTS: go to details.bookingId", () => {
    expect(buyErrorAction(error("ACTIVE_BOOKING_EXISTS", { bookingId: "b-1" }))).toEqual({
      type: "go-to-booking",
      bookingId: "b-1",
    });
    expect(buyErrorAction(error("ACTIVE_BOOKING_EXISTS", { bookingId: 5 }))).toEqual({
      type: "toast",
    });
  });

  it.each([
    ["BOOKING_CLOSED", 422],
    ["TOO_MANY_SEATS", 422],
    ["BOOKING_NOT_PENDING", 409],
    ["IDEMPOTENCY_KEY_MISSING", 422],
    ["IDEMPOTENCY_KEY_REUSED", 422],
    ["SHOWTIME_NOT_FOUND", 404],
    ["UNAUTHORIZED", 401],
  ] as const)("%s is a toast with its translation (TH and EN)", (code, status) => {
    expect(buyErrorAction(error(code, undefined, status))).toEqual({ type: "toast" });
    expect(en.errors[code]).toBeTruthy();
    expect(th.errors[code]).toMatch(/[฀-๿]/);
  });

  it("a network error is a toast too", () => {
    expect(buyErrorAction(new TypeError("Failed to fetch"))).toEqual({ type: "toast" });
  });
});

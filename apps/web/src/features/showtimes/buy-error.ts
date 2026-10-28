import { ApiError } from "@/lib/api-client";

/** What the seat screen does with a failed `createBooking` (docs/openapi.yaml, POST /bookings). */
export type BuyErrorAction =
  /** 409 SEAT_TAKEN: roll back, show these seats as taken, apologise. */
  | { type: "seat-taken"; seatIds: string[] }
  /** 409 ACTIVE_BOOKING_EXISTS: continue with the booking we already have. */
  | { type: "go-to-booking"; bookingId: string }
  /** Anything else (BOOKING_CLOSED, TOO_MANY_SEATS, IDEMPOTENCY_KEY_*, 401, network ...): a toast of `t("errors.<CODE>")`. */
  | { type: "toast" };

export function buyErrorAction(error: unknown): BuyErrorAction {
  if (!(error instanceof ApiError)) return { type: "toast" };
  if (error.code === "SEAT_TAKEN") {
    const ids = error.details?.seatIds;
    const seatIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
    return { type: "seat-taken", seatIds };
  }
  if (error.code === "ACTIVE_BOOKING_EXISTS") {
    const bookingId = error.details?.bookingId;
    if (typeof bookingId === "string") return { type: "go-to-booking", bookingId };
  }
  return { type: "toast" };
}

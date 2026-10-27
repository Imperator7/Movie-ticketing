import { useIsMutating } from "@tanstack/react-query";
import type { getSeatMap } from "@/api/generated/endpoints/showtimes/showtimes";
import type { Booking, SeatStatus } from "@/api/generated/model";
import { SEAT_POLL_MS } from "./use-taken-seats";

/**
 * Helpers for the optimistic seat map. The database stays the source of truth for locks (docs/
 * database-design.md §2): everything here is a preview that is reconciled with the server
 * (invalidate on settle) and rolled back from a snapshot on error.
 */

export type SeatMapResponse = Awaited<ReturnType<typeof getSeatMap>>;

/** Mutations that change seats share this key prefix, so seat-map polling pauses while any runs. */
export const SEAT_MUTATION_PREFIX = ["seat-map-mutation"] as const;
export const seatMutationKey = (scope: string) => [...SEAT_MUTATION_PREFIX, scope] as const;

/** A copy of the cached seat map response with the given seats set to `status`. */
export function withSeatStatus(
  response: SeatMapResponse | undefined,
  seatIds: readonly string[],
  status: SeatStatus,
): SeatMapResponse | undefined {
  if (response?.status !== 200) return response;
  const ids = new Set(seatIds);
  return {
    ...response,
    data: {
      ...response.data,
      seats: response.data.seats.map((seat) => (ids.has(seat.id) ? { ...seat, status } : seat)),
    },
  };
}

/** A 200-shaped response wrapper, as the generated `getBooking` / `getActiveBooking` queries cache them. */
export function okResponse(booking: Booking, headers: Headers = new Headers()) {
  return { data: booking, status: 200 as const, headers };
}

/** What `getActiveBooking` caches when there is none (204). */
export function noActiveBookingResponse(headers: Headers = new Headers()) {
  return { data: undefined, status: 204 as const, headers };
}

/** Polling interval for the seat map: paused while a seat-changing mutation is in flight. */
export function useSeatMapRefetchInterval(): number | false {
  const busy = useIsMutating({ mutationKey: SEAT_MUTATION_PREFIX }) > 0;
  return busy ? false : SEAT_POLL_MS;
}

/** Selected seats that are not ours already (pending or held by our active booking). */
export function withoutOwnSeats(
  selectedLabels: readonly string[],
  ownLabels: readonly string[],
): string[] {
  return selectedLabels.filter((label) => !ownLabels.includes(label));
}

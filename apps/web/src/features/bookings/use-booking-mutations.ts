import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  cancelBooking,
  createBooking,
  getGetActiveBookingQueryKey,
  getGetBookingQueryKey,
} from "@/api/generated/endpoints/bookings/bookings";
import { getGetSeatMapQueryKey } from "@/api/generated/endpoints/showtimes/showtimes";
import type { Booking } from "@/api/generated/model";
import { dataOf } from "@/api/unwrap";
import { ApiError } from "@/lib/api-client";
import {
  noActiveBookingResponse,
  okResponse,
  seatMutationKey,
  withSeatStatus,
  type SeatMapResponse,
} from "@/features/showtimes/seat-cache";

type ActiveResponse = ReturnType<typeof okResponse> | ReturnType<typeof noActiveBookingResponse>;

export interface BuyVariables {
  seatIds: string[];
  /** One per Buy click (docs/database-design.md §16). */
  idempotencyKey: string;
}

interface BuyContext {
  previousSeatMap: SeatMapResponse | undefined;
}

/**
 * Buy with an optimistic preview. The seat map is the preview, never the truth:
 * - onMutate: stop in-flight/polled seat-map fetches, snapshot, show our seats as HELD;
 * - success: prime the booking caches (so /checkout renders with no request), then reconcile;
 * - error: restore the snapshot; for `SEAT_TAKEN` also show the taken seats as taken.
 * Payments are never optimistic.
 */
export function useCreateBookingOptimistic(showtimeId: string) {
  const queryClient = useQueryClient();
  const seatMapKey = getGetSeatMapQueryKey(showtimeId);

  return useMutation<Awaited<ReturnType<typeof createBooking>>, unknown, BuyVariables, BuyContext>({
    mutationKey: seatMutationKey(showtimeId),
    mutationFn: ({ seatIds, idempotencyKey }) =>
      createBooking({ showtimeId, seatIds }, { headers: { "Idempotency-Key": idempotencyKey } }),

    onMutate: async ({ seatIds }) => {
      await queryClient.cancelQueries({ queryKey: seatMapKey });
      const previousSeatMap = queryClient.getQueryData<SeatMapResponse>(seatMapKey);
      queryClient.setQueryData<SeatMapResponse | undefined>(
        seatMapKey,
        withSeatStatus(previousSeatMap, seatIds, "HELD"),
      );
      return { previousSeatMap };
    },

    onSuccess: (response) => {
      const booking = dataOf(response);
      if (!booking) return;
      // Prime the cache so the checkout screen has its data before it mounts.
      queryClient.setQueryData(
        getGetBookingQueryKey(booking.id),
        okResponse(booking, response.headers),
      );
      queryClient.setQueryData(
        getGetActiveBookingQueryKey(),
        okResponse(booking, response.headers),
      );
    },

    onError: (error, _variables, context) => {
      queryClient.setQueryData(seatMapKey, context?.previousSeatMap);
      if (error instanceof ApiError && error.code === "SEAT_TAKEN") {
        const taken = Array.isArray(error.details?.seatIds)
          ? error.details.seatIds.filter((id): id is string => typeof id === "string")
          : [];
        queryClient.setQueryData<SeatMapResponse | undefined>(seatMapKey, (current) =>
          withSeatStatus(current, taken, "BOOKED"),
        );
      }
    },

    // Reconcile in the background: the mutation (and the navigation after it) must not wait for the refetch.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: seatMapKey });
    },
  });
}

interface CancelContext {
  previousActive: ActiveResponse | undefined;
  previousSeatMap: SeatMapResponse | undefined;
}

/** What the cancel hooks need to know about the booking being cancelled. */
export type CancellableBooking = Pick<Booking, "id" | "seats"> & {
  showtime: Pick<Booking["showtime"], "id">;
};

/**
 * Cancel with an optimistic preview: the banner disappears and the booking's seats go back to
 * AVAILABLE in the seat map at once. Any error (`PAYMENT_IN_PROGRESS`, `BOOKING_NOT_PENDING`, network)
 * restores both; settling always reconciles with the server.
 */
export function useCancelBookingOptimistic() {
  const queryClient = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof cancelBooking>>,
    unknown,
    CancellableBooking,
    CancelContext
  >({
    mutationKey: seatMutationKey("cancel"),
    mutationFn: (booking) => cancelBooking(booking.id),

    onMutate: async (booking) => {
      const seatMapKey = getGetSeatMapQueryKey(booking.showtime.id);
      const activeKey = getGetActiveBookingQueryKey();
      await Promise.all([
        queryClient.cancelQueries({ queryKey: seatMapKey }),
        queryClient.cancelQueries({ queryKey: activeKey }),
      ]);
      const previousActive = queryClient.getQueryData<ActiveResponse>(activeKey);
      const previousSeatMap = queryClient.getQueryData<SeatMapResponse>(seatMapKey);
      queryClient.setQueryData<ActiveResponse>(activeKey, noActiveBookingResponse());
      queryClient.setQueryData<SeatMapResponse | undefined>(
        seatMapKey,
        withSeatStatus(
          previousSeatMap,
          booking.seats.map((s) => s.seatId),
          "AVAILABLE",
        ),
      );
      return { previousActive, previousSeatMap };
    },

    onError: (_error, booking, context) => {
      queryClient.setQueryData(getGetActiveBookingQueryKey(), context?.previousActive);
      queryClient.setQueryData(
        getGetSeatMapQueryKey(booking.showtime.id),
        context?.previousSeatMap,
      );
    },

    onSettled: (_data, _error, booking) => {
      void settleCancel(queryClient, booking);
    },
  });
}

function settleCancel(queryClient: QueryClient, booking: CancellableBooking) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetActiveBookingQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(booking.id) }),
    queryClient.invalidateQueries({ queryKey: getGetSeatMapQueryKey(booking.showtime.id) }),
  ]);
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGetActiveBookingQueryKey,
  getGetBookingQueryKey,
  useGetBooking,
} from "@/api/generated/endpoints/bookings/bookings";
import { getGetSeatMapQueryKey, getSeatMap } from "@/api/generated/endpoints/showtimes/showtimes";
import type { Booking, SeatMap, SeatStatus } from "@/api/generated/model";
import {
  noActiveBookingResponse,
  okResponse,
  useSeatMapRefetchInterval,
  withoutOwnSeats,
  withSeatStatus,
  type SeatMapResponse,
} from "@/features/showtimes/seat-cache";
import { SeatMap as SeatMapView } from "@/components/cinema/seat-map";
import { SEAT_POLL_MS, useTakenSeatDetector } from "@/features/showtimes/use-taken-seats";
import { useCancelBookingOptimistic, useCreateBookingOptimistic } from "./use-booking-mutations";

const ST = "5e000000-0000-4000-8000-000000000000";
const API = "http://localhost/api/v1";

const seatMap = (statuses: Record<string, SeatStatus>): SeatMap => ({
  showtimeId: ST,
  totalRows: 1,
  totalCols: 4,
  prices: [{ seatType: "STANDARD", priceBaht: 220 }],
  generatedAt: "2026-10-28T10:00:00Z",
  seats: Object.entries(statuses).map(([label, status], i) => ({
    id: `id-${label}`,
    label,
    row: "A",
    number: i + 1,
    gridRow: 0,
    gridCol: i,
    type: "STANDARD" as const,
    status,
  })),
});

const seatMapResponse = (statuses: Record<string, SeatStatus>): SeatMapResponse => ({
  data: seatMap(statuses),
  status: 200,
  headers: new Headers(),
});

const booking: Booking = {
  id: "booking-1",
  bookingCode: "MT-AAAAAA",
  status: "PENDING_PAYMENT",
  cancelReason: null,
  showtime: {
    id: ST,
    startsAt: "2026-10-28T19:30:00+07:00",
    format: "TWO_D",
    hallNumber: 1,
    movie: {
      slug: "m",
      title: { th: "ก", en: "M" },
      posterUrl: null,
      rating: "GENERAL",
      durationMin: 100,
    },
    cinema: {
      id: "c",
      name: { th: "ก", en: "Cinema" },
      address: { th: "ก", en: "x" },
      city: "Bangkok",
    },
  },
  seats: [
    { seatId: "id-A1", label: "A1", type: "STANDARD", priceBaht: 220 },
    { seatId: "id-A2", label: "A2", type: "STANDARD", priceBaht: 220 },
  ],
  totalBaht: 440,
  currency: "THB",
  paymentExpiresAt: "2026-10-28T10:05:00Z",
  holdExpiresAt: "2026-10-28T10:06:00Z",
  createdAt: "2026-10-28T10:00:00Z",
  ticketQr: null,
};

const error = (status: number, code: string, details?: Record<string, unknown>) =>
  HttpResponse.json({ statusCode: status, code, message: code, details }, { status });

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const cachedSeats = () =>
  client.getQueryData<SeatMapResponse>(getGetSeatMapQueryKey(ST)) as {
    data: SeatMap;
  };
const statusOf = (label: string) => cachedSeats().data.seats.find((s) => s.label === label)?.status;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
  client.setQueryData(
    getGetSeatMapQueryKey(ST),
    seatMapResponse({ A1: "AVAILABLE", A2: "AVAILABLE", A3: "AVAILABLE" }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const buyVars = { seatIds: ["id-A1", "id-A2"], idempotencyKey: "key-1" };

describe("useCreateBookingOptimistic", () => {
  it("shows the selected seats as held at once and pauses polling while the request is in flight", async () => {
    const gate = deferred();
    server.use(
      http.post("*/bookings", async () => {
        await gate.promise;
        return HttpResponse.json(booking, { status: 201 });
      }),
    );
    const { result } = renderHook(
      () => ({ buy: useCreateBookingOptimistic(ST), interval: useSeatMapRefetchInterval() }),
      { wrapper },
    );
    expect(result.current.interval).toBe(SEAT_POLL_MS);

    act(() => {
      result.current.buy.mutate(buyVars);
    });
    await waitFor(() => {
      expect(result.current.buy.isPending).toBe(true);
    });
    // Preview applied, polling paused.
    await waitFor(() => {
      expect(statusOf("A1")).toBe("HELD");
    });
    expect(statusOf("A2")).toBe("HELD");
    expect(statusOf("A3")).toBe("AVAILABLE");
    expect(result.current.interval).toBe(false);

    gate.resolve();
    await waitFor(() => {
      expect(result.current.buy.isSuccess).toBe(true);
    });
    expect(result.current.interval).toBe(SEAT_POLL_MS);
  });

  it("cancels an in-flight seat map fetch so a poll cannot overwrite the preview", async () => {
    const poll = deferred();
    server.use(
      http.get("*/showtimes/:id/seats", async () => {
        await poll.promise;
        return HttpResponse.json(seatMap({ A1: "AVAILABLE", A2: "AVAILABLE", A3: "AVAILABLE" }));
      }),
      http.post("*/bookings", async () => {
        await delay(20);
        return HttpResponse.json(booking, { status: 201 });
      }),
    );
    const key = getGetSeatMapQueryKey(ST);
    void client
      .query({
        queryKey: key,
        queryFn: ({ signal }) => getSeatMap(ST, { signal }),
        staleTime: 0,
      })
      .catch(() => undefined);
    await waitFor(() => {
      expect(client.isFetching({ queryKey: key })).toBe(1);
    });

    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate(buyVars);
    });
    await waitFor(() => {
      expect(client.isFetching({ queryKey: key })).toBe(0);
    });
    expect(statusOf("A1")).toBe("HELD");
    poll.resolve();
  });

  it("rolls back and applies details.seatIds as taken on SEAT_TAKEN", async () => {
    server.use(http.post("*/bookings", () => error(409, "SEAT_TAKEN", { seatIds: ["id-A2"] })));
    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate(buyVars);
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(statusOf("A1")).toBe("AVAILABLE"); // rolled back
    expect(statusOf("A2")).toBe("BOOKED"); // taken by someone else, shown immediately
    expect(statusOf("A3")).toBe("AVAILABLE");
  });

  it("marks the taken seat as occupied (person icon) in the same tick as the rollback", async () => {
    server.use(http.post("*/bookings", () => error(409, "SEAT_TAKEN", { seatIds: ["id-A2"] })));
    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate(buyVars);
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    // What the seat map component would render from the cache right now (no refetch needed).
    const seats = cachedSeats().data.seats.map((s) => ({
      id: s.id,
      row: s.row,
      number: s.number,
      type: s.type,
      status: s.status,
      priceBaht: 220,
      gridRow: s.gridRow,
      gridCol: s.gridCol,
    }));
    const { container } = render(
      <SeatMapView
        seats={seats}
        selectedIds={["id-A1"]}
        justTakenIds={["id-A2"]}
        onSelectionChange={() => undefined}
      />,
    );
    const taken = container.querySelector('[data-seat-id="id-A2"]');
    expect(taken?.querySelector('svg[data-icon="person"]')).not.toBeNull();
    expect(taken?.className).toContain("animate-seat-taken");
    expect(container.querySelector('[data-seat-id="id-A1"] svg[data-icon="person"]')).toBeNull();
  });

  it("restores the snapshot on any other error (ACTIVE_BOOKING_EXISTS)", async () => {
    server.use(
      http.post("*/bookings", () => error(409, "ACTIVE_BOOKING_EXISTS", { bookingId: "other" })),
    );
    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate(buyVars);
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(statusOf("A1")).toBe("AVAILABLE");
    expect(statusOf("A2")).toBe("AVAILABLE");
  });

  it("primes the booking caches so checkout renders with no request", async () => {
    let bookingRequests = 0;
    server.use(
      http.post("*/bookings", () => HttpResponse.json(booking, { status: 201 })),
      http.get("*/bookings/:id", () => {
        bookingRequests += 1;
        return HttpResponse.json(booking);
      }),
    );
    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate(buyVars);
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const active = client.getQueryData<{ status: number; data: Booking }>(
      getGetActiveBookingQueryKey(),
    );
    expect(active?.status).toBe(200);
    expect(active?.data.id).toBe("booking-1");

    // "/checkout" mounts: the booking is there on the first render and nothing is fetched.
    const checkout = renderHook(() => useGetBooking("booking-1"), { wrapper });
    expect(checkout.result.current.isPending).toBe(false);
    expect(checkout.result.current.data?.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bookingRequests).toBe(0);
    expect(client.getQueryData(getGetBookingQueryKey("booking-1"))).toBeDefined();
  });
});

describe("Idempotency-Key and retries", () => {
  const keysSeen: (string | null)[] = [];
  const record = () =>
    http.post("*/bookings", ({ request }) => {
      keysSeen.push(request.headers.get("Idempotency-Key"));
      return HttpResponse.json(booking, { status: 201 });
    });

  beforeEach(() => {
    keysSeen.length = 0;
  });

  it("sends the click's key, and a different click sends a different key", async () => {
    server.use(record());
    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate({ ...buyVars, idempotencyKey: "click-1" });
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    act(() => {
      result.current.mutate({ ...buyVars, idempotencyKey: "click-2" });
    });
    await waitFor(() => {
      expect(keysSeen).toEqual(["click-1", "click-2"]);
    });
  });

  it("retries a network failure of the same click with the SAME key", async () => {
    let attempts = 0;
    server.use(
      http.post("*/bookings", ({ request }) => {
        keysSeen.push(request.headers.get("Idempotency-Key"));
        attempts += 1;
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json(booking, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      result.current.mutate({ ...buyVars, idempotencyKey: "same-click" });
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(keysSeen).toEqual(["same-click", "same-click"]);
    // The preview stayed in place during the retry and the booking is primed.
    expect(statusOf("A1")).toBe("HELD");
  });

  it("retries a 5xx but never a 4xx answer", async () => {
    let calls = 0;
    server.use(
      http.post("*/bookings", () => {
        calls += 1;
        return error(503, "INTERNAL_ERROR", undefined);
      }),
    );
    const failing = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      failing.result.current.mutate(buyVars);
    });
    await waitFor(
      () => {
        expect(failing.result.current.isError).toBe(true);
      },
      { timeout: 5000 },
    );
    expect(calls).toBe(3); // first try + 2 retries
    failing.unmount();

    calls = 0;
    server.use(
      http.post("*/bookings", () => {
        calls += 1;
        return error(422, "BOOKING_CLOSED");
      }),
    );
    const closed = renderHook(() => useCreateBookingOptimistic(ST), { wrapper });
    act(() => {
      closed.result.current.mutate(buyVars);
    });
    await waitFor(() => {
      expect(closed.result.current.isError).toBe(true);
    });
    expect(calls).toBe(1);
    expect(statusOf("A1")).toBe("AVAILABLE");
  });
});

describe("useCancelBookingOptimistic", () => {
  beforeEach(() => {
    client.setQueryData(getGetActiveBookingQueryKey(), okResponse(booking));
    client.setQueryData(
      getGetSeatMapQueryKey(ST),
      seatMapResponse({ A1: "HELD", A2: "HELD", A3: "AVAILABLE" }),
    );
  });

  it("hides the active booking and frees its seats at once", async () => {
    const gate = deferred();
    server.use(
      http.post("*/bookings/:id/cancel", async () => {
        await gate.promise;
        return HttpResponse.json({
          ...booking,
          status: "CANCELLED",
          cancelReason: "USER_CANCELLED",
        });
      }),
    );
    const { result } = renderHook(
      () => ({ cancel: useCancelBookingOptimistic(), interval: useSeatMapRefetchInterval() }),
      { wrapper },
    );
    act(() => {
      result.current.cancel.mutate(booking);
    });
    await waitFor(() => {
      expect(result.current.cancel.isPending).toBe(true);
    });
    await waitFor(() => {
      expect(client.getQueryData<{ status: number }>(getGetActiveBookingQueryKey())?.status).toBe(
        204,
      );
    });
    expect(statusOf("A1")).toBe("AVAILABLE");
    expect(statusOf("A2")).toBe("AVAILABLE");
    expect(result.current.interval).toBe(false);

    gate.resolve();
    await waitFor(() => {
      expect(result.current.cancel.isSuccess).toBe(true);
    });
  });

  it("rolls everything back on PAYMENT_IN_PROGRESS", async () => {
    server.use(http.post("*/bookings/:id/cancel", () => error(409, "PAYMENT_IN_PROGRESS")));
    const { result } = renderHook(() => useCancelBookingOptimistic(), { wrapper });
    act(() => {
      result.current.mutate(booking);
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    const active = client.getQueryData<{ status: number; data: Booking }>(
      getGetActiveBookingQueryKey(),
    );
    expect(active?.status).toBe(200);
    expect(active?.data.id).toBe("booking-1");
    expect(statusOf("A1")).toBe("HELD");
    expect(statusOf("A2")).toBe("HELD");
  });

  it("rolls back on a network error too", async () => {
    server.use(http.post("*/bookings/:id/cancel", () => HttpResponse.error()));
    const { result } = renderHook(() => useCancelBookingOptimistic(), { wrapper });
    act(() => {
      result.current.mutate(booking);
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(client.getQueryData<{ status: number }>(getGetActiveBookingQueryKey())?.status).toBe(
      200,
    );
    expect(statusOf("A1")).toBe("HELD");
  });
});

describe("own pending seats are never reported as taken", () => {
  it("withoutOwnSeats drops our own labels", () => {
    expect(withoutOwnSeats(["A1", "A2", "A3"], ["A1", "A2"])).toEqual(["A3"]);
  });

  it("the preview (our seats HELD) does not trigger 'just taken', a real taken seat still does", () => {
    const onTaken = vi.fn();
    const own = ["A1", "A2"];
    // The cache after Buy's preview: our seats are HELD; A3 was really taken by someone else.
    const map = withSeatStatus(
      seatMapResponse({ A1: "AVAILABLE", A2: "AVAILABLE", A3: "BOOKED" }),
      ["id-A1", "id-A2"],
      "HELD",
    );
    if (map?.status !== 200) throw new Error("expected a seat map");
    renderHook(() => {
      useTakenSeatDetector(map.data, withoutOwnSeats(["A1", "A2", "A3"], own), onTaken);
    });
    expect(onTaken).toHaveBeenCalledTimes(1);
    expect(onTaken).toHaveBeenCalledWith(["A3"]);
  });

  it("noActiveBookingResponse is the 204 shape the banner treats as 'none'", () => {
    expect(noActiveBookingResponse().status).toBe(204);
    expect(okResponse(booking).status).toBe(200);
  });
});

import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGetSeatMap } from "@/api/generated/endpoints/showtimes/showtimes";
import { seatMapPolling } from "./seat-cache";
import { SEAT_POLL_MS } from "./use-taken-seats";

const map = {
  showtimeId: "st",
  totalRows: 1,
  totalCols: 1,
  seats: [],
  prices: [],
  generatedAt: "2026-10-28T10:00:00Z",
};

let calls = 0;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  calls = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify(map), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
  focusManager.setFocused(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  focusManager.setFocused(undefined);
});

describe("seat map polling", () => {
  it("is every 10 s, always stale, and never in the background", () => {
    expect(seatMapPolling(SEAT_POLL_MS)).toEqual({
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    });
  });

  it("polls while the tab is visible, pauses while it is hidden and resumes when it returns", async () => {
    renderHook(() => useGetSeatMap("st", { query: seatMapPolling(SEAT_POLL_MS) }), { wrapper });
    await waitFor(() => {
      expect(calls).toBe(1);
    });

    await vi.advanceTimersByTimeAsync(SEAT_POLL_MS + 100);
    await waitFor(() => {
      expect(calls).toBe(2);
    });

    focusManager.setFocused(false); // tab hidden
    await vi.advanceTimersByTimeAsync(SEAT_POLL_MS * 3);
    expect(calls).toBe(2);

    focusManager.setFocused(true); // back: refetches on focus, then keeps polling
    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(3);
    });
    const before = calls;
    await vi.advanceTimersByTimeAsync(SEAT_POLL_MS + 100);
    await waitFor(() => {
      expect(calls).toBeGreaterThan(before);
    });
  });

  it("a paused interval (a booking mutation in flight) does not poll at all", async () => {
    renderHook(() => useGetSeatMap("st", { query: seatMapPolling(false) }), { wrapper });
    await waitFor(() => {
      expect(calls).toBe(1);
    });
    await vi.advanceTimersByTimeAsync(SEAT_POLL_MS * 3);
    expect(calls).toBe(1);
  });
});

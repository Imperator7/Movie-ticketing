import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeServerDate, resetServerClock, serverNow } from "@/lib/server-clock";
import { msUntil, useCountdown } from "./use-countdown";

describe("server clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-28T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetServerClock();
  });

  it("estimates the skew from a Date header (device 2 minutes behind the server)", () => {
    const deviceNow = Date.now();
    const server = new Date(deviceNow + 120_000).toUTCString();
    observeServerDate(server, deviceNow - 50, deviceNow + 50);
    // The header is truncated to the second, so a 500 ms bias is added.
    expect(serverNow() - deviceNow).toBeGreaterThanOrEqual(120_000);
    expect(serverNow() - deviceNow).toBeLessThanOrEqual(120_600);
  });

  it("ignores missing or invalid headers", () => {
    observeServerDate(null, 0, 1);
    observeServerDate("not a date", 0, 1);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50);
  });
});

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-28T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetServerClock();
  });

  it("counts down to the deadline and stops below zero", () => {
    const deadline = "2026-10-28T10:05:00Z";
    const { result } = renderHook(() => useCountdown(deadline));
    expect(result.current).toBe(300_000);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(240_000);
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(result.current).toBeLessThanOrEqual(0);
  });

  it("follows the server clock, not the device clock", () => {
    // Server is 90 s ahead of the device: the same deadline is 90 s closer.
    observeServerDate(new Date(Date.now() + 90_000 - 500).toUTCString(), Date.now(), Date.now());
    const { result } = renderHook(() => useCountdown("2026-10-28T10:05:00Z"));
    expect(result.current).toBeGreaterThanOrEqual(209_000);
    expect(result.current).toBeLessThanOrEqual(211_000);
  });

  it("is null without a deadline and reacts to a new one", () => {
    const { result, rerender } = renderHook(({ at }) => useCountdown(at), {
      initialProps: { at: undefined as string | undefined },
    });
    expect(result.current).toBeNull();
    rerender({ at: "2026-10-28T10:00:10Z" });
    expect(result.current).toBe(10_000);
  });

  it("msUntil is a pure difference", () => {
    expect(msUntil("2026-10-28T10:00:30Z", Date.parse("2026-10-28T10:00:00Z"))).toBe(30_000);
  });
});

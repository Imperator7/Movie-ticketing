import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "../config/config.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { gracefulShutdown } from "./graceful-shutdown.js";
import { HealthService } from "./health.service.js";

function makeService(query: () => Promise<unknown>, timeoutMs = 50): HealthService {
  const prisma = { $queryRaw: query } as unknown as PrismaService;
  const config = { get: () => timeoutMs } as unknown as ConfigService;
  return new HealthService(prisma, config);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("HealthService", () => {
  it("is alive and ready while the database answers", async () => {
    const service = makeService(() => Promise.resolve([{ "?column?": 1 }]));

    expect(service.liveness()).toEqual({ httpStatus: 200, body: { status: "ok" } });
    expect(await service.readiness()).toEqual({
      httpStatus: 200,
      body: { status: "ok", checks: { database: "up" } },
    });
  });

  it("is not ready (503, database down) when the query fails", async () => {
    const service = makeService(() => Promise.reject(new Error("connection refused")));

    expect(await service.readiness()).toEqual({
      httpStatus: 503,
      body: { status: "error", checks: { database: "down" } },
    });
  });

  it("is not ready when the query hangs past the timeout", async () => {
    vi.useFakeTimers();
    const service = makeService(() => new Promise(() => undefined), 2000);

    const pending = service.readiness();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toMatchObject({ httpStatus: 503, body: { status: "error" } });
  });

  it("switches to shutting_down (503) once and stays there, without touching the database", async () => {
    const query = vi.fn(() => Promise.resolve([]));
    const service = makeService(query);
    expect(service.isShuttingDown).toBe(false);

    service.beginShutdown();
    service.beginShutdown(); // idempotent

    expect(service.isShuttingDown).toBe(true);
    expect(await service.readiness()).toEqual({
      httpStatus: 503,
      body: { status: "shutting_down" },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("stays alive (liveness 200) while draining", () => {
    const service = makeService(() => Promise.resolve([]));
    service.beginShutdown();

    expect(service.liveness().httpStatus).toBe(200);
  });
});

describe("gracefulShutdown", () => {
  it("goes not-ready, then drains, then closes, in that order", async () => {
    const calls: string[] = [];

    const order = await gracefulShutdown({
      beginShutdown: () => calls.push("beginShutdown"),
      drainMs: 5000,
      sleep: (ms) => {
        calls.push(`sleep:${String(ms)}`);
        return Promise.resolve();
      },
      close: () => {
        calls.push("close");
        return Promise.resolve();
      },
    });

    expect(calls).toEqual(["beginShutdown", "sleep:5000", "close"]);
    expect(order).toEqual(["not-ready", "drained", "closed"]);
  });

  it("does not close before the drain delay has elapsed", async () => {
    vi.useFakeTimers();
    const close = vi.fn(() => Promise.resolve());

    const done = gracefulShutdown({ beginShutdown: () => undefined, drainMs: 3000, close });
    await vi.advanceTimersByTimeAsync(2999);
    expect(close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(close).toHaveBeenCalledOnce();
  });
});

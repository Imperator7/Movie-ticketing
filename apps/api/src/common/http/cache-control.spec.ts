import type { ArgumentsHost } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../errors/all-exceptions.filter.js";
import { CATALOG_CACHE, NO_STORE, SHOWTIMES_CACHE, noStoreByDefault } from "./cache-control.js";

describe("cache-control", () => {
  it("defines the public values", () => {
    expect(CATALOG_CACHE).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(SHOWTIMES_CACHE).toBe("public, max-age=15, stale-while-revalidate=60");
  });

  it("noStoreByDefault sets no-store and continues", () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    noStoreByDefault({}, { setHeader }, next);

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", NO_STORE);
    expect(next).toHaveBeenCalledOnce();
  });

  it("the exception filter overrides a public header with no-store", () => {
    const headers: Record<string, string> = { "Cache-Control": CATALOG_CACHE };
    const response = {
      headersSent: false,
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(new NotFoundException(), host);

    expect(headers["Cache-Control"]).toBe(NO_STORE);
    expect(response.status).toHaveBeenCalledWith(404);
  });
});

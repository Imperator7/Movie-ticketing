import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { makeQueryClient, shouldRetry } from "./query-client";

const apiError = (status: number) => new ApiError({ status, code: "INTERNAL_ERROR", message: "x" });

describe("query client defaults", () => {
  it("never retries 4xx", () => {
    expect(shouldRetry(0, apiError(404))).toBe(false);
    expect(shouldRetry(0, apiError(409))).toBe(false);
  });

  it("retries 5xx and network errors twice", () => {
    for (const error of [apiError(503), new TypeError("Failed to fetch")]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(false);
    }
  });

  it("refetches on window focus and keeps data fresh for a while", () => {
    const options = makeQueryClient().getDefaultOptions().queries;
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.staleTime).toBeGreaterThan(0);
  });
});

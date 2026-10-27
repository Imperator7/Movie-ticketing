import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AppException } from "../common/errors/app.exception.js";
import type { ConfigService } from "../config/config.service.js";
import { OriginGuard, isAllowedOrigin } from "./origin.guard.js";

const allowed = ["http://localhost:3000", "https://movies.example.com"];

function guard(): OriginGuard {
  return new OriginGuard({ get: () => allowed } as unknown as ConfigService);
}

function contextWith(origin: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: origin === undefined ? {} : { origin } }),
    }),
  } as unknown as ExecutionContext;
}

describe("isAllowedOrigin", () => {
  it("accepts only exact matches", () => {
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedOrigin("https://movies.example.com", allowed)).toBe(true);
  });

  it.each([
    "https://evil.example.com",
    "http://localhost:3001",
    "https://movies.example.com.evil.com",
    "http://movies.example.com",
    "https://movies.example.com/",
    "null",
    "",
  ])("rejects %j", (origin) => {
    expect(isAllowedOrigin(origin, allowed)).toBe(false);
  });

  it("rejects a missing Origin", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });
});

describe("OriginGuard", () => {
  it("lets an allowed origin through", () => {
    expect(guard().canActivate(contextWith("http://localhost:3000"))).toBe(true);
  });

  it("throws 403 FORBIDDEN for a foreign or missing origin", () => {
    for (const origin of ["https://evil.example.com", undefined]) {
      try {
        guard().canActivate(contextWith(origin));
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect(error).toMatchObject({ code: "FORBIDDEN" });
        expect((error as AppException).getStatus()).toBe(403);
      }
    }
  });
});

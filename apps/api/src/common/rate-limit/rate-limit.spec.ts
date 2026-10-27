import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { buildThrottlerOptions, isAuthRoute, isLoginRoute, loginTracker } from "./rate-limit.js";

function ctx(method: string, path: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
  } as unknown as ExecutionContext;
}

describe("route matching", () => {
  it("applies the auth limit to /auth/* only", () => {
    expect(isAuthRoute(ctx("POST", "/api/v1/auth/login"))).toBe(true);
    expect(isAuthRoute(ctx("GET", "/api/v1/auth/me"))).toBe(true);
    expect(isAuthRoute(ctx("GET", "/api/v1/health/ready"))).toBe(false);
    expect(isAuthRoute(ctx("GET", "/api/v1/authors"))).toBe(false);
  });

  it("applies the login limit to POST /auth/login only", () => {
    expect(isLoginRoute(ctx("POST", "/api/v1/auth/login"))).toBe(true);
    expect(isLoginRoute(ctx("GET", "/api/v1/auth/login"))).toBe(false);
    expect(isLoginRoute(ctx("POST", "/api/v1/auth/register"))).toBe(false);
  });
});

describe("loginTracker", () => {
  it("keys on the normalised email", () => {
    expect(loginTracker({ body: { email: "  Alice@Example.com " }, ip: "1.2.3.4" })).toBe(
      "email:alice@example.com",
    );
    expect(loginTracker({ body: { email: "ALICE@example.com" }, ip: "9.9.9.9" })).toBe(
      "email:alice@example.com",
    );
  });

  it("falls back to the IP when there is no usable email", () => {
    expect(loginTracker({ body: {}, ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
    expect(loginTracker({ body: { email: 42 }, ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
    expect(loginTracker({ ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
  });
});

describe("buildThrottlerOptions", () => {
  it("defines global, auth and login limits per minute", () => {
    const options = buildThrottlerOptions({
      globalPerMin: 300,
      authPerMin: 10,
      loginPerEmailPerMin: 5,
    });
    const throttlers = (options as { throttlers: { name: string; limit: number; ttl: number }[] })
      .throttlers;

    expect(throttlers.map((t) => [t.name, t.limit, t.ttl])).toEqual([
      ["default", 300, 60_000],
      ["auth", 10, 60_000],
      ["login", 5, 60_000],
    ]);
  });
});

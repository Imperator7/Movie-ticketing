import { describe, expect, it } from "vitest";
import { EnvValidationError, validateEnv } from "./env.schema.js";

const REAL_SECRET_A = "k8Jx2mQ9vLw4RtZ7bNc1HfYp6sDg3UaE0oXiKjVn5MqT";
const REAL_SECRET_B = "Zr7wQ1pLm9xVc3Hn5BtYd8JkF2sGa6UeOi0XoKvNqMjA";
const REAL_SECRET_C = "Ty4uI8oP1aS5dF9gH3jK7lZ2xC6vB0nMqWeRtYuIoPaS";

const base = {
  DATABASE_URL: "postgresql://app_user:pw@localhost:5433/movie_ticketing?schema=public",
  JWT_SECRET: REAL_SECRET_A,
  REFRESH_TOKEN_PEPPER: REAL_SECRET_B,
  TICKET_QR_SECRET: REAL_SECRET_C,
};

function messageOf(raw: Record<string, string | undefined>): string {
  try {
    validateEnv(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as Error).message;
  }
  throw new Error("expected validateEnv to throw");
}

describe("validateEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const env = validateEnv({ ...base, NODE_ENV: "production" });

    expect(env.PORT).toBe(4000);
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
    expect(env.SHUTDOWN_DRAIN_MS).toBe(5000);
  });

  it("coerces numbers and booleans from strings", () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: "development",
      PORT: "5000",
      DB_POOL_MAX: "4",
      SWAGGER_ENABLED: "true",
      TRUST_PROXY_HOPS: "1",
    });

    expect(env).toMatchObject({
      PORT: 5000,
      DB_POOL_MAX: 4,
      SWAGGER_ENABLED: true,
      TRUST_PROXY_HOPS: 1,
    });
  });

  it("names every missing variable and fails once", () => {
    const message = messageOf({});

    expect(message).toContain("DATABASE_URL: is required");
    expect(message).toContain("JWT_SECRET: is required");
    expect(message).toContain("REFRESH_TOKEN_PEPPER: is required");
    expect(message).toContain("TICKET_QR_SECRET: is required");
  });

  it("rejects a secret shorter than 32 bytes, even in development", () => {
    const message = messageOf({ ...base, NODE_ENV: "development", JWT_SECRET: "too-short" });

    expect(message).toContain("JWT_SECRET");
    expect(message).toContain("at least 32 bytes");
  });

  it("counts bytes, not characters", () => {
    // 11 Thai characters are 33 bytes in UTF-8.
    expect(() => validateEnv({ ...base, JWT_SECRET: "สวัสดีครับผม" })).not.toThrow();
  });

  it("never prints secret values in the error", () => {
    const message = messageOf({ ...base, JWT_SECRET: "short-secret-value" });

    expect(message).not.toContain("short-secret-value");
  });

  it("rejects placeholder secrets in production", () => {
    const message = messageOf({
      ...base,
      NODE_ENV: "production",
      JWT_SECRET: "dev_jwt_secret_change_me_0123456789abcdef",
    });

    expect(message).toContain("JWT_SECRET: looks like a placeholder");
  });

  it.each(["development", "test"])("allows placeholder secrets when NODE_ENV=%s", (nodeEnv) => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: nodeEnv,
        JWT_SECRET: "dev_jwt_secret_change_me_0123456789abcdef",
      }),
    ).not.toThrow();
  });

  it("refuses Swagger in production", () => {
    const message = messageOf({ ...base, NODE_ENV: "production", SWAGGER_ENABLED: "true" });

    expect(message).toContain("SWAGGER_ENABLED");
  });

  it("rejects a non-postgres DATABASE_URL and a bad port", () => {
    const message = messageOf({ ...base, DATABASE_URL: "mysql://x/y", PORT: "70000" });

    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("PORT");
  });

  describe("auth settings", () => {
    it("defaults: Secure cookie, issuer/audience, one web origin, rate limits", () => {
      const env = validateEnv({ ...base, NODE_ENV: "production" });

      expect(env).toMatchObject({
        COOKIE_SECURE: true,
        JWT_ISSUER: "movie-ticketing-api",
        JWT_AUDIENCE: "movie-ticketing-web",
        WEB_ORIGINS: ["http://localhost:3000"],
        REFRESH_REUSE_GRACE_MS: 10_000,
        RATE_LIMIT_GLOBAL_PER_MIN: 300,
        RATE_LIMIT_AUTH_PER_MIN: 10,
        RATE_LIMIT_LOGIN_PER_EMAIL_PER_MIN: 5,
      });
    });

    it("parses WEB_ORIGINS as a trimmed comma-separated list", () => {
      const env = validateEnv({
        ...base,
        WEB_ORIGINS: " https://a.example.com , https://b.example.com ,",
      });

      expect(env.WEB_ORIGINS).toEqual(["https://a.example.com", "https://b.example.com"]);
    });

    it("rejects an invalid or empty WEB_ORIGINS", () => {
      expect(messageOf({ ...base, WEB_ORIGINS: "not a url" })).toContain("WEB_ORIGINS");
      expect(messageOf({ ...base, WEB_ORIGINS: " , " })).toContain("WEB_ORIGINS");
    });

    it.each(["development", "test"])("allows COOKIE_SECURE=false when NODE_ENV=%s", (nodeEnv) => {
      expect(
        validateEnv({ ...base, NODE_ENV: nodeEnv, COOKIE_SECURE: "false" }).COOKIE_SECURE,
      ).toBe(false);
    });

    it("refuses COOKIE_SECURE=false in production", () => {
      expect(messageOf({ ...base, NODE_ENV: "production", COOKIE_SECURE: "false" })).toContain(
        "COOKIE_SECURE: must be true",
      );
    });
  });
});

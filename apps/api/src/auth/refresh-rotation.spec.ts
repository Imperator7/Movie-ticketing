import { describe, expect, it } from "vitest";
import {
  REFRESH_TOKEN_TTL_MS,
  decideRotation,
  generateRefreshToken,
  hashRefreshToken,
} from "./refresh-rotation.js";

const now = new Date("2026-11-02T12:00:00Z");
const future = new Date(now.getTime() + 60_000);
const past = new Date(now.getTime() - 60_000);

describe("decideRotation", () => {
  it("rotates a valid, unrevoked token", () => {
    expect(decideRotation({ revokedAt: null, expiresAt: future }, now)).toBe("rotate");
  });

  it("treats an unknown token as invalid", () => {
    expect(decideRotation(null, now)).toBe("invalid");
  });

  it("treats an expired, unrevoked token as invalid (no family revocation)", () => {
    expect(decideRotation({ revokedAt: null, expiresAt: past }, now)).toBe("invalid");
    expect(decideRotation({ revokedAt: null, expiresAt: now }, now)).toBe("invalid");
  });

  it("treats a revoked token as reuse (theft), even if it has also expired", () => {
    expect(decideRotation({ revokedAt: past, expiresAt: future }, now)).toBe("reuse");
    expect(decideRotation({ revokedAt: past, expiresAt: past }, now)).toBe("reuse");
  });

  it("treats a token revoked within the grace window as a concurrent refresh", () => {
    const justNow = new Date(now.getTime() - 500);

    expect(decideRotation({ revokedAt: justNow, expiresAt: future }, now, 2000)).toBe("concurrent");
    expect(decideRotation({ revokedAt: justNow, expiresAt: future }, now, 0)).toBe("reuse");
    expect(decideRotation({ revokedAt: past, expiresAt: future }, now, 2000)).toBe("reuse");
  });
});

describe("refresh token generation and hashing", () => {
  it("generates 32 random bytes as base64url (43 chars), unique each time", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("hashes with HMAC-SHA256 (64 hex chars), deterministically, never equal to the token", () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token, "pepper-one-0123456789abcdef0123456789");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token, "pepper-one-0123456789abcdef0123456789")).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("depends on the pepper and on the token", () => {
    const token = "abc";

    expect(hashRefreshToken(token, "pepper-one")).not.toBe(hashRefreshToken(token, "pepper-two"));
    expect(hashRefreshToken("abc", "p")).not.toBe(hashRefreshToken("abd", "p"));
  });

  it("lives 7 days", () => {
    expect(REFRESH_TOKEN_TTL_MS).toBe(604_800_000);
  });
});

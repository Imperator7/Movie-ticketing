import { createHmac, randomBytes } from "node:crypto";

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes, base64url (43 chars). Only the HMAC is ever stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC-SHA256 keyed with the pepper, hex. A DB leak alone cannot be used to forge or brute-force tokens. */
export function hashRefreshToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export interface StoredRefreshToken {
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * - `rotate`: valid, revoke it and issue a successor.
 * - `invalid`: unknown or expired. Plain 401.
 * - `reuse`: already revoked and presented again, so someone else may hold a copy. Revoke the whole family.
 * - `concurrent`: revoked a moment ago (within the grace window), treated as a racing tab. Plain 401, family kept.
 */
export type RotationDecision = "rotate" | "invalid" | "reuse" | "concurrent";

export function decideRotation(
  token: StoredRefreshToken | null,
  now: Date,
  reuseGraceMs = 0,
): RotationDecision {
  if (!token) return "invalid";
  if (token.revokedAt) {
    return now.getTime() - token.revokedAt.getTime() < reuseGraceMs ? "concurrent" : "reuse";
  }
  if (token.expiresAt.getTime() <= now.getTime()) return "invalid";
  return "rotate";
}

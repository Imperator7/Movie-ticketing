import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { ConfigService } from "../config/config.service.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** What an access token carries (and all it carries). */
export interface AccessTokenClaims {
  userId: string;
  /** The refresh-token family (one login session). */
  sessionId: string;
}

@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService) {
    this.key = new TextEncoder().encode(config.get("JWT_SECRET"));
    this.issuer = config.get("JWT_ISSUER");
    this.audience = config.get("JWT_AUDIENCE");
  }

  sign(claims: AccessTokenClaims, now: Date = new Date()): Promise<string> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  /** Returns the claims, or null for any invalid token (bad signature, algorithm, iss, aud, expired, malformed). */
  async verify(token: string, now: Date = new Date()): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"], // pinned: never trust the token's own `alg`
        issuer: this.issuer,
        audience: this.audience,
        currentDate: now,
      });
      const sid = payload.sid;
      if (typeof payload.sub !== "string" || typeof sid !== "string") return null;
      return { userId: payload.sub, sessionId: sid };
    } catch {
      return null;
    }
  }
}

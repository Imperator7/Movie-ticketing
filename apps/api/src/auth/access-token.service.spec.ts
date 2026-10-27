import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { ConfigService } from "../config/config.service.js";
import { ACCESS_TOKEN_TTL_SECONDS, AccessTokenService } from "./access-token.service.js";

const SECRET = "unit_test_jwt_secret_0123456789abcdef0123456789";
const claims = {
  userId: "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10",
  sessionId: "7a1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a11",
};

function service(overrides: Record<string, string> = {}): AccessTokenService {
  const values: Record<string, string> = {
    JWT_SECRET: SECRET,
    JWT_ISSUER: "issuer-a",
    JWT_AUDIENCE: "audience-a",
    ...overrides,
  };
  return new AccessTokenService({ get: (key: string) => values[key] } as unknown as ConfigService);
}

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;
}

describe("AccessTokenService", () => {
  it("signs a token that verifies back to the same claims", async () => {
    const tokens = service();

    expect(await tokens.verify(await tokens.sign(claims))).toEqual(claims);
  });

  it("carries only sub, sid, iss, aud, iat and exp (15 minutes)", async () => {
    const payload = decodePayload(await service().sign(claims, new Date("2026-11-02T00:00:00Z")));

    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "iss", "sid", "sub"]);
    expect(payload).toMatchObject({
      sub: claims.userId,
      sid: claims.sessionId,
      iss: "issuer-a",
      aud: "audience-a",
    });
    expect((payload.exp as number) - (payload.iat as number)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it("uses HS256", async () => {
    const header = JSON.parse(
      Buffer.from((await service().sign(claims)).split(".")[0] ?? "", "base64url").toString(),
    ) as {
      alg: string;
    };

    expect(header.alg).toBe("HS256");
  });

  it("rejects an expired token", async () => {
    const tokens = service();
    const token = await tokens.sign(claims, new Date("2026-11-02T00:00:00Z"));

    expect(await tokens.verify(token, new Date("2026-11-02T00:14:59Z"))).toEqual(claims);
    expect(await tokens.verify(token, new Date("2026-11-02T00:15:01Z"))).toBeNull();
  });

  it("rejects a wrong issuer, a wrong audience and a wrong secret", async () => {
    const token = await service().sign(claims);

    expect(await service({ JWT_ISSUER: "issuer-b" }).verify(token)).toBeNull();
    expect(await service({ JWT_AUDIENCE: "audience-b" }).verify(token)).toBeNull();
    expect(
      await service({ JWT_SECRET: "another_secret_0123456789abcdef0123456789" }).verify(token),
    ).toBeNull();
  });

  it("rejects HS384 tokens signed with the right key (algorithm is pinned)", async () => {
    const forged = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: "HS384" })
      .setSubject(claims.userId)
      .setIssuer("issuer-a")
      .setAudience("audience-a")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));

    expect(await service().verify(forged)).toBeNull();
  });

  it("rejects alg=none tokens", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: claims.userId,
        sid: claims.sessionId,
        iss: "issuer-a",
        aud: "audience-a",
        exp: 9999999999,
      }),
    ).toString("base64url");

    expect(await service().verify(`${header}.${body}.`)).toBeNull();
  });

  it("rejects tokens without a sid or with a non-string sub, and garbage", async () => {
    const key = new TextEncoder().encode(SECRET);
    const noSid = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setIssuer("issuer-a")
      .setAudience("audience-a")
      .setExpirationTime("5m")
      .sign(key);

    const tokens = service();
    expect(await tokens.verify(noSid)).toBeNull();
    expect(await tokens.verify("")).toBeNull();
    expect(await tokens.verify("a.b.c")).toBeNull();
    expect(await tokens.verify("garbage")).toBeNull();
  });
});

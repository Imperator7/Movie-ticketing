import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { queryOne } from "./db.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct-horse-battery";

interface Body {
  accessToken: string;
  user: { id: string; email: string | null };
  code: string;
}
const bodyOf = (res: Response): Body => res.body as Body;

const uniqueEmail = (): string => `user-${randomUUID()}@example.com`;

/** The `rt` cookie: its raw `Set-Cookie` line and its value. */
function refreshCookie(res: Response): { line: string; value: string } {
  const lines = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const line = lines.find((entry) => entry.startsWith("rt="));
  if (!line) throw new Error(`no rt cookie in ${JSON.stringify(lines)}`);
  return { line, value: (line.split(";")[0] ?? "").slice(3) };
}

describe("auth (real database)", () => {
  let app: NestExpressApplication;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  const register = (
    email = uniqueEmail(),
    extra: Record<string, unknown> = {},
  ): Promise<Response> =>
    http()
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, displayName: "Tester", ...extra });

  const refresh = (token: string | null, origin: string | null = ORIGIN): Promise<Response> => {
    const req = http().post("/api/v1/auth/refresh");
    if (origin) void req.set("Origin", origin);
    if (token) void req.set("Cookie", `rt=${token}`);
    return req;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("register", () => {
    it("creates the account, returns the contract AuthResponse and sets the cookie", async () => {
      const email = uniqueEmail();
      const res = await register(`  ${email.toUpperCase()} `, {
        phone: "0812345678",
        preferredLocale: "en",
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        expiresIn: 900,
        user: {
          email, // normalised
          displayName: "Tester",
          phone: "0812345678",
          preferredLocale: "en",
          avatarUrl: null,
          loginMethods: ["PASSWORD"],
        },
      });
      expect(typeof bodyOf(res).accessToken).toBe("string");
      expect(bodyOf(res).user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(res.body)).not.toContain("password");
      expect(refreshCookie(res).value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("sets the refresh cookie with the exact attributes", async () => {
      const { line } = refreshCookie(await register());

      expect(line).toContain("HttpOnly");
      expect(line).toContain("Secure");
      expect(line).toContain("SameSite=Strict");
      expect(line).toContain("Path=/api/v1/auth");
      expect(line).toContain("Max-Age=604800");
    });

    it("answers 409 EMAIL_ALREADY_USED for a duplicate, case and whitespace insensitive", async () => {
      const email = uniqueEmail();
      expect((await register(email)).status).toBe(201);

      const res = await register(` ${email.toUpperCase()}`);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        statusCode: 409,
        code: "EMAIL_ALREADY_USED",
        message: "This email is already registered",
      });
    });

    it("answers 422 VALIDATION_FAILED with details.fields for bad input and unknown keys", async () => {
      const res = await http()
        .post("/api/v1/auth/register")
        .send({ email: "nope", password: "short", displayName: "", extra: true });

      expect(res.status).toBe(422);
      expect(bodyOf(res).code).toBe("VALIDATION_FAILED");
      expect(Object.keys((res.body as { details: { fields: object } }).details.fields)).toEqual(
        expect.arrayContaining(["email", "password", "displayName"]),
      );
    });

    it("stores only a hash of the refresh token (never the token) and an argon2id password hash", async () => {
      const email = uniqueEmail();
      const res = await register(email);
      const token = refreshCookie(res).value;

      const user = await queryOne<{ password_hash: string; token_hash: string }>(
        `SELECT u.password_hash, t.token_hash FROM users u JOIN refresh_tokens t ON t.user_id = u.id WHERE u.email = $1`,
        [email],
      );

      expect(user?.password_hash).toMatch(/^\$argon2id\$/);
      expect(user?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(user?.token_hash).not.toContain(token);
    });
  });

  describe("login", () => {
    it("logs in with a normalised email, returns tokens and sets a new cookie", async () => {
      const email = uniqueEmail();
      await register(email);

      const res = await http()
        .post("/api/v1/auth/login")
        .send({ email: ` ${email.toUpperCase()} `, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(bodyOf(res).user.email).toBe(email);
      expect(refreshCookie(res).line).toContain("HttpOnly");
    });

    it("gives the same 401 body for a wrong password and for an unknown email", async () => {
      const email = uniqueEmail();
      await register(email);

      const wrongPassword = await http()
        .post("/api/v1/auth/login")
        .send({ email, password: "wrong-password" });
      const unknownEmail = await http()
        .post("/api/v1/auth/login")
        .send({ email: uniqueEmail(), password: "wrong-password" });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body).toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
      expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("me", () => {
    it("returns the current user for a valid access token", async () => {
      const email = uniqueEmail();
      const body = bodyOf(await register(email));

      const res = await http()
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(body.user);
    });

    it.each([
      ["no header", undefined],
      ["garbage token", "Bearer not.a.jwt"],
      ["wrong scheme", "Basic abc"],
      ["empty bearer", "Bearer "],
    ])("answers 401 UNAUTHORIZED with the contract body (%s)", async (_name, header) => {
      const req = http().get("/api/v1/auth/me");
      if (header !== undefined) void req.set("Authorization", header);
      const res = await req;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    });

    it("keeps health public", async () => {
      expect((await http().get("/api/v1/health/live")).status).toBe(200);
    });
  });

  describe("refresh rotation and reuse detection", () => {
    it("rotates: new access token and cookie, the old cookie stops working", async () => {
      const registered = await register();
      const first = refreshCookie(registered).value;

      const rotated = await refresh(first);

      expect(rotated.status).toBe(200);
      expect(bodyOf(rotated).user.id).toBe(bodyOf(registered).user.id);
      const second = refreshCookie(rotated).value;
      expect(second).not.toBe(first);
      expect(refreshCookie(rotated).line).toContain("Max-Age=604800"); // expiry restarts on rotation

      const me = await http()
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${bodyOf(rotated).accessToken}`);
      expect(me.status).toBe(200);

      const old = await refresh(first);
      expect(old.status).toBe(401);
      expect(old.body).toMatchObject({ statusCode: 401, code: "REFRESH_TOKEN_INVALID" });
    });

    it("reuse of a rotated token revokes the whole family, including the newest token", async () => {
      const email = uniqueEmail();
      const first = refreshCookie(await register(email)).value;
      const second = refreshCookie(await refresh(first)).value;
      const third = refreshCookie(await refresh(second)).value; // legitimate rotations

      // Time passes beyond REFRESH_REUSE_GRACE_MS (10 s), so a replay is theft, not a racing tab.
      await queryOne(
        `UPDATE refresh_tokens t SET revoked_at = t.revoked_at - interval '1 minute'
         FROM users u WHERE u.id = t.user_id AND u.email = $1 AND t.revoked_at IS NOT NULL`,
        [email],
      );

      // An attacker replays the first (revoked) token.
      const replay = await refresh(first);
      expect(replay.status).toBe(401);
      expect(replay.body).toMatchObject({ statusCode: 401, code: "REFRESH_TOKEN_INVALID" });

      // The newest token, never used by the attacker, is dead too.
      expect((await refresh(third)).status).toBe(401);
      const family = await queryOne<{ active: string }>(
        `SELECT count(*)::text AS active FROM refresh_tokens t JOIN users u ON u.id = t.user_id
         WHERE u.email = $1 AND t.revoked_at IS NULL`,
        [email],
      );
      expect(family?.active).toBe("0");
    });

    it("rejects a missing cookie and an unknown token with 401 REFRESH_TOKEN_INVALID", async () => {
      const missing = await refresh(null);
      const unknown = await refresh("A".repeat(43));

      for (const res of [missing, unknown]) {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: "REFRESH_TOKEN_INVALID" });
      }
    });

    it("two concurrent refreshes with the same token: exactly one succeeds (row lock)", async () => {
      const token = refreshCookie(await register()).value;

      const results = await Promise.all([refresh(token), refresh(token)]);
      const statuses = results.map((res) => res.status).sort();

      expect(statuses).toEqual([200, 401]);
    });

    it("starts a new family on every login", async () => {
      const email = uniqueEmail();
      await register(email);
      await http().post("/api/v1/auth/login").send({ email, password: PASSWORD });
      await http().post("/api/v1/auth/login").send({ email, password: PASSWORD });

      const families = await queryOne<{ n: string }>(
        `SELECT count(DISTINCT t.family_id)::text AS n FROM refresh_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = $1`,
        [email],
      );
      expect(families?.n).toBe("3");
    });
  });

  describe("CSRF origin check", () => {
    it.each([
      ["refresh", "/api/v1/auth/refresh"],
      ["logout", "/api/v1/auth/logout"],
    ])(
      "%s rejects a foreign Origin and a missing Origin with 403 FORBIDDEN",
      async (_name, path) => {
        const token = refreshCookie(await register()).value;

        const foreign = await http()
          .post(path)
          .set("Origin", "https://evil.example.com")
          .set("Cookie", `rt=${token}`);
        const missing = await http().post(path).set("Cookie", `rt=${token}`);

        for (const res of [foreign, missing]) {
          expect(res.status).toBe(403);
          expect(res.body).toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
        }
        // The token was not consumed by the rejected requests.
        expect((await refresh(token)).status).toBe(200);
      },
    );
  });

  describe("logout", () => {
    it("revokes the token, clears the cookie and answers 204", async () => {
      const token = refreshCookie(await register()).value;

      const res = await http()
        .post("/api/v1/auth/logout")
        .set("Origin", ORIGIN)
        .set("Cookie", `rt=${token}`);

      expect(res.status).toBe(204);
      const cleared = refreshCookie(res).line;
      expect(cleared).toContain("Path=/api/v1/auth");
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await refresh(token)).status).toBe(401);
    });

    it("answers 204 when already logged out or without a cookie", async () => {
      const bare = await http().post("/api/v1/auth/logout").set("Origin", ORIGIN);
      const bogus = await http()
        .post("/api/v1/auth/logout")
        .set("Origin", ORIGIN)
        .set("Cookie", `rt=${"B".repeat(43)}`);

      expect(bare.status).toBe(204);
      expect(bogus.status).toBe(204);
    });

    it("only logs out this device: another session of the same user keeps working", async () => {
      const email = uniqueEmail();
      const a = refreshCookie(await register(email)).value;
      const b = refreshCookie(
        await http().post("/api/v1/auth/login").send({ email, password: PASSWORD }),
      ).value;

      await http().post("/api/v1/auth/logout").set("Origin", ORIGIN).set("Cookie", `rt=${a}`);

      expect((await refresh(b)).status).toBe(200);
    });
  });
});

describe("rate limits (real throttler, default limits)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      RATE_LIMIT_GLOBAL_PER_MIN: "300",
      RATE_LIMIT_AUTH_PER_MIN: "10",
      RATE_LIMIT_LOGIN_PER_EMAIL_PER_MIN: "5",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("limits login to 5 per minute per email, with the contract 429 body and headers", async () => {
    const email = uniqueEmail();
    const attempt = (): Promise<Response> =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "wrong-password" });

    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "Too many requests",
    });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(limited.headers["ratelimit-limit"]).toBe("5");
    expect(limited.headers["ratelimit-remaining"]).toBe("0");
    expect(Number(limited.headers["ratelimit-reset"])).toBeGreaterThan(0);
  });

  it("counts the email case-insensitively and does not throttle other emails", async () => {
    const email = uniqueEmail();
    const attempt = (value: string): Promise<Response> =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: value, password: "wrong-password" });

    // 5 earlier failures from the previous spec used the same IP budget (10/min), so stay within it here.
    for (let i = 0; i < 2; i++) await attempt(email);

    expect((await attempt(email.toUpperCase())).status).toBe(401);
  });
});

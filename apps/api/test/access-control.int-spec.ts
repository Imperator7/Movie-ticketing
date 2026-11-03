import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import { IMPLEMENTED_OPERATIONS } from "../src/contract/implemented-operations.js";
import { createHall, createMovie, createShowtime, token } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";
import { testPrisma } from "./db.js";

/**
 * Access control matrix (API-1, IDOR): every implemented operation that needs a login, called by Bob against
 * Alice's data over HTTP. Owned resources must answer exactly like an unknown id (404, no existence leak) and stay
 * unchanged; self-scoped operations must only ever show the caller's own data.
 *
 * The first test keeps the matrix complete: a new operation that needs a login fails it until a row is added here.
 */

const ORIGIN = "http://localhost:3000";
const HOUR = 3_600_000;
const SPEC_PATH = fileURLToPath(new URL("../../../docs/openapi.yaml", import.meta.url));

type Obj = Record<string, unknown>;

/** operationIds of the contract that need a credential (bearer token or refresh cookie). */
function securedOperations(): string[] {
  const spec = parse(readFileSync(SPEC_PATH, "utf8")) as { paths: Record<string, Obj> };
  const secured: string[] = [];
  for (const pathItem of Object.values(spec.paths)) {
    for (const operation of Object.values(pathItem)) {
      const op = operation as { operationId?: string; security?: unknown[] };
      if (!op.operationId) continue;
      // No `security` = the global bearerAuth; `security: []` = public.
      if (op.security === undefined || op.security.length > 0) secured.push(op.operationId);
    }
  }
  return secured;
}

interface User {
  id: string;
  token: string;
  cookie: string;
}
interface ErrorBody {
  statusCode: number;
  code: string;
}

describe("access control: Bob never reaches Alice's data", () => {
  let app: NestExpressApplication;
  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  let alice: User;
  let bob: User;
  /** Alice's paid booking and her current unpaid one. */
  let confirmedId: string;
  let pendingId: string;
  let aliceKey: string;

  async function newUser(name: string): Promise<User> {
    const res = await api()
      .post("/api/v1/auth/register")
      .send({
        email: `${name}-${token()}@example.com`,
        password: "long-enough-pw",
        displayName: name,
      });
    expect(res.status).toBe(201);
    const body = res.body as { accessToken: string; user: { id: string } };
    const lines = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    const cookie = (lines.find((l) => l.startsWith("rt=")) ?? "").split(";")[0] ?? "";
    return { id: body.user.id, token: body.accessToken, cookie };
  }
  const as = (user: User, method: "get" | "post", path: string) =>
    api()[method](`/api/v1${path}`).set("Authorization", `Bearer ${user.token}`);

  async function newShow(): Promise<{ showtimeId: string; seatIds: string[] }> {
    const movie = await createMovie();
    const hall = await createHall({ seats: 4 });
    const showtime = await createShowtime({
      movieId: movie.id,
      hallId: hall.hallId,
      startsAt: new Date(
        bangkokDayRange(addDays(bangkokDateOf(new Date()), 1)).start.getTime() + 16 * HOUR,
      ),
    });
    return { showtimeId: showtime.id, seatIds: hall.seatIds };
  }
  async function book(user: User, key: string = randomUUID()): Promise<string> {
    const show = await newShow();
    const res = await as(user, "post", "/bookings")
      .set("Idempotency-Key", key)
      .send({ showtimeId: show.showtimeId, seatIds: show.seatIds.slice(0, 1) });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  }

  /** What Alice's bookings look like in the database; must not change because of Bob. */
  const aliceState = async () =>
    testPrisma().booking.findMany({
      where: { userId: alice.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        cancelReason: true,
        updatedAt: true,
        payments: { select: { id: true, status: true } },
        events: { select: { type: true } },
        seats: { select: { releasedAt: true } },
      },
    });

  /** Bob's response must be the same as for an id that does not exist at all. */
  function expectLikeUnknown(bobs: Response, unknown: Response): void {
    expect(bobs.status).toBe(404);
    expect(bobs.body as ErrorBody).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect({ status: bobs.status, body: { ...(bobs.body as Obj), requestId: undefined } }).toEqual({
      status: unknown.status,
      body: { ...(unknown.body as Obj), requestId: undefined },
    });
  }

  beforeAll(async () => {
    app = await createTestApp({ WEB_ORIGINS: ORIGIN });
    alice = await newUser("alice");
    bob = await newUser("bob");

    confirmedId = await book(alice);
    const paid = await as(alice, "post", "/__demo/pay").send({
      bookingId: confirmedId,
      method: "CARD",
    });
    expect(paid.status).toBe(200);
    aliceKey = randomUUID();
    pendingId = await book(alice, aliceKey);
    expect((await as(alice, "post", `/bookings/${pendingId}/payment-intent`)).status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------- the matrix

  /** Operations on one resource that belongs to a user: Bob gets "not found" and changes nothing. */
  const owned: Record<string, (bookingId: string) => Promise<Response>> = {
    getBooking: async (id) => as(bob, "get", `/bookings/${id}`),
    cancelBooking: async (id) => as(bob, "post", `/bookings/${id}/cancel`),
    createPaymentIntent: async (id) => as(bob, "post", `/bookings/${id}/payment-intent`),
  };

  /** Operations scoped to the caller by their credential; each has its own test below. */
  const selfScoped = [
    "getMe",
    "getActiveBooking",
    "listMyBookings",
    "createBooking",
    "refresh",
    "logout",
  ];

  it("covers every implemented operation that needs a login (add new ones to this file)", () => {
    const implemented = new Set<string>(IMPLEMENTED_OPERATIONS);
    const needLogin = securedOperations().filter((id) => implemented.has(id));
    expect([...Object.keys(owned), ...selfScoped].sort()).toEqual([...needLogin].sort());
  });

  describe("owned resources", () => {
    it.each(Object.keys(owned))(
      "%s on Alice's bookings answers Bob exactly like an unknown id",
      async (operation) => {
        const call = owned[operation];
        if (!call) throw new Error(operation);
        const unknown = await call(randomUUID());
        expectLikeUnknown(await call(pendingId), unknown);
        expectLikeUnknown(await call(confirmedId), unknown);
      },
    );

    it("the demo pay button cannot pay (or probe) someone else's booking", async () => {
      const unknown = await as(bob, "post", "/__demo/pay").send({
        bookingId: randomUUID(),
        method: "CARD",
      });
      const bobs = await as(bob, "post", "/__demo/pay").send({
        bookingId: pendingId,
        method: "CARD",
      });
      expectLikeUnknown(bobs, unknown);
    });

    it("after all of Bob's attempts Alice's bookings, payments and seats are exactly as before", async () => {
      const before = await aliceState();
      for (const call of Object.values(owned)) {
        await call(pendingId);
        await call(confirmedId);
      }
      await as(bob, "post", "/__demo/pay").send({ bookingId: pendingId, method: "CARD" });
      expect(await aliceState()).toEqual(before);
      expect(before.map((b) => b.status)).toEqual(["CONFIRMED", "PENDING_PAYMENT"]);
    });

    it("without a token every one of them is 401, before any lookup", async () => {
      const calls = [
        api().get(`/api/v1/bookings/${pendingId}`),
        api().post(`/api/v1/bookings/${pendingId}/cancel`),
        api().post(`/api/v1/bookings/${pendingId}/payment-intent`),
        api().post("/api/v1/__demo/pay").send({ bookingId: pendingId, method: "CARD" }),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(401);
        expect(res.body as ErrorBody).toMatchObject({ code: "UNAUTHORIZED" });
      }
    });

    it("a forged token (Alice's id, wrong signature) is 401", async () => {
      const [header, payload] = alice.token.split(".");
      const forged = `${header ?? ""}.${payload ?? ""}.${"A".repeat(43)}`;
      const res = await api()
        .get(`/api/v1/bookings/${pendingId}`)
        .set("Authorization", `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });
  });

  describe("self-scoped operations", () => {
    it("getMe returns the caller, never anyone else", async () => {
      const res = await as(bob, "get", "/auth/me");
      expect((res.body as { id: string }).id).toBe(bob.id);
    });

    it("getActiveBooking: Bob has none while Alice has one", async () => {
      expect((await as(alice, "get", "/bookings/active")).status).toBe(200);
      const res = await as(bob, "get", "/bookings/active");
      expect(res.status).toBe(204);
    });

    it("listMyBookings never lists Alice's bookings, in any scope", async () => {
      for (const scope of ["upcoming", "past"]) {
        const res = await as(bob, "get", `/bookings/me?scope=${scope}`);
        expect(res.status).toBe(200);
        const ids = (res.body as { items: { id: string }[] }).items.map((b) => b.id);
        expect(ids).not.toContain(confirmedId);
        expect(ids).not.toContain(pendingId);
      }
      const alices = await as(alice, "get", "/bookings/me?scope=upcoming");
      expect((alices.body as { items: { id: string }[] }).items.map((b) => b.id)).toContain(
        confirmedId,
      );
    });

    it("createBooking: Bob reusing Alice's Idempotency-Key gets his own booking, not her stored response", async () => {
      const show = await newShow();
      const res = await as(bob, "post", "/bookings")
        .set("Idempotency-Key", aliceKey)
        .send({ showtimeId: show.showtimeId, seatIds: show.seatIds.slice(0, 1) });
      expect(res.status).toBe(201);
      const id = (res.body as { id: string }).id;
      expect(id).not.toBe(pendingId);
      const row = await testPrisma().booking.findUniqueOrThrow({ where: { id } });
      expect(row.userId).toBe(bob.id);
      await as(bob, "post", `/bookings/${id}/cancel`);
    });

    it("refresh: a cookie only ever renews its own user's session", async () => {
      const res = await api()
        .post("/api/v1/auth/refresh")
        .set("Origin", ORIGIN)
        .set("Cookie", bob.cookie);
      expect(res.status).toBe(200);
      expect((res.body as { user: { id: string } }).user.id).toBe(bob.id);
      const lines = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
      bob.cookie = (lines.find((l) => l.startsWith("rt=")) ?? "").split(";")[0] ?? "";
    });

    it("logout: Bob logging out never ends Alice's session", async () => {
      const out = await api()
        .post("/api/v1/auth/logout")
        .set("Origin", ORIGIN)
        .set("Cookie", bob.cookie);
      expect(out.status).toBe(204);
      const aliceRefresh = await api()
        .post("/api/v1/auth/refresh")
        .set("Origin", ORIGIN)
        .set("Cookie", alice.cookie);
      expect(aliceRefresh.status).toBe(200);
      expect((aliceRefresh.body as { user: { id: string } }).user.id).toBe(alice.id);
    });
  });
});

import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signTicket } from "../src/booking/booking-support.js";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import { createHall, createMovie, createShowtime, lockSeats, token } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";
import { testPrisma } from "./db.js";

interface BookingBody {
  id: string;
  bookingCode: string;
  status: string;
  cancelReason?: string | null;
  seats: { seatId: string; label: string; type: string; priceBaht: number }[];
  totalBaht: number;
  currency: string;
  paymentExpiresAt: string;
  holdExpiresAt: string;
  createdAt: string;
  cancelledAt?: string | null;
  ticketQr?: string | null;
  showtime: { id: string; hallNumber: number };
}
interface ErrorBody {
  statusCode: number;
  code: string;
  details?: { seatIds?: string[]; bookingId?: string };
}

const pick = (items: string[], index: number): string => {
  const value = items[index];
  if (value === undefined) throw new Error(`no item ${String(index)}`);
  return value;
};

const HOUR = 3_600_000;
const MINUTE = 60_000;
const tomorrow = addDays(bangkokDateOf(new Date()), 1);

describe("bookings (real database)", () => {
  let app: NestExpressApplication;
  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  interface User {
    id: string;
    token: string;
  }
  async function newUser(): Promise<User> {
    const res = await api()
      .post("/api/v1/auth/register")
      .send({ email: `bk-${token()}@example.com`, password: "long-enough-pw", displayName: "B" });
    const body = res.body as { accessToken: string; user: { id: string } };
    return { id: body.user.id, token: body.accessToken };
  }

  interface Show {
    showtimeId: string;
    seatIds: string[];
    hallId: string;
  }
  async function newShow(options: { seats?: number; startsAt?: Date } = {}): Promise<Show> {
    const movie = await createMovie();
    const hall = await createHall({ seats: options.seats ?? 10 });
    const showtime = await createShowtime({
      movieId: movie.id,
      hallId: hall.hallId,
      startsAt: options.startsAt ?? new Date(bangkokDayRange(tomorrow).start.getTime() + 15 * HOUR),
    });
    return { showtimeId: showtime.id, seatIds: hall.seatIds, hallId: hall.hallId };
  }

  const book = (
    user: User,
    show: Show,
    seatIds: string[],
    key: string = randomUUID(),
  ): Promise<Response> =>
    api()
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${user.token}`)
      .set("Idempotency-Key", key)
      .send({ showtimeId: show.showtimeId, seatIds });

  const authed = async (user: User, method: "get" | "post", path: string): Promise<Response> =>
    api()[method](`/api/v1${path}`).set("Authorization", `Bearer ${user.token}`);

  const bodyOf = (res: Response): BookingBody => res.body as BookingBody;
  const errorOf = (res: Response): ErrorBody => res.body as ErrorBody;
  const seatStatus = async (show: Show, seatId: string): Promise<string | undefined> => {
    const res = await api().get(`/api/v1/showtimes/${show.showtimeId}/seats`);
    return (res.body as { seats: { id: string; status: string }[] }).seats.find(
      (s) => s.id === seatId,
    )?.status;
  };
  /** Pushes a pending booking's windows into the past (as if 10 minutes had gone by). */
  const expire = async (bookingId: string): Promise<void> => {
    await testPrisma().booking.update({
      where: { id: bookingId },
      data: {
        paymentExpiresAt: new Date(Date.now() - 2 * MINUTE),
        holdExpiresAt: new Date(Date.now() - 1 * MINUTE),
      },
    });
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /bookings", () => {
    it("locks the seats, prices them on the server and writes the audit event", async () => {
      const user = await newUser();
      const show = await newShow();
      const [a, b] = show.seatIds as [string, string];
      await testPrisma().seat.update({ where: { id: b }, data: { type: "PREMIUM" } });
      const before = Date.now();

      const res = await book(user, show, [a, b]);

      expect(res.status).toBe(201);
      expect(res.headers["idempotent-replayed"]).toBeUndefined();
      expect(res.headers["cache-control"]).toBe("no-store");
      const booking = bodyOf(res);
      expect(booking).toMatchObject({
        status: "PENDING_PAYMENT",
        currency: "THB",
        totalBaht: 220 + 280,
        showtime: { id: show.showtimeId },
      });
      expect(booking.bookingCode).toMatch(/^MT-[A-Z2-9]{6}$/);
      expect(booking.seats).toEqual([
        { seatId: a, label: "A1", type: "STANDARD", priceBaht: 220 },
        { seatId: b, label: "A2", type: "PREMIUM", priceBaht: 280 },
      ]);
      const created = new Date(booking.createdAt).getTime();
      expect(created).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(booking.paymentExpiresAt).getTime() - created).toBe(5 * MINUTE);
      expect(new Date(booking.holdExpiresAt).getTime() - created).toBe(6 * MINUTE);
      expect(booking.ticketQr).toBeNull();

      expect(await seatStatus(show, a)).toBe("HELD");
      const events = await testPrisma().bookingEvent.findMany({ where: { bookingId: booking.id } });
      expect(events.map((e) => [e.type, e.actor])).toEqual([["CREATED", "USER"]]);
    });

    it("requires authentication", async () => {
      const show = await newShow();
      const res = await api()
        .post("/api/v1/bookings")
        .set("Idempotency-Key", randomUUID())
        .send({ showtimeId: show.showtimeId, seatIds: [show.seatIds[0]] });

      expect(res.status).toBe(401);
      expect(errorOf(res).code).toBe("UNAUTHORIZED");
    });

    describe("validation", () => {
      it("requires a UUID Idempotency-Key", async () => {
        const user = await newUser();
        const show = await newShow();
        const send = (key?: string): Promise<Response> => {
          const req = api().post("/api/v1/bookings").set("Authorization", `Bearer ${user.token}`);
          if (key !== undefined) void req.set("Idempotency-Key", key);
          return req.send({ showtimeId: show.showtimeId, seatIds: show.seatIds.slice(0, 1) });
        };

        const missing = await send();
        const malformed = await send("not-a-uuid");

        expect(missing.status).toBe(422);
        expect(errorOf(missing).code).toBe("IDEMPOTENCY_KEY_MISSING");
        expect(malformed.status).toBe(422);
        expect(errorOf(malformed).code).toBe("VALIDATION_FAILED");
      });

      it.each([
        ["no seats", (s: Show) => ({ showtimeId: s.showtimeId, seatIds: [] })],
        [
          "duplicate seat ids",
          (s: Show) => ({ showtimeId: s.showtimeId, seatIds: [s.seatIds[0], s.seatIds[0]] }),
        ],
        ["a non-uuid seat id", (s: Show) => ({ showtimeId: s.showtimeId, seatIds: ["A5"] })],
        [
          "an unknown field",
          (s: Show) => ({ showtimeId: s.showtimeId, seatIds: s.seatIds.slice(0, 1), price: 1 }),
        ],
        ["a missing showtime id", (s: Show) => ({ seatIds: s.seatIds.slice(0, 1) })],
      ])("rejects %s with 422 VALIDATION_FAILED", async (_name, body) => {
        const user = await newUser();
        const show = await newShow();

        const res = await api()
          .post("/api/v1/bookings")
          .set("Authorization", `Bearer ${user.token}`)
          .set("Idempotency-Key", randomUUID())
          .send(body(show));

        expect(res.status).toBe(422);
        expect(errorOf(res).code).toBe("VALIDATION_FAILED");
      });

      it("rejects more than 4 seats with TOO_MANY_SEATS", async () => {
        const user = await newUser();
        const show = await newShow({ seats: 6 });

        const res = await book(user, show, show.seatIds.slice(0, 5));
        const four = await book(user, show, show.seatIds.slice(0, 4));

        expect(res.status).toBe(422);
        expect(errorOf(res).code).toBe("TOO_MANY_SEATS");
        expect(four.status).toBe(201);
      });
    });

    describe("not found / closed", () => {
      it("answers 404 SHOWTIME_NOT_FOUND", async () => {
        const user = await newUser();
        const show = await newShow();

        const res = await book(
          user,
          { ...show, showtimeId: randomUUID() },
          show.seatIds.slice(0, 1),
        );

        expect(res.status).toBe(404);
        expect(errorOf(res).code).toBe("SHOWTIME_NOT_FOUND");
      });

      it("answers 404 SEAT_NOT_FOUND for a seat of another hall, an inactive seat and an unknown seat", async () => {
        const user = await newUser();
        const show = await newShow({ seats: 3 });
        const other = await newShow({ seats: 3 });
        const inactive = await createHall({ seats: 2, inactive: true });
        const movie = await createMovie();
        const inactiveShow = await createShowtime({
          movieId: movie.id,
          hallId: inactive.hallId,
          startsAt: new Date(bangkokDayRange(tomorrow).start.getTime() + 9 * HOUR),
        });

        const otherHall = await book(user, show, [pick(other.seatIds, 0)]);
        const unknown = await book(user, show, [randomUUID()]);
        const inactiveRes = await book(
          user,
          { showtimeId: inactiveShow.id, seatIds: inactive.seatIds, hallId: inactive.hallId },
          [pick(inactive.seatIds, 1)],
        );

        for (const res of [otherHall, unknown, inactiveRes]) {
          expect(res.status).toBe(404);
          expect(errorOf(res).code).toBe("SEAT_NOT_FOUND");
        }
        expect(await testPrisma().booking.count({ where: { userId: user.id } })).toBe(0);
      });

      it("answers 422 BOOKING_CLOSED for a cancelled showtime and one past the cut-off, not before it", async () => {
        const user = await newUser();
        const cancelled = await newShow();
        await testPrisma().showtime.update({
          where: { id: cancelled.showtimeId },
          data: { status: "CANCELLED" },
        });
        const closed = await newShow({ startsAt: new Date(Date.now() - 31 * MINUTE) });
        const stillOpen = await newShow({ startsAt: new Date(Date.now() - 20 * MINUTE) });

        const cancelledRes = await book(user, cancelled, cancelled.seatIds.slice(0, 1));
        const closedRes = await book(user, closed, closed.seatIds.slice(0, 1));
        const openRes = await book(user, stillOpen, stillOpen.seatIds.slice(0, 1));

        expect(cancelledRes.status).toBe(422);
        expect(errorOf(cancelledRes).code).toBe("BOOKING_CLOSED");
        expect(closedRes.status).toBe(422);
        expect(errorOf(closedRes).code).toBe("BOOKING_CLOSED");
        expect(openRes.status).toBe(201);
      });
    });

    describe("one active booking per user", () => {
      it("refuses a second booking with ACTIVE_BOOKING_EXISTS and the booking id", async () => {
        const user = await newUser();
        const show = await newShow();
        const first = bodyOf(await book(user, show, [pick(show.seatIds, 0)]));

        const second = await book(user, show, [pick(show.seatIds, 1)]);

        expect(second.status).toBe(409);
        expect(errorOf(second)).toMatchObject({
          code: "ACTIVE_BOOKING_EXISTS",
          details: { bookingId: first.id },
        });
        expect(await seatStatus(show, pick(show.seatIds, 1))).toBe("AVAILABLE");
      });

      it("cancels the caller's own stale pending booking and goes ahead", async () => {
        const user = await newUser();
        const show = await newShow();
        const stale = bodyOf(await book(user, show, [pick(show.seatIds, 0)]));
        await expire(stale.id);

        const res = await book(user, show, [pick(show.seatIds, 1)]);

        expect(res.status).toBe(201);
        const old = await testPrisma().booking.findUniqueOrThrow({
          where: { id: stale.id },
          include: { events: true, seats: true },
        });
        expect(old).toMatchObject({ status: "CANCELLED", cancelReason: "PAYMENT_TIMEOUT" });
        expect(old.seats.every((seat) => seat.releasedAt !== null)).toBe(true);
        expect(old.events.map((e) => [e.type, e.actor])).toEqual([
          ["CREATED", "USER"],
          ["CANCELLED", "SYSTEM"],
        ]);
      });

      it("parallel requests of one user with different keys: exactly one wins", async () => {
        const user = await newUser();
        const show = await newShow({ seats: 8 });

        const results = await Promise.all(
          show.seatIds.slice(0, 6).map((seatId) => book(user, show, [seatId])),
        );

        const statuses = results.map((res) => res.status).sort();
        expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
        const winner = bodyOf(
          results.find((res) => res.status === 201) ?? results[0] ?? ({} as Response),
        );
        for (const res of results.filter((r) => r.status === 409)) {
          expect(errorOf(res)).toMatchObject({
            code: "ACTIVE_BOOKING_EXISTS",
            details: { bookingId: winner.id },
          });
        }
        expect(
          await testPrisma().booking.count({
            where: { userId: user.id, status: "PENDING_PAYMENT" },
          }),
        ).toBe(1);
      });
    });

    describe("seat races", () => {
      it("answers SEAT_TAKEN with exactly the conflicting seats and leaves no partial lock", async () => {
        const first = await newUser();
        const second = await newUser();
        const show = await newShow();
        const [a, b, c] = show.seatIds as [string, string, string];
        expect((await book(first, show, [a])).status).toBe(201);

        const res = await book(second, show, [a, b, c]);

        expect(res.status).toBe(409);
        expect(errorOf(res)).toMatchObject({ code: "SEAT_TAKEN", details: { seatIds: [a] } });
        expect(await seatStatus(show, b)).toBe("AVAILABLE");
        expect(await seatStatus(show, c)).toBe("AVAILABLE");
        expect(await testPrisma().booking.count({ where: { userId: second.id } })).toBe(0);
        // The failed attempt did not burn the user's active-booking slot either.
        expect((await book(second, show, [b])).status).toBe(201);
      });

      it("N parallel requests for the same seat: exactly one 201, the rest SEAT_TAKEN", async () => {
        const show = await newShow();
        const seat = pick(show.seatIds, 0);
        const users = await Promise.all(Array.from({ length: 8 }, () => newUser()));

        const results = await Promise.all(users.map((user) => book(user, show, [seat])));

        expect(results.filter((res) => res.status === 201)).toHaveLength(1);
        const losers = results.filter((res) => res.status !== 201);
        expect(losers).toHaveLength(7);
        for (const res of losers) {
          expect(res.status).toBe(409);
          expect(errorOf(res)).toMatchObject({ code: "SEAT_TAKEN", details: { seatIds: [seat] } });
        }
        const locks = await testPrisma().bookingSeat.count({
          where: { showtimeId: show.showtimeId, seatId: seat, releasedAt: null },
        });
        expect(locks).toBe(1);
      });

      it("parallel requests with overlapping seat sets never double-book a seat", async () => {
        const show = await newShow({ seats: 6 });
        const users = await Promise.all(Array.from({ length: 6 }, () => newUser()));
        const sets = users.map(
          (_, i) => [show.seatIds[i % 6], show.seatIds[(i + 1) % 6]] as string[],
        );

        const results = await Promise.all(users.map((user, i) => book(user, show, sets[i] ?? [])));

        const rows = await testPrisma().bookingSeat.groupBy({
          by: ["seatId"],
          where: { showtimeId: show.showtimeId, releasedAt: null },
          _count: true,
        });
        expect(rows.every((row) => row._count === 1)).toBe(true);
        expect(results.every((res) => res.status === 201 || res.status === 409)).toBe(true);
        expect(results.some((res) => res.status === 201)).toBe(true);
      });

      it("takes over seats whose hold is over, cancelling the stale booking", async () => {
        const first = await newUser();
        const second = await newUser();
        const show = await newShow();
        const seat = pick(show.seatIds, 0);
        const stale = bodyOf(await book(first, show, [seat]));
        await expire(stale.id);
        expect(await seatStatus(show, seat)).toBe("AVAILABLE");

        const res = await book(second, show, [seat]);

        expect(res.status).toBe(201);
        const old = await testPrisma().booking.findUniqueOrThrow({ where: { id: stale.id } });
        expect(old).toMatchObject({ status: "CANCELLED", cancelReason: "PAYMENT_TIMEOUT" });
        expect(await seatStatus(show, seat)).toBe("HELD");
      });
    });

    describe("idempotency", () => {
      it("replays the stored 201 for the same key and body, without a second booking", async () => {
        const user = await newUser();
        const show = await newShow();
        const key = randomUUID();
        const first = await book(user, show, [pick(show.seatIds, 0)], key);

        const replay = await book(user, show, [pick(show.seatIds, 0)], key);

        expect(first.status).toBe(201);
        expect(replay.status).toBe(201);
        expect(replay.headers["idempotent-replayed"]).toBe("true");
        expect(replay.body).toEqual(first.body);
        expect(await testPrisma().booking.count({ where: { userId: user.id } })).toBe(1);
      });

      it("treats the same seat set in another order as the same request", async () => {
        const user = await newUser();
        const show = await newShow();
        const [a, b] = show.seatIds as [string, string];
        const key = randomUUID();
        const first = await book(user, show, [a, b], key);

        const replay = await book(user, show, [b, a], key);

        expect(replay.status).toBe(201);
        expect(replay.headers["idempotent-replayed"]).toBe("true");
        expect(bodyOf(replay).id).toBe(bodyOf(first).id);
      });

      it("rejects the same key with a different body: 422 IDEMPOTENCY_KEY_REUSED", async () => {
        const user = await newUser();
        const show = await newShow();
        const key = randomUUID();
        await book(user, show, [pick(show.seatIds, 0)], key);

        const res = await book(user, show, [pick(show.seatIds, 1)], key);

        expect(res.status).toBe(422);
        expect(errorOf(res).code).toBe("IDEMPOTENCY_KEY_REUSED");
      });

      it("keys are per user: another user may reuse the same key value", async () => {
        const one = await newUser();
        const two = await newUser();
        const show = await newShow();
        const key = randomUUID();

        const a = await book(one, show, [pick(show.seatIds, 0)], key);
        const b = await book(two, show, [pick(show.seatIds, 1)], key);

        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        expect(b.headers["idempotent-replayed"]).toBeUndefined();
      });

      it("a failed request does not store the key: the retry runs for real", async () => {
        const first = await newUser();
        const second = await newUser();
        const show = await newShow();
        const seat = pick(show.seatIds, 0);
        const held = bodyOf(await book(first, show, [seat]));
        const key = randomUUID();
        expect((await book(second, show, [seat], key)).status).toBe(409);
        await testPrisma().booking.update({
          where: { id: held.id },
          data: { status: "CANCELLED", cancelReason: "USER_CANCELLED" },
        });
        await testPrisma().bookingSeat.updateMany({
          where: { bookingId: held.id },
          data: { releasedAt: new Date() },
        });

        const retry = await book(second, show, [seat], key);

        expect(retry.status).toBe(201);
        expect(retry.headers["idempotent-replayed"]).toBeUndefined();
      });

      it("N parallel requests with the same key create exactly one booking", async () => {
        const user = await newUser();
        const show = await newShow();
        const key = randomUUID();
        const seats = [pick(show.seatIds, 0)];

        const results = await Promise.all(
          Array.from({ length: 8 }, () => book(user, show, seats, key)),
        );

        expect(results.every((res) => res.status === 201)).toBe(true);
        expect(new Set(results.map((res) => bodyOf(res).id)).size).toBe(1);
        expect(results.filter((res) => res.headers["idempotent-replayed"] === "true")).toHaveLength(
          7,
        );
        expect(await testPrisma().booking.count({ where: { userId: user.id } })).toBe(1);
        expect(await testPrisma().idempotencyKey.count({ where: { userId: user.id, key } })).toBe(
          1,
        );
      });

      it("stores the response, the hash and a 24 h expiry", async () => {
        const user = await newUser();
        const show = await newShow();
        const key = randomUUID();
        await book(user, show, [pick(show.seatIds, 0)], key);

        const row = await testPrisma().idempotencyKey.findUniqueOrThrow({
          where: { userId_key: { userId: user.id, key } },
        });

        expect(row.requestHash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.responseStatus).toBe(201);
        expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(24 * HOUR);
      });
    });
  });

  describe("GET /bookings/active", () => {
    it("answers 204 with no body when there is none, 200 while pending inside the hold, 204 after it", async () => {
      const user = await newUser();
      const show = await newShow();
      const none = await authed(user, "get", "/bookings/active");
      expect(none.status).toBe(204);
      expect(none.text).toBe("");

      const created = bodyOf(await book(user, show, [pick(show.seatIds, 0)]));
      const active = await authed(user, "get", "/bookings/active");
      expect(active.status).toBe(200);
      expect(bodyOf(active).id).toBe(created.id);

      await expire(created.id);
      expect((await authed(user, "get", "/bookings/active")).status).toBe(204);
    });

    it("requires authentication and never shows another user's booking", async () => {
      const owner = await newUser();
      const other = await newUser();
      const show = await newShow();
      await book(owner, show, [pick(show.seatIds, 0)]);

      expect((await api().get("/api/v1/bookings/active")).status).toBe(401);
      expect((await authed(other, "get", "/bookings/active")).status).toBe(204);
    });
  });

  describe("GET /bookings/:id", () => {
    it("returns the caller's booking and 404 for someone else's, an unknown id and a malformed id", async () => {
      const owner = await newUser();
      const other = await newUser();
      const show = await newShow();
      const created = bodyOf(await book(owner, show, [pick(show.seatIds, 0)]));

      const mine = await authed(owner, "get", `/bookings/${created.id}`);
      const theirs = await authed(other, "get", `/bookings/${created.id}`);
      const unknown = await authed(owner, "get", `/bookings/${randomUUID()}`);
      const malformed = await authed(owner, "get", "/bookings/not-a-uuid");

      expect(mine.status).toBe(200);
      expect(bodyOf(mine).id).toBe(created.id);
      for (const res of [theirs, unknown, malformed]) {
        expect(res.status).toBe(404);
        expect(errorOf(res).code).toBe("NOT_FOUND");
      }
      expect(theirs.body).toEqual(unknown.body); // indistinguishable
      expect((await api().get(`/api/v1/bookings/${created.id}`)).status).toBe(401);
    });

    it("includes a signed ticketQr once CONFIRMED and none before", async () => {
      const user = await newUser();
      const show = await newShow();
      const pending = bodyOf(await book(user, show, [pick(show.seatIds, 0)]));
      const confirmedId = await lockSeats({
        showtimeId: show.showtimeId,
        seatIds: [pick(show.seatIds, 3)],
        state: "CONFIRMED",
        userId: user.id,
      });
      // the one-pending index does not apply to CONFIRMED rows, so this user may hold both

      const confirmed = bodyOf(await authed(user, "get", `/bookings/${confirmedId}`));
      const stillPending = bodyOf(await authed(user, "get", `/bookings/${pending.id}`));

      expect(stillPending.ticketQr).toBeNull();
      expect(confirmed.status).toBe("CONFIRMED");
      expect(confirmed.ticketQr).toBe(
        signTicket(confirmed.bookingCode, "test_ticket_qr_secret_change_me_0123456789abcd"),
      );
    });
  });

  describe("GET /bookings/me", () => {
    it("lists confirmed and cancelled bookings by scope, newest first, paged; pending ones are not listed", async () => {
      const user = await newUser();
      const future = await newShow();
      const past = await newShow({ startsAt: new Date(Date.now() - 6 * HOUR) });
      const upcoming1 = await lockSeats({
        showtimeId: future.showtimeId,
        seatIds: [pick(future.seatIds, 0)],
        state: "CONFIRMED",
        userId: user.id,
      });
      const upcoming2 = await lockSeats({
        showtimeId: future.showtimeId,
        seatIds: [pick(future.seatIds, 1)],
        state: "CONFIRMED",
        userId: user.id,
      });
      const old = await lockSeats({
        showtimeId: past.showtimeId,
        seatIds: [pick(past.seatIds, 0)],
        state: "CONFIRMED",
        userId: user.id,
      });
      await book(user, future, [pick(future.seatIds, 5)]); // pending: not listed
      await testPrisma().booking.update({
        where: { id: upcoming1 },
        data: { createdAt: new Date(Date.now() - 2 * HOUR) },
      });

      const list = async (
        qs: string,
      ): Promise<{ total: number; page: number; pageSize: number; items: BookingBody[] }> =>
        (await authed(user, "get", `/bookings/me${qs}`)).body as never;
      const defaults = await list("");
      const upcoming = await list("?scope=upcoming");
      const pastList = await list("?scope=past");
      const paged = await list("?scope=upcoming&pageSize=1&page=2");

      expect(defaults).toEqual(upcoming);
      expect(upcoming.total).toBe(2);
      expect(upcoming.items.map((b) => b.id)).toEqual([upcoming2, upcoming1]);
      expect(pastList.items.map((b) => b.id)).toEqual([old]);
      expect(paged).toMatchObject({ page: 2, pageSize: 1, total: 2 });
      expect(paged.items.map((b) => b.id)).toEqual([upcoming1]);
    });

    it("only lists the caller's own bookings and validates its query", async () => {
      const owner = await newUser();
      const other = await newUser();
      const show = await newShow();
      await lockSeats({
        showtimeId: show.showtimeId,
        seatIds: [pick(show.seatIds, 0)],
        state: "CONFIRMED",
        userId: owner.id,
      });

      const mine = (await authed(owner, "get", "/bookings/me")).body as { total: number };
      const theirs = (await authed(other, "get", "/bookings/me")).body as { total: number };
      const bad = await authed(owner, "get", "/bookings/me?scope=future");

      expect(mine.total).toBe(1);
      expect(theirs.total).toBe(0);
      expect(bad.status).toBe(422);
      expect((await api().get("/api/v1/bookings/me")).status).toBe(401);
    });
  });

  describe("POST /bookings/:id/cancel", () => {
    it("cancels a pending booking: USER_CANCELLED, seats released, events written", async () => {
      const user = await newUser();
      const show = await newShow();
      const seat = pick(show.seatIds, 0);
      const created = bodyOf(await book(user, show, [seat]));
      expect(await seatStatus(show, seat)).toBe("HELD");

      const res = await authed(user, "post", `/bookings/${created.id}/cancel`);

      expect(res.status).toBe(200);
      expect(bodyOf(res)).toMatchObject({
        id: created.id,
        status: "CANCELLED",
        cancelReason: "USER_CANCELLED",
      });
      expect(bodyOf(res).cancelledAt).toBeTruthy();
      expect(await seatStatus(show, seat)).toBe("AVAILABLE");
      const events = await testPrisma().bookingEvent.findMany({
        where: { bookingId: created.id },
        orderBy: { id: "asc" },
      });
      expect(events.map((e) => [e.type, e.actor])).toEqual([
        ["CREATED", "USER"],
        ["CANCELLED", "USER"],
      ]);
      // The user may book again right away, even the same seat.
      expect((await book(user, show, [seat])).status).toBe(201);
    });

    it("answers 409 BOOKING_NOT_PENDING for a cancelled or confirmed booking", async () => {
      const user = await newUser();
      const show = await newShow();
      const created = bodyOf(await book(user, show, [pick(show.seatIds, 0)]));
      await authed(user, "post", `/bookings/${created.id}/cancel`);
      const confirmedId = await lockSeats({
        showtimeId: show.showtimeId,
        seatIds: [pick(show.seatIds, 4)],
        state: "CONFIRMED",
        userId: user.id,
      });

      const again = await authed(user, "post", `/bookings/${created.id}/cancel`);
      const confirmed = await authed(user, "post", `/bookings/${confirmedId}/cancel`);

      for (const res of [again, confirmed]) {
        expect(res.status).toBe(409);
        expect(errorOf(res).code).toBe("BOOKING_NOT_PENDING");
      }
      expect(
        (await testPrisma().booking.findUniqueOrThrow({ where: { id: confirmedId } })).status,
      ).toBe("CONFIRMED");
    });

    it("answers 404 for someone else's, an unknown and a malformed id, and 401 without a token", async () => {
      const owner = await newUser();
      const other = await newUser();
      const show = await newShow();
      const created = bodyOf(await book(owner, show, [pick(show.seatIds, 0)]));

      for (const id of [created.id, randomUUID(), "nope"]) {
        const res = await authed(other, "post", `/bookings/${id}/cancel`);
        expect(res.status).toBe(404);
      }
      expect((await api().post(`/api/v1/bookings/${created.id}/cancel`)).status).toBe(401);
      expect(
        (await testPrisma().booking.findUniqueOrThrow({ where: { id: created.id } })).status,
      ).toBe("PENDING_PAYMENT");
    });

    it("two parallel cancels: one 200, one 409, one CANCELLED event", async () => {
      const user = await newUser();
      const show = await newShow();
      const created = bodyOf(await book(user, show, [pick(show.seatIds, 0)]));

      const results = await Promise.all([
        authed(user, "post", `/bookings/${created.id}/cancel`),
        authed(user, "post", `/bookings/${created.id}/cancel`),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const cancelled = await testPrisma().bookingEvent.count({
        where: { bookingId: created.id, type: "CANCELLED" },
      });
      expect(cancelled).toBe(1);
    });
  });
});

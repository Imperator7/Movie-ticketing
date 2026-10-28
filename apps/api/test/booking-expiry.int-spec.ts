import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { BookingExpiryService, EXPIRY_JOB_LOCK_ID } from "../src/booking/booking-expiry.service.js";
import { PaymentGateway, type CancelOutcome } from "../src/booking/payment-gateway.js";
import type { ConfigService } from "../src/config/config.service.js";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import {
  createHall,
  createMovie,
  createShowtime,
  createUser,
  lockSeats,
} from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";
import { testPrisma } from "./db.js";

const MINUTE = 60_000;
const HOUR = 3_600_000;

class StubGateway extends PaymentGateway {
  calls: string[] = [];
  constructor(private readonly outcome: CancelOutcome) {
    super();
  }
  cancelPaymentIntent(bookingId: string): Promise<CancelOutcome> {
    this.calls.push(bookingId);
    return Promise.resolve(this.outcome);
  }
}

const job = (
  gateway: PaymentGateway = new StubGateway("nothing_to_cancel"),
): BookingExpiryService =>
  new BookingExpiryService(testPrisma() as unknown as PrismaService, gateway, {
    get: () => false,
  } as unknown as ConfigService);

/** A PENDING_PAYMENT booking created `minutesAgo` minutes ago (payment 5 min, hold 6 min after creation). */
async function pendingBooking(
  minutesAgo: number,
): Promise<{ bookingId: string; seatId: string; userId: string }> {
  const movie = await createMovie();
  const hall = await createHall({ seats: 2 });
  const showtime = await createShowtime({
    movieId: movie.id,
    hallId: hall.hallId,
    startsAt: new Date(
      bangkokDayRange(addDays(bangkokDateOf(new Date()), 1)).start.getTime() + 12 * HOUR,
    ),
  });
  const userId = await createUser();
  const [seatId = ""] = hall.seatIds;
  const bookingId = await lockSeats({
    showtimeId: showtime.id,
    seatIds: [seatId],
    state: "PENDING_IN_HOLD",
    userId,
  });
  const created = Date.now() - minutesAgo * MINUTE;
  await testPrisma().booking.update({
    where: { id: bookingId },
    data: {
      createdAt: new Date(created),
      paymentExpiresAt: new Date(created + 5 * MINUTE),
      holdExpiresAt: new Date(created + 6 * MINUTE),
    },
  });
  return { bookingId, seatId, userId };
}

const load = (id: string) =>
  testPrisma().booking.findUniqueOrThrow({ where: { id }, include: { events: true, seats: true } });

describe("booking expiry job (real database)", () => {
  it("cancels bookings past the payment window: PAYMENT_TIMEOUT, seats released, SYSTEM event", async () => {
    const { bookingId } = await pendingBooking(7);

    const result = await job().runOnce();

    expect(result.ran).toBe(true);
    expect(result.cancelled).toBeGreaterThanOrEqual(1);
    const booking = await load(bookingId);
    expect(booking).toMatchObject({ status: "CANCELLED", cancelReason: "PAYMENT_TIMEOUT" });
    expect(booking.cancelledAt).toBeTruthy();
    expect(booking.seats.every((seat) => seat.releasedAt !== null)).toBe(true);
    expect(booking.events.filter((e) => e.type === "CANCELLED").map((e) => e.actor)).toEqual([
      "SYSTEM",
    ]);
  });

  it("leaves bookings inside their payment window and confirmed ones alone", async () => {
    const fresh = await pendingBooking(2);
    const movie = await createMovie();
    const hall = await createHall({ seats: 2 });
    const showtime = await createShowtime({
      movieId: movie.id,
      hallId: hall.hallId,
      startsAt: new Date(Date.now() + 5 * HOUR),
    });
    const confirmedId = await lockSeats({
      showtimeId: showtime.id,
      seatIds: hall.seatIds.slice(0, 1),
      state: "CONFIRMED",
    });
    await testPrisma().booking.update({
      where: { id: confirmedId },
      data: {
        paymentExpiresAt: new Date(Date.now() - 10 * MINUTE),
        holdExpiresAt: new Date(Date.now() - 9 * MINUTE),
      },
    });

    await job().runOnce();

    expect((await load(fresh.bookingId)).status).toBe("PENDING_PAYMENT");
    expect((await load(confirmedId)).status).toBe("CONFIRMED");
  });

  it("is idempotent: a second run changes nothing and writes no second event", async () => {
    const { bookingId } = await pendingBooking(8);
    await job().runOnce();

    const again = await job().runOnce();

    expect(again.cancelled).toBe(0);
    expect((await load(bookingId)).events.filter((e) => e.type === "CANCELLED")).toHaveLength(1);
  });

  it("asks the gateway first and leaves a payment that is processing alone until the hold is over", async () => {
    const processing = new StubGateway("in_progress");
    const betweenWindows = await pendingBooking(5.5); // payment window over, hold not yet
    const holdOver = await pendingBooking(7); // hold over too

    const result = await job(processing).runOnce();

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect((await load(betweenWindows.bookingId)).status).toBe("PENDING_PAYMENT");
    expect((await load(holdOver.bookingId)).status).toBe("CANCELLED");
    expect(processing.calls).toContain(betweenWindows.bookingId);
  });

  it("cancels a booking between the windows when the gateway has nothing in flight", async () => {
    const { bookingId } = await pendingBooking(5.5);

    await job(new StubGateway("cancelled")).runOnce();

    expect((await load(bookingId)).status).toBe("CANCELLED");
  });

  it("deletes expired idempotency keys and keeps live ones", async () => {
    const userId = await createUser();
    const expired = randomUUID();
    const live = randomUUID();
    const base = { userId, requestHash: "h", responseStatus: 201 };
    await testPrisma().idempotencyKey.createMany({
      data: [
        { ...base, key: expired, expiresAt: new Date(Date.now() - MINUTE) },
        { ...base, key: live, expiresAt: new Date(Date.now() + HOUR) },
      ],
    });

    const result = await job().runOnce();

    expect(result.idempotencyKeysDeleted).toBeGreaterThanOrEqual(1);
    const keys = await testPrisma().idempotencyKey.findMany({ where: { userId } });
    expect(keys.map((k) => k.key)).toEqual([live]);
  });

  it("does nothing while another container holds the advisory lock", async () => {
    const { bookingId } = await pendingBooking(9);
    let result: Awaited<ReturnType<BookingExpiryService["runOnce"]>> | undefined;

    await testPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXPIRY_JOB_LOCK_ID}::bigint)`;
      result = await job().runOnce();
    });

    expect(result).toEqual({ ran: false, cancelled: 0, skipped: 0, idempotencyKeysDeleted: 0 });
    expect((await load(bookingId)).status).toBe("PENDING_PAYMENT");
    expect((await job().runOnce()).ran).toBe(true); // lock released: the next tick works
  });

  it("parallel runs (many containers) cancel each booking exactly once", async () => {
    const created = await Promise.all(Array.from({ length: 6 }, () => pendingBooking(10)));

    const results = await Promise.all([job().runOnce(), job().runOnce(), job().runOnce()]);

    expect(results.filter((r) => r.ran).length).toBeGreaterThanOrEqual(1);
    for (const { bookingId } of created) {
      const booking = await load(bookingId);
      expect(booking.status).toBe("CANCELLED");
      expect(booking.events.filter((e) => e.type === "CANCELLED")).toHaveLength(1);
    }
  });

  it("races with a user cancel without double-cancelling", async () => {
    const { bookingId } = await pendingBooking(7);

    await Promise.all([
      job().runOnce(),
      testPrisma().$transaction(async (tx) => {
        const { cancelPendingBooking } = await import("../src/booking/booking-support.js");
        await cancelPendingBooking(tx, {
          bookingId,
          reason: "USER_CANCELLED",
          actor: "USER",
          now: new Date(),
        });
      }),
    ]);

    const booking = await load(bookingId);
    expect(booking.status).toBe("CANCELLED");
    expect(booking.events.filter((e) => e.type === "CANCELLED")).toHaveLength(1);
  });

  describe("scheduled in the app", () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp({ JOBS_ENABLED: "true", JOB_INTERVAL_MS: "200" });
    });

    afterAll(async () => {
      await app.close();
    });

    it("runs on its own interval and stops with the app", async () => {
      const { bookingId } = await pendingBooking(7);

      const deadline = Date.now() + 8000;
      let status = "PENDING_PAYMENT";
      while (status === "PENDING_PAYMENT" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        status = (await load(bookingId)).status;
      }

      expect(status).toBe("CANCELLED");
    });
  });
});

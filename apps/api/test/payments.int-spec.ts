import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BookingExpiryService } from "../src/booking/booking-expiry.service.js";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import { FakePaymentProvider } from "../src/payments/fake.provider.js";
import { PaymentProvider, type ProviderEvent } from "../src/payments/payment-provider.js";
import { PaymentsService } from "../src/payments/payments.service.js";
import { createHall, createMovie, createShowtime, token } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";
import { testPrisma } from "./db.js";

interface BookingBody {
  id: string;
  status: string;
  cancelReason: string | null;
  totalBaht: number;
  ticketQr: string | null;
  bookingCode: string;
  latestPayment: {
    method: string;
    status: string;
    cardBrand: string | null;
    cardLast4: string | null;
    paidAt: string | null;
  } | null;
}
interface IntentBody {
  clientSecret: string;
  publishableKey: string;
  amountBaht: number;
  paymentExpiresAt: string;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;
const tomorrow = addDays(bangkokDateOf(new Date()), 1);

describe("payments (real database, fake provider)", () => {
  let app: NestExpressApplication;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  interface User {
    token: string;
  }
  async function newUser(): Promise<User> {
    const res = await api()
      .post("/api/v1/auth/register")
      .send({ email: `pay-${token()}@example.com`, password: "long-enough-pw", displayName: "P" });
    return { token: (res.body as { accessToken: string }).accessToken };
  }
  const authed = (user: User, method: "get" | "post", path: string) =>
    api()[method](`/api/v1${path}`).set("Authorization", `Bearer ${user.token}`);

  async function newBooking(user: User): Promise<BookingBody> {
    const movie = await createMovie();
    const hall = await createHall({ seats: 4 });
    const showtime = await createShowtime({
      movieId: movie.id,
      hallId: hall.hallId,
      startsAt: new Date(bangkokDayRange(tomorrow).start.getTime() + 15 * HOUR),
    });
    const res = await api()
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${user.token}`)
      .set("Idempotency-Key", randomUUID())
      .send({ showtimeId: showtime.id, seatIds: hall.seatIds.slice(0, 2) });
    expect(res.status).toBe(201);
    return res.body as BookingBody;
  }
  const getBooking = async (user: User, id: string): Promise<BookingBody> =>
    (await authed(user, "get", `/bookings/${id}`)).body as BookingBody;
  const intentFor = async (user: User, id: string): Promise<Response> =>
    authed(user, "post", `/bookings/${id}/payment-intent`);
  const paymentRow = (bookingId: string) =>
    testPrisma().payment.findFirstOrThrow({ where: { bookingId }, orderBy: { createdAt: "desc" } });
  const succeeded = (intentId: string, amount: number): ProviderEvent => {
    const id = `evt_${token()}`;
    return {
      id,
      type: "payment_intent.succeeded",
      intent: {
        id: intentId,
        clientSecret: "",
        status: "succeeded",
        amount,
        currency: "thb",
        bookingId: null,
        failureCode: null,
        failureMessage: null,
      },
      raw: { id },
    };
  };
  const events = async (bookingId: string): Promise<string[]> =>
    (
      await testPrisma().bookingEvent.findMany({
        where: { bookingId },
        orderBy: { createdAt: "asc" },
        select: { type: true },
      })
    ).map((e) => e.type);

  beforeAll(async () => {
    app = await createTestApp();
    payments = app.get(PaymentsService);
    const provider = app.get(PaymentProvider);
    if (!(provider instanceof FakePaymentProvider)) throw new Error("expected the fake provider");
    fake = provider;
  });

  afterAll(async () => {
    await app.close();
  });

  it("createPaymentIntent: one intent per booking, amount in baht, a PAYMENT_STARTED event", async () => {
    const user = await newUser();
    const booking = await newBooking(user);

    const [first, second] = await Promise.all([
      intentFor(user, booking.id),
      intentFor(user, booking.id),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = first.body as IntentBody;
    expect(body).toMatchObject({ publishableKey: "demo", amountBaht: booking.totalBaht });
    expect((second.body as IntentBody).clientSecret).toBe(body.clientSecret);
    expect(await testPrisma().payment.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(await events(booking.id)).toEqual(["CREATED", "PAYMENT_STARTED"]);
  });

  it("someone else's booking is a 404", async () => {
    const owner = await newUser();
    const other = await newUser();
    const booking = await newBooking(owner);
    expect((await intentFor(other, booking.id)).status).toBe(404);
  });

  it("demo pay confirms through the webhook path: CONFIRMED, ticket QR, card details", async () => {
    const user = await newUser();
    const booking = await newBooking(user);

    const res = await authed(user, "post", "/__demo/pay").send({
      bookingId: booking.id,
      method: "CARD",
    });
    expect(res.status).toBe(200);

    const after = await getBooking(user, booking.id);
    expect(after.status).toBe("CONFIRMED");
    expect(after.ticketQr).toMatch(new RegExp(`^${after.bookingCode}\\.`));
    expect(after.latestPayment).toMatchObject({
      method: "CARD",
      status: "SUCCEEDED",
      cardBrand: "mastercard",
      cardLast4: "4444",
    });
    expect(await events(booking.id)).toEqual(["CREATED", "PAYMENT_STARTED", "CONFIRMED"]);
    // Paid bookings cannot be cancelled (G5).
    expect((await authed(user, "post", `/bookings/${booking.id}/cancel`)).status).toBe(409);
  });

  it("demo pay with PromptPay records the method without card details", async () => {
    const user = await newUser();
    const booking = await newBooking(user);
    await authed(user, "post", "/__demo/pay").send({ bookingId: booking.id, method: "PROMPTPAY" });
    const after = await getBooking(user, booking.id);
    expect(after.latestPayment).toMatchObject({
      method: "PROMPTPAY",
      cardBrand: null,
      cardLast4: null,
    });
  });

  it("a duplicate event is a no-op", async () => {
    const user = await newUser();
    const booking = await newBooking(user);
    await intentFor(user, booking.id);
    const payment = await paymentRow(booking.id);
    const event = succeeded(payment.stripePaymentIntentId, booking.totalBaht * 100);

    expect(await payments.handleEvent(event)).toBe("processed");
    expect(await payments.handleEvent(event)).toBe("duplicate");
    expect(await events(booking.id)).toEqual(["CREATED", "PAYMENT_STARTED", "CONFIRMED"]);
  });

  it("an amount mismatch is not confirmed", async () => {
    const user = await newUser();
    const booking = await newBooking(user);
    await intentFor(user, booking.id);
    const payment = await paymentRow(booking.id);

    await payments.handleEvent(succeeded(payment.stripePaymentIntentId, 100));
    expect((await getBooking(user, booking.id)).status).toBe("PENDING_PAYMENT");
  });

  it("a payment that arrives after the booking was cancelled is refunded (LATE_PAYMENT_REFUNDED)", async () => {
    const user = await newUser();
    const booking = await newBooking(user);
    await intentFor(user, booking.id);
    const payment = await paymentRow(booking.id);
    // The customer pays, but the timeout cancel won the race.
    await testPrisma().booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelReason: "PAYMENT_TIMEOUT",
        cancelledAt: new Date(),
      },
    });

    await payments.handleEvent(succeeded(payment.stripePaymentIntentId, booking.totalBaht * 100));

    const after = await getBooking(user, booking.id);
    expect(after).toMatchObject({
      status: "CANCELLED",
      cancelReason: "LATE_PAYMENT_REFUNDED",
      ticketQr: null,
    });
    expect(after.latestPayment?.status).toBe("REFUNDED");
    expect(fake.isRefunded(payment.stripePaymentIntentId)).toBe(true);
    expect(await events(booking.id)).toContain("REFUNDED");
  });

  it("payment_failed keeps the booking payable; canceled closes the payment", async () => {
    const user = await newUser();
    const booking = await newBooking(user);
    await intentFor(user, booking.id);
    const payment = await paymentRow(booking.id);
    const base = succeeded(payment.stripePaymentIntentId, booking.totalBaht * 100);
    const intent = base.intent ?? fail();

    await payments.handleEvent({
      ...base,
      id: `evt_${token()}`,
      type: "payment_intent.payment_failed",
      intent: {
        ...intent,
        status: "requires_payment_method",
        failureCode: "card_declined",
        failureMessage: "Declined",
      },
    });
    expect((await paymentRow(booking.id)).status).toBe("FAILED");
    expect((await getBooking(user, booking.id)).status).toBe("PENDING_PAYMENT");
    expect(await events(booking.id)).toContain("PAYMENT_FAILED");
    // Retrying reuses the intent.
    expect((await intentFor(user, booking.id)).status).toBe(200);
    expect(await testPrisma().payment.count({ where: { bookingId: booking.id } })).toBe(1);

    await payments.handleEvent({ ...base, id: `evt_${token()}`, type: "payment_intent.canceled" });
    expect((await paymentRow(booking.id)).status).toBe("CANCELLED");
  });

  it("cancelling a booking cancels its intent; the expiry job does too", async () => {
    const user = await newUser();
    const booking = await newBooking(user);
    await intentFor(user, booking.id);
    expect((await authed(user, "post", `/bookings/${booking.id}/cancel`)).status).toBe(200);
    expect((await paymentRow(booking.id)).status).toBe("CANCELLED");

    const user2 = await newUser();
    const booking2 = await newBooking(user2);
    await intentFor(user2, booking2.id);
    await testPrisma().booking.update({
      where: { id: booking2.id },
      data: {
        paymentExpiresAt: new Date(Date.now() - 2 * MINUTE),
        holdExpiresAt: new Date(Date.now() - MINUTE),
      },
    });
    await app.get(BookingExpiryService).runOnce();
    expect((await getBooking(user2, booking2.id)).cancelReason).toBe("PAYMENT_TIMEOUT");
    expect((await paymentRow(booking2.id)).status).toBe("CANCELLED");
  });
});

function fail(): never {
  throw new Error("unreachable");
}

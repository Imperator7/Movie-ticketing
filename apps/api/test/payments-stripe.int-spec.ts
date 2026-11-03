import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BookingExpiryService } from "../src/booking/booking-expiry.service.js";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import { PaymentProvider } from "../src/payments/payment-provider.js";
import { StripePaymentProvider } from "../src/payments/stripe.provider.js";
import { createHall, createMovie, createShowtime, token } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";
import { testPrisma } from "./db.js";
import { FakeStripe, WEBHOOK_SECRET } from "./fake-stripe.js";

/**
 * The Stripe payment path end to end, over HTTP on both sides:
 *   test → our API (supertest) → StripePaymentProvider → real Stripe SDK → local fake Stripe server (fake-stripe.ts)
 *   test → signed webhook (real HMAC, raw body) → our API → database
 * Nothing in the API is mocked; only Stripe's servers are replaced. Covers the reliability rules of database-design
 * §3–5: one intent per booking, signature check, exactly-once webhooks, late payment refund, provider outage.
 */

interface BookingBody {
  id: string;
  status: string;
  cancelReason: string | null;
  totalBaht: number;
  ticketQr: string | null;
  latestPayment: {
    method: string;
    status: string;
    cardBrand: string | null;
    cardLast4: string | null;
  } | null;
}
interface ErrorBody {
  statusCode: number;
  code: string;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;
const tomorrow = addDays(bangkokDateOf(new Date()), 1);

describe("payments over HTTP with the Stripe adapter (fake Stripe server)", () => {
  const stripe = new FakeStripe();
  let app: NestExpressApplication;
  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  interface User {
    token: string;
  }
  async function newUser(): Promise<User> {
    const res = await api()
      .post("/api/v1/auth/register")
      .send({ email: `st-${token()}@example.com`, password: "long-enough-pw", displayName: "S" });
    expect(res.status).toBe(201);
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
    const res = await authed(user, "post", "/bookings")
      .set("Idempotency-Key", randomUUID())
      .send({ showtimeId: showtime.id, seatIds: hall.seatIds.slice(0, 2) });
    expect(res.status).toBe(201);
    return res.body as BookingBody;
  }
  const getBooking = async (user: User, id: string): Promise<BookingBody> =>
    (await authed(user, "get", `/bookings/${id}`)).body as BookingBody;
  const startPayment = (user: User, id: string): Promise<Response> =>
    authed(user, "post", `/bookings/${id}/payment-intent`);

  /** Stripe delivering a webhook: the exact bytes it signed, with its signature header. */
  const deliver = (payload: string, signature = stripe.sign(payload)): Promise<Response> =>
    api()
      .post("/api/v1/payments/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(payload);

  const eventTypes = async (bookingId: string): Promise<string[]> =>
    (
      await testPrisma().bookingEvent.findMany({
        where: { bookingId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { type: true },
      })
    ).map((e) => e.type);

  /** A booking with a started payment, and its intent at the fake Stripe. */
  async function bookingWithIntent(user: User) {
    const booking = await newBooking(user);
    expect((await startPayment(user, booking.id)).status).toBe(200);
    return { booking, intentId: stripe.intentForBooking(booking.id).id };
  }

  beforeAll(async () => {
    await stripe.start();
    app = await createTestApp(
      {
        PAYMENTS_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_test_integration",
        STRIPE_PUBLISHABLE_KEY: "pk_test_integration",
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      (builder) =>
        builder
          .overrideProvider(PaymentProvider)
          .useValue(
            new StripePaymentProvider(stripe.client(), "pk_test_integration", WEBHOOK_SECRET),
          ),
    );
  });

  afterAll(async () => {
    await app.close();
    await stripe.stop();
  });

  describe("createPaymentIntent", () => {
    it("creates one THB card + PromptPay intent at Stripe for exactly the booking total", async () => {
      const user = await newUser();
      const booking = await newBooking(user);

      const res = await startPayment(user, booking.id);

      expect(res.status).toBe(200);
      const intent = stripe.intentForBooking(booking.id);
      expect(res.body).toMatchObject({
        clientSecret: intent.client_secret,
        publishableKey: "pk_test_integration",
        amountBaht: booking.totalBaht,
      });
      expect(intent).toMatchObject({
        amount: booking.totalBaht * 100,
        currency: "thb",
        payment_method_types: ["card", "promptpay"],
      });
      const create = stripe.requests.find(
        (r) => r.path === "/v1/payment_intents" && r.form.get("metadata[bookingId]") === booking.id,
      );
      expect(create?.idempotencyKey).toBe(`booking:${booking.id}:1`);
      expect(await eventTypes(booking.id)).toEqual(["CREATED", "PAYMENT_STARTED"]);
    });

    it("asking again (page reload, second tab) reuses the same intent: no second charge possible", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);

      const again = await Promise.all([1, 2, 3].map(() => startPayment(user, booking.id)));

      for (const res of again) {
        expect(res.status).toBe(200);
        expect((res.body as { clientSecret: string }).clientSecret).toBe(
          stripe.intent(intentId).client_secret,
        );
      }
      expect(await testPrisma().payment.count({ where: { bookingId: booking.id } })).toBe(1);
    });

    it("Stripe down: a contract 500, no payment row, and the retry works once Stripe is back", async () => {
      const user = await newUser();
      const booking = await newBooking(user);

      stripe.failNextRequests(1);
      const failed = await startPayment(user, booking.id);
      expect(failed.status).toBe(500);
      expect(failed.body as ErrorBody).toMatchObject({ statusCode: 500, code: "INTERNAL_ERROR" });
      expect(await testPrisma().payment.count({ where: { bookingId: booking.id } })).toBe(0);
      expect((await getBooking(user, booking.id)).status).toBe("PENDING_PAYMENT");

      const retry = await startPayment(user, booking.id);
      expect(retry.status).toBe(200);
      expect(await testPrisma().payment.count({ where: { bookingId: booking.id } })).toBe(1);
    });
  });

  describe("webhook signature (the only way a booking gets confirmed)", () => {
    it("a correctly signed payment_intent.succeeded confirms the booking with the card details", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");

      const res = await deliver(stripe.event("payment_intent.succeeded", intentId));

      expect(res.status).toBe(200);
      const after = await getBooking(user, booking.id);
      expect(after.status).toBe("CONFIRMED");
      expect(after.ticketQr).toEqual(expect.any(String));
      expect(after.latestPayment).toMatchObject({
        method: "CARD",
        status: "SUCCEEDED",
        cardBrand: "mastercard",
        cardLast4: "4444",
      });
      expect(await eventTypes(booking.id)).toEqual(["CREATED", "PAYMENT_STARTED", "CONFIRMED"]);
    });

    it("PromptPay is recorded as PromptPay, without card details", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "promptpay");

      expect((await deliver(stripe.event("payment_intent.succeeded", intentId))).status).toBe(200);

      expect((await getBooking(user, booking.id)).latestPayment).toMatchObject({
        method: "PROMPTPAY",
        cardBrand: null,
        cardLast4: null,
      });
    });

    it("rejects a forged, tampered, unsigned or stale event with 400 and changes nothing", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");
      const payload = stripe.event("payment_intent.succeeded", intentId);
      const eventId = (JSON.parse(payload) as { id: string }).id;
      const stale = `t=${String(Math.floor(Date.now() / 1000) - 3600)},v1=${"0".repeat(64)}`;

      const attempts = [
        deliver(payload, stripe.sign(payload, "whsec_attacker")),
        deliver(
          payload.replace(`"amount":${String(booking.totalBaht * 100)}`, '"amount":1'),
          stripe.sign(payload),
        ),
        deliver(payload, stale),
        api()
          .post("/api/v1/payments/webhook")
          .set("Content-Type", "application/json")
          .send(payload),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(400);
        expect(res.body as ErrorBody).toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
      }

      expect((await getBooking(user, booking.id)).status).toBe("PENDING_PAYMENT");
      expect(await testPrisma().stripeEvent.count({ where: { id: eventId } })).toBe(0);
    });

    it("verifies the raw bytes: whitespace Stripe added is fine as long as the signature covers it", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");
      const pretty = JSON.stringify(
        JSON.parse(stripe.event("payment_intent.succeeded", intentId)),
        null,
        2,
      );

      expect((await deliver(pretty)).status).toBe(200);
      expect((await getBooking(user, booking.id)).status).toBe("CONFIRMED");
    });
  });

  describe("exactly once", () => {
    it("the same event delivered again (Stripe retries) is a no-op: one confirmation, one event row", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");
      const payload = stripe.event("payment_intent.succeeded", intentId);

      expect((await deliver(payload)).status).toBe(200);
      expect((await deliver(payload)).status).toBe(200);

      const id = (JSON.parse(payload) as { id: string }).id;
      expect(await testPrisma().stripeEvent.count({ where: { id } })).toBe(1);
      expect((await eventTypes(booking.id)).filter((t) => t === "CONFIRMED")).toHaveLength(1);
    });

    it("the same event delivered 5 times at once: exactly one confirmation, no refund", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");
      const payload = stripe.event("payment_intent.succeeded", intentId);

      const results = await Promise.all([1, 2, 3, 4, 5].map(() => deliver(payload)));

      // The losers of the race may get a 5xx; Stripe then retries them and they become duplicates.
      expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
      expect((await deliver(payload)).status).toBe(200);
      expect((await eventTypes(booking.id)).filter((t) => t === "CONFIRMED")).toHaveLength(1);
      expect(stripe.refunds.filter((r) => r.paymentIntent === intentId)).toHaveLength(0);
    });

    it("two different events for the same success (Stripe sends a second one): still one confirmation", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");

      expect((await deliver(stripe.event("payment_intent.succeeded", intentId))).status).toBe(200);
      expect((await deliver(stripe.event("payment_intent.succeeded", intentId))).status).toBe(200);

      expect((await eventTypes(booking.id)).filter((t) => t === "CONFIRMED")).toHaveLength(1);
      expect(stripe.refunds.filter((r) => r.paymentIntent === intentId)).toHaveLength(0);
    });

    it("an event type the API does not handle is stored and acknowledged, so Stripe stops retrying", async () => {
      const user = await newUser();
      const { intentId } = await bookingWithIntent(user);
      const payload = stripe.event("payment_intent.created", intentId);

      expect((await deliver(payload)).status).toBe(200);

      const id = (JSON.parse(payload) as { id: string }).id;
      const row = await testPrisma().stripeEvent.findUniqueOrThrow({ where: { id } });
      expect(row.processedAt).not.toBeNull();
    });
  });

  describe("declines, late payments and cancellation", () => {
    it("a declined card keeps the booking payable; the customer retries on the same intent and pays", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);

      stripe.decline(intentId);
      expect((await deliver(stripe.event("payment_intent.payment_failed", intentId))).status).toBe(
        200,
      );

      const declined = await getBooking(user, booking.id);
      expect(declined.status).toBe("PENDING_PAYMENT");
      expect(declined.latestPayment).toMatchObject({ status: "FAILED", cardLast4: "0002" });
      const row = await testPrisma().payment.findFirstOrThrow({ where: { bookingId: booking.id } });
      expect(row.failureCode).toBe("card_declined");

      const retry = await startPayment(user, booking.id);
      expect((retry.body as { clientSecret: string }).clientSecret).toBe(
        stripe.intent(intentId).client_secret,
      );
      stripe.pay(intentId, "card");
      expect((await deliver(stripe.event("payment_intent.succeeded", intentId))).status).toBe(200);
      expect((await getBooking(user, booking.id)).status).toBe("CONFIRMED");
      expect(await eventTypes(booking.id)).toEqual([
        "CREATED",
        "PAYMENT_STARTED",
        "PAYMENT_FAILED",
        "CONFIRMED",
      ]);
    });

    it("paid but the webhook came after the hold ended: the booking stays cancelled and Stripe refunds once", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card"); // the customer paid, but the webhook is delayed

      // 10 minutes later the expiry job runs: Stripe says succeeded (in progress) but the 6-minute hold is over.
      const result = await app
        .get(BookingExpiryService)
        .runOnce(new Date(Date.now() + 10 * MINUTE));
      expect(result.cancelled).toBeGreaterThanOrEqual(1);
      expect((await getBooking(user, booking.id)).status).toBe("CANCELLED");

      const payload = stripe.event("payment_intent.succeeded", intentId);
      expect((await deliver(payload)).status).toBe(200);
      expect((await deliver(stripe.event("payment_intent.succeeded", intentId))).status).toBe(200);

      const after = await getBooking(user, booking.id);
      expect(after).toMatchObject({ status: "CANCELLED", cancelReason: "LATE_PAYMENT_REFUNDED" });
      expect(after.latestPayment?.status).toBe("REFUNDED");
      const refunds = stripe.refunds.filter((r) => r.paymentIntent === intentId);
      expect(refunds).toEqual([{ paymentIntent: intentId, idempotencyKey: `refund:${intentId}` }]);
      expect(await eventTypes(booking.id)).toEqual([
        "CREATED",
        "PAYMENT_STARTED",
        "CANCELLED",
        "REFUNDED",
      ]);
    });

    it("the expiry job leaves a payment that is still processing alone while the hold lasts", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.intent(intentId).status = "processing"; // e.g. a PromptPay transfer on its way

      // 5.5 minutes: the payment window (5 min) is over, the hold (6 min) is not.
      await app.get(BookingExpiryService).runOnce(new Date(Date.now() + 5.5 * MINUTE));

      expect((await getBooking(user, booking.id)).status).toBe("PENDING_PAYMENT");
      expect(stripe.intent(intentId).status).toBe("processing");
    });

    it("the user cancels: the intent is cancelled at Stripe first, so it can no longer be paid", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);

      const res = await authed(user, "post", `/bookings/${booking.id}/cancel`);

      expect(res.status).toBe(200);
      expect(stripe.intent(intentId).status).toBe("canceled");
      const row = await testPrisma().payment.findFirstOrThrow({ where: { bookingId: booking.id } });
      expect(row.status).toBe("CANCELLED");
      expect((await deliver(stripe.event("payment_intent.canceled", intentId))).status).toBe(200);
    });

    it("an amount that does not match the booking is never confirmed: Stripe refunds it once", async () => {
      const user = await newUser();
      const { booking, intentId } = await bookingWithIntent(user);
      stripe.pay(intentId, "card");
      stripe.intent(intentId).amount = 100; // e.g. someone edited the intent at Stripe

      expect((await deliver(stripe.event("payment_intent.succeeded", intentId))).status).toBe(200);

      expect(await getBooking(user, booking.id)).toMatchObject({
        status: "CANCELLED",
        cancelReason: "AMOUNT_MISMATCH_REFUNDED",
      });
      expect(await eventTypes(booking.id)).not.toContain("CONFIRMED");
      const refunds = stripe.refunds.filter((r) => r.paymentIntent === intentId);
      expect(refunds).toEqual([{ paymentIntent: intentId, idempotencyKey: `refund:${intentId}` }]);
    });
  });
});

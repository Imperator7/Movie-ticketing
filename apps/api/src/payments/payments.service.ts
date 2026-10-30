import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FakePaymentProvider } from "./fake.provider.js";
import {
  PaymentProvider,
  toStripeAmount,
  type ProviderEvent,
  type ProviderIntent,
} from "./payment-provider.js";

export interface PaymentIntentBody {
  clientSecret: string;
  publishableKey: string;
  amountBaht: number;
  paymentExpiresAt: string;
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

/** Intent statuses that can still be paid, so an existing intent is reused instead of creating another. */
const REUSABLE = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "Booking not found");
const notPending = (): AppException =>
  new AppException(
    ErrorCode.BOOKING_NOT_PENDING,
    HttpStatus.CONFLICT,
    "This booking is no longer pending payment",
  );

type Tx = Prisma.TransactionClient;
type EventIntent = NonNullable<ProviderEvent["intent"]>;

/**
 * Payments (docs/openapi.yaml `Payments`, database-design §3–5). A booking is confirmed ONLY here, from a verified
 * `payment_intent.succeeded`, never by the browser.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
  ) {}

  // ------------------------------------------------------------------ createPaymentIntent

  /**
   * Creates or reuses the booking's PaymentIntent. No row locks around the network call: concurrent calls use the
   * same provider idempotency key (`booking:<id>:<attempt>`), get the same intent, and the unique
   * `stripe_payment_intent_id` keeps one payments row.
   */
  async createPaymentIntent(
    userId: string,
    bookingId: string,
    now: Date = new Date(),
  ): Promise<PaymentIntentBody> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: {
        id: true,
        bookingCode: true,
        status: true,
        totalBaht: true,
        paymentExpiresAt: true,
        payments: {
          select: { stripePaymentIntentId: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!booking) throw notFound();
    if (booking.status !== "PENDING_PAYMENT") throw notPending();
    if (now.getTime() >= booking.paymentExpiresAt.getTime()) {
      throw new AppException(
        ErrorCode.PAYMENT_WINDOW_CLOSED,
        HttpStatus.UNPROCESSABLE_ENTITY,
        "The payment window has closed",
      );
    }

    const body = (intent: ProviderIntent): PaymentIntentBody => ({
      clientSecret: intent.clientSecret,
      publishableKey: this.provider.publishableKey,
      amountBaht: booking.totalBaht,
      paymentExpiresAt: booking.paymentExpiresAt.toISOString(),
    });

    const latest = booking.payments.find((p) => p.status === "PENDING" || p.status === "FAILED");
    if (latest) {
      const intent = await this.provider.retrieveIntent(latest.stripePaymentIntentId);
      if (REUSABLE.has(intent.status) && intent.clientSecret !== "") return body(intent);
    }

    const attempt = booking.payments.length + 1;
    const intent = await this.provider.createIntent({
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      amountSatang: toStripeAmount(booking.totalBaht),
      idempotencyKey: `booking:${booking.id}:${String(attempt)}`,
    });

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.createMany({
        data: [
          {
            bookingId: booking.id,
            stripePaymentIntentId: intent.id,
            // The customer picks card or PromptPay in the Payment Element; the webhook records the real method.
            method: "CARD",
            status: "PENDING",
            amountBaht: booking.totalBaht,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 1) {
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: "PAYMENT_STARTED",
            actor: "USER",
            data: { paymentIntentId: intent.id, attempt },
          },
        });
      }
    });
    return body(intent);
  }

  // ------------------------------------------------------------------ webhook

  /**
   * Handles a verified provider event exactly once: the event id goes into `stripe_events` first, in the same
   * transaction as its effects, so a duplicate delivery is a no-op and a failure rolls back (Stripe retries).
   */
  async handleEvent(event: ProviderEvent, now: Date = new Date()): Promise<WebhookOutcome> {
    return this.prisma.$transaction(
      async (tx): Promise<WebhookOutcome> => {
        const inserted = await tx.stripeEvent.createMany({
          data: [{ id: event.id, type: event.type, payload: event.raw as Prisma.InputJsonValue }],
          skipDuplicates: true,
        });
        if (inserted.count === 0) return "duplicate";

        let outcome: WebhookOutcome = "ignored";
        if (event.intent) {
          switch (event.type) {
            case "payment_intent.succeeded":
              await this.onSucceeded(tx, event.intent, now);
              outcome = "processed";
              break;
            case "payment_intent.payment_failed":
              await this.onFailed(tx, event.intent);
              outcome = "processed";
              break;
            case "payment_intent.canceled":
              await tx.payment.updateMany({
                where: {
                  stripePaymentIntentId: event.intent.id,
                  status: { in: ["PENDING", "FAILED"] },
                },
                data: { status: "CANCELLED" },
              });
              outcome = "processed";
              break;
            default:
              break;
          }
        }
        await tx.stripeEvent.update({ where: { id: event.id }, data: { processedAt: now } });
        return outcome;
      },
      { timeout: 30_000 },
    );
  }

  private async paymentFor(tx: Tx, intent: EventIntent) {
    const existing = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
    if (existing) return existing;
    // The row write after creating the intent failed: rebuild it from metadata.bookingId.
    if (!intent.bookingId) return null;
    const booking = await tx.booking.findUnique({
      where: { id: intent.bookingId },
      select: { id: true, totalBaht: true },
    });
    if (!booking) return null;
    return tx.payment.create({
      data: {
        bookingId: booking.id,
        stripePaymentIntentId: intent.id,
        method: "CARD",
        status: "PENDING",
        amountBaht: booking.totalBaht,
      },
    });
  }

  private async onSucceeded(tx: Tx, intent: EventIntent, now: Date): Promise<void> {
    const payment = await this.paymentFor(tx, intent);
    if (!payment) {
      this.logger.error({ event: "payment_unknown_intent", paymentIntentId: intent.id });
      return;
    }
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: payment.bookingId },
      select: { id: true, status: true, totalBaht: true },
    });

    // Never trust the amount blindly: a mismatch is an alert, not a confirmation.
    if (intent.amount !== toStripeAmount(booking.totalBaht) || intent.currency !== "thb") {
      this.logger.error({
        event: "payment_amount_mismatch",
        bookingId: booking.id,
        paymentIntentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        expected: toStripeAmount(booking.totalBaht),
      });
      return;
    }

    const details = await this.provider.paymentDetails(intent.id);
    const paid = { ...details, paidAt: now };

    const confirmed = await tx.booking.updateMany({
      where: { id: booking.id, status: "PENDING_PAYMENT" },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    if (confirmed.count === 1) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", ...paid },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: "CONFIRMED",
          actor: "STRIPE",
          data: { paymentIntentId: intent.id, method: details.method },
        },
      });
      return;
    }

    const current = await tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true },
    });
    const otherSucceeded =
      current.status === "CONFIRMED" &&
      (await tx.payment.count({
        where: { bookingId: booking.id, status: "SUCCEEDED", NOT: { id: payment.id } },
      })) > 0;

    if (current.status === "CONFIRMED" && !otherSucceeded) {
      // Already confirmed by this same payment (a replay with a new event id).
      await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "SUCCEEDED" } },
        data: { status: "SUCCEEDED", ...paid },
      });
      return;
    }

    // Paid too late (booking CANCELLED) or paid twice: give the money back (rule 3d).
    await this.provider.refund(intent.id);
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", ...paid, refundedAt: now },
    });
    if (current.status === "CANCELLED") {
      await tx.booking.updateMany({
        where: { id: booking.id, status: "CANCELLED" },
        data: { cancelReason: "LATE_PAYMENT_REFUNDED" },
      });
    }
    await tx.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type: "REFUNDED",
        actor: "STRIPE",
        data: {
          paymentIntentId: intent.id,
          reason: current.status === "CANCELLED" ? "LATE_PAYMENT" : "DUPLICATE_PAYMENT",
        },
      },
    });
    this.logger.warn({
      event: "payment_refunded",
      bookingId: booking.id,
      paymentIntentId: intent.id,
    });
  }

  private async onFailed(tx: Tx, intent: EventIntent): Promise<void> {
    const payment = await this.paymentFor(tx, intent);
    if (!payment) return;
    const details = await this.provider.paymentDetails(intent.id);
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", "FAILED"] } },
      data: {
        status: "FAILED",
        method: details.method,
        cardBrand: details.cardBrand,
        cardLast4: details.cardLast4,
        failureCode: intent.failureCode,
        failureMessage: intent.failureMessage,
      },
    });
    if (updated.count === 1) {
      await tx.bookingEvent.create({
        data: {
          bookingId: payment.bookingId,
          type: "PAYMENT_FAILED",
          actor: "STRIPE",
          data: { paymentIntentId: intent.id, code: intent.failureCode },
        },
      });
    }
  }

  // ------------------------------------------------------------------ demo (fake provider only)

  /**
   * `POST /__demo/pay`: the fake provider's "customer pays". Creates/reuses the intent, then runs the synthetic
   * `payment_intent.succeeded` through the real webhook handler, so the booking rules are exactly the same.
   */
  async demoPay(
    userId: string,
    bookingId: string,
    method: "CARD" | "PROMPTPAY",
    now: Date = new Date(),
  ): Promise<{ result: "processing" }> {
    if (!(this.provider instanceof FakePaymentProvider)) throw notFound();
    await this.createPaymentIntent(userId, bookingId, now);
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: { in: ["PENDING", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      select: { stripePaymentIntentId: true },
    });
    if (!payment) throw notPending();
    const event = this.provider.simulatePayment(payment.stripePaymentIntentId, method);
    if (event) await this.handleEvent(event, now);
    return { result: "processing" };
  }
}

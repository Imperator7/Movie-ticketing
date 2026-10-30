import { randomUUID } from "node:crypto";
import type { CancelOutcome } from "../booking/payment-gateway.js";
import {
  InvalidSignatureError,
  PaymentProvider,
  type PaymentDetails,
  type ProviderEvent,
  type ProviderIntent,
} from "./payment-provider.js";

interface FakeIntent extends ProviderIntent {
  details: PaymentDetails;
  refunded: boolean;
}

/**
 * In-process stand-in for Stripe (PAYMENTS_PROVIDER=fake): local work, tests and demos without a Stripe account.
 * Same port, same booking rules; the "customer pays" step is `POST /__demo/pay`, which feeds a synthetic
 * `payment_intent.succeeded` through the real webhook handler. State is in memory, which is fine for a stand-in.
 */
export class FakePaymentProvider extends PaymentProvider {
  readonly kind = "fake" as const;
  readonly publishableKey = "demo";
  private readonly intents = new Map<string, FakeIntent>();
  private readonly byIdempotencyKey = new Map<string, string>();

  createIntent(input: {
    bookingId: string;
    bookingCode: string;
    amountSatang: number;
    idempotencyKey: string;
  }): Promise<ProviderIntent> {
    const existing = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existing) return this.retrieveIntent(existing);
    const id = `pi_fake_${randomUUID().replaceAll("-", "")}`;
    const intent: FakeIntent = {
      id,
      clientSecret: `${id}_secret_demo`,
      status: "requires_payment_method",
      amount: input.amountSatang,
      currency: "thb",
      bookingId: input.bookingId,
      details: { method: "CARD", cardBrand: null, cardLast4: null },
      refunded: false,
    };
    this.intents.set(id, intent);
    this.byIdempotencyKey.set(input.idempotencyKey, id);
    return Promise.resolve(this.view(intent));
  }

  retrieveIntent(intentId: string): Promise<ProviderIntent> {
    const intent = this.intents.get(intentId);
    // Unknown after a restart: treat it as cancelled so a fresh one is created.
    if (!intent) {
      return Promise.resolve({
        id: intentId,
        clientSecret: "",
        status: "canceled",
        amount: 0,
        currency: "thb",
        bookingId: null,
      });
    }
    return Promise.resolve(this.view(intent));
  }

  cancelIntent(intentId: string): Promise<CancelOutcome> {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status === "canceled") return Promise.resolve("nothing_to_cancel");
    if (intent.status === "succeeded" || intent.status === "processing") {
      return Promise.resolve("in_progress");
    }
    intent.status = "canceled";
    return Promise.resolve("cancelled");
  }

  refund(intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (intent) intent.refunded = true;
    return Promise.resolve();
  }

  paymentDetails(intentId: string): Promise<PaymentDetails> {
    return Promise.resolve(
      this.intents.get(intentId)?.details ?? { method: "CARD", cardBrand: null, cardLast4: null },
    );
  }

  parseWebhook(): ProviderEvent {
    // The fake never receives real webhooks.
    throw new InvalidSignatureError();
  }

  /** The demo "customer pays": marks the intent succeeded and returns the event Stripe would have sent. */
  simulatePayment(intentId: string, method: "CARD" | "PROMPTPAY"): ProviderEvent | null {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status === "canceled" || intent.status === "succeeded") return null;
    intent.status = "succeeded";
    intent.details =
      method === "CARD"
        ? { method, cardBrand: "mastercard", cardLast4: "4444" }
        : { method, cardBrand: null, cardLast4: null };
    const id = `evt_fake_${randomUUID().replaceAll("-", "")}`;
    const view = this.view(intent);
    return {
      id,
      type: "payment_intent.succeeded",
      intent: { ...view, failureCode: null, failureMessage: null },
      raw: { id, type: "payment_intent.succeeded", fake: true, data: { object: view } },
    };
  }

  isRefunded(intentId: string): boolean {
    return this.intents.get(intentId)?.refunded ?? false;
  }

  private view(intent: FakeIntent): ProviderIntent {
    const { details: _details, refunded: _refunded, ...rest } = intent;
    return { ...rest };
  }
}

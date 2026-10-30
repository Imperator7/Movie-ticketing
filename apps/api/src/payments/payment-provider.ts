import type { CancelOutcome } from "../booking/payment-gateway.js";

export type PaymentMethodKind = "CARD" | "PROMPTPAY";

/** What the API needs to know about a PaymentIntent, whatever the provider. Amounts are in satang (Stripe units). */
export interface ProviderIntent {
  id: string;
  clientSecret: string;
  /** Stripe statuses: requires_payment_method, processing, succeeded, canceled, ... */
  status: string;
  amount: number;
  currency: string;
  bookingId: string | null;
}

export interface PaymentDetails {
  method: PaymentMethodKind;
  cardBrand: string | null;
  cardLast4: string | null;
}

/** A verified webhook event, reduced to the PaymentIntent events the API handles. */
export interface ProviderEvent {
  id: string;
  type: string;
  /** Set for `payment_intent.*` events. */
  intent: (ProviderIntent & { failureCode: string | null; failureMessage: string | null }) | null;
  /** The original event, stored in `stripe_events.payload`. */
  raw: unknown;
}

export class InvalidSignatureError extends Error {
  constructor() {
    super("Invalid webhook signature");
    this.name = "InvalidSignatureError";
  }
}

/**
 * Port to the payment provider (Stripe, or the in-process fake). Every call that creates something takes an
 * idempotency key, so retries never create a second PaymentIntent or refund.
 */
export abstract class PaymentProvider {
  /** `stripe` or `fake`; the web picks its payment panel from the publishable key it gets. */
  abstract readonly kind: "stripe" | "fake";
  abstract readonly publishableKey: string;

  abstract createIntent(input: {
    bookingId: string;
    bookingCode: string;
    amountSatang: number;
    idempotencyKey: string;
  }): Promise<ProviderIntent>;

  abstract retrieveIntent(intentId: string): Promise<ProviderIntent>;

  /** `in_progress` when the intent is processing or already succeeded: the webhook decides, do not cancel. */
  abstract cancelIntent(intentId: string): Promise<CancelOutcome>;

  abstract refund(intentId: string): Promise<void>;

  abstract paymentDetails(intentId: string): Promise<PaymentDetails>;

  /** Verifies the signature against the RAW body; throws InvalidSignatureError. */
  abstract parseWebhook(rawBody: Buffer, signature: string): ProviderEvent;
}

/** THB is a two-decimal currency for Stripe: 440 baht = 44000 satang (database-design §2). */
export function toStripeAmount(baht: number): number {
  if (!Number.isInteger(baht) || baht <= 0)
    throw new RangeError(`invalid baht amount: ${String(baht)}`);
  return baht * 100;
}

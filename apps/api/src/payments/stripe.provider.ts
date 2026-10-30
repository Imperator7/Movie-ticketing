import Stripe from "stripe";
import type { CancelOutcome } from "../booking/payment-gateway.js";
import {
  InvalidSignatureError,
  PaymentProvider,
  type PaymentDetails,
  type ProviderEvent,
  type ProviderIntent,
} from "./payment-provider.js";

const toIntent = (pi: Stripe.PaymentIntent): ProviderIntent => ({
  id: pi.id,
  clientSecret: pi.client_secret ?? "",
  status: pi.status,
  amount: pi.amount,
  currency: pi.currency,
  bookingId: pi.metadata.bookingId ?? null,
});

/** Statuses where cancelling would race a payment that is already happening. */
const IN_PROGRESS = new Set<Stripe.PaymentIntent.Status>([
  "processing",
  "succeeded",
  "requires_capture",
]);

/** Stripe adapter (API-10). Card + PromptPay in THB, metadata.bookingId on every PaymentIntent. */
export class StripePaymentProvider extends PaymentProvider {
  readonly kind = "stripe" as const;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    readonly publishableKey: string,
    private readonly webhookSecret: string,
  ) {
    super();
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000 });
  }

  async createIntent(input: {
    bookingId: string;
    bookingCode: string;
    amountSatang: number;
    idempotencyKey: string;
  }): Promise<ProviderIntent> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: input.amountSatang,
        currency: "thb",
        payment_method_types: ["card", "promptpay"],
        description: `Movie tickets ${input.bookingCode}`,
        metadata: { bookingId: input.bookingId, bookingCode: input.bookingCode },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return toIntent(pi);
  }

  async retrieveIntent(intentId: string): Promise<ProviderIntent> {
    return toIntent(await this.stripe.paymentIntents.retrieve(intentId));
  }

  async cancelIntent(intentId: string): Promise<CancelOutcome> {
    const current = await this.stripe.paymentIntents.retrieve(intentId);
    if (current.status === "canceled") return "nothing_to_cancel";
    if (IN_PROGRESS.has(current.status)) return "in_progress";
    try {
      await this.stripe.paymentIntents.cancel(intentId);
      return "cancelled";
    } catch (error) {
      // It moved on between retrieve and cancel (e.g. the customer just paid).
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        const again = await this.stripe.paymentIntents.retrieve(intentId);
        if (again.status === "canceled") return "nothing_to_cancel";
        if (IN_PROGRESS.has(again.status)) return "in_progress";
      }
      throw error;
    }
  }

  async refund(intentId: string): Promise<void> {
    await this.stripe.refunds.create(
      { payment_intent: intentId, reason: "requested_by_customer" },
      { idempotencyKey: `refund:${intentId}` },
    );
  }

  async paymentDetails(intentId: string): Promise<PaymentDetails> {
    const pi = await this.stripe.paymentIntents.retrieve(intentId, {
      expand: ["latest_charge", "last_payment_error.payment_method"],
    });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const details = charge?.payment_method_details;
    const failedType = pi.last_payment_error?.payment_method?.type;
    const type = details?.type ?? failedType ?? "card";
    if (type === "promptpay") return { method: "PROMPTPAY", cardBrand: null, cardLast4: null };
    const card = details?.card ?? pi.last_payment_error?.payment_method?.card ?? null;
    return { method: "CARD", cardBrand: card?.brand ?? null, cardLast4: card?.last4 ?? null };
  }

  parseWebhook(rawBody: Buffer, signature: string): ProviderEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new InvalidSignatureError();
    }
    const object = event.data.object as { object?: string };
    const intent =
      event.type.startsWith("payment_intent.") && object.object === "payment_intent"
        ? (object as Stripe.PaymentIntent)
        : null;
    return {
      id: event.id,
      type: event.type,
      intent: intent
        ? {
            ...toIntent(intent),
            failureCode: intent.last_payment_error?.code ?? null,
            failureMessage: intent.last_payment_error?.message ?? null,
          }
        : null,
      raw: event,
    };
  }
}

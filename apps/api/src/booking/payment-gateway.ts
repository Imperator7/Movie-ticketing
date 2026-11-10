import { Injectable } from "@nestjs/common";

/**
 * - `cancelled`: the PaymentIntent was cancelled.
 * - `nothing_to_cancel`: there is no PaymentIntent for the booking (or it is already cancelled).
 * - `in_progress`: Stripe says it is processing or already succeeded, so the webhook decides; do NOT cancel.
 */
export type CancelOutcome = "cancelled" | "nothing_to_cancel" | "in_progress";

/**
 * One outcome for a booking with several intents: `in_progress` wins (the webhook decides), then `cancelled` if
 * anything was cancelled, else `nothing_to_cancel`.
 */
export function combineCancelOutcomes(outcomes: Iterable<CancelOutcome>): CancelOutcome {
  let result: CancelOutcome = "nothing_to_cancel";
  for (const outcome of outcomes) {
    if (outcome === "in_progress") return "in_progress";
    if (outcome === "cancelled") result = "cancelled";
  }
  return result;
}

/**
 * Port to the payment provider. Booking code only knows this contract; Phase 5 swaps the adapter for Stripe
 * (`stripe.paymentIntents.cancel`) without touching the booking logic.
 */
export abstract class PaymentGateway {
  abstract cancelPaymentIntent(bookingId: string): Promise<CancelOutcome>;
}

/** Until Stripe exists no booking has a PaymentIntent, so there is never anything to cancel. */
@Injectable()
export class NoopPaymentGateway extends PaymentGateway {
  cancelPaymentIntent(_bookingId: string): Promise<CancelOutcome> {
    return Promise.resolve("nothing_to_cancel");
  }
}

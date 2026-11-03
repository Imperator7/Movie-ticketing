import { toStripeAmount, type ProviderIntent } from "./payment-provider.js";

/**
 * The payment decisions, without the database or the provider, so each rule has its own unit test.
 * PaymentsService does the I/O and asks these functions what to do (database-design §3–5, rule 3d).
 */

/** Intent statuses that can still be paid, so createPaymentIntent reuses the intent instead of creating another. */
const REUSABLE_STATUSES: ReadonlySet<string> = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

/** An existing intent is handed out again only while it can still be paid and has a client secret. */
export function canReuseIntent(intent: Pick<ProviderIntent, "status" | "clientSecret">): boolean {
  return REUSABLE_STATUSES.has(intent.status) && intent.clientSecret !== "";
}

/** A succeeded intent may confirm a booking only for exactly the booking's total, in THB. */
export function amountMatches(
  intent: Pick<ProviderIntent, "amount" | "currency">,
  totalBaht: number,
): boolean {
  return intent.amount === toStripeAmount(totalBaht) && intent.currency === "thb";
}

/**
 * What to do with a succeeded payment that could NOT confirm its booking (the guarded
 * `PENDING_PAYMENT → CONFIRMED` update matched nothing):
 * - `already_confirmed`: this same payment confirmed it before (a replay under a new event id), nothing to do,
 * - `refund_late`: the booking was cancelled first (time's up or the user cancelled): refund, LATE_PAYMENT_REFUNDED,
 * - `refund_duplicate`: another payment already confirmed it: refund this second one.
 */
export type UnconfirmedPaymentAction = "already_confirmed" | "refund_late" | "refund_duplicate";

export function actionForUnconfirmedPayment(
  bookingStatus: string,
  anotherPaymentSucceeded: boolean,
): UnconfirmedPaymentAction {
  if (bookingStatus === "CANCELLED") return "refund_late";
  if (bookingStatus === "CONFIRMED" && !anotherPaymentSucceeded) return "already_confirmed";
  return "refund_duplicate";
}

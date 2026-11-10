import { createHash, createHmac, randomInt } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import type { CancelOutcome } from "./payment-gateway.js";

// ---------------------------------------------------------------- booking code

/** No 0/O/1/I/L, so a code read aloud or typed from a ticket is hard to get wrong. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/** `MT-7KQ2XP`: short, human friendly, encoded in the ticket QR. */
export function generateBookingCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  return `MT-${code}`;
}

// ---------------------------------------------------------------- ticket QR

/** `<bookingCode>.<hmac>`: cannot be forged without TICKET_QR_SECRET. */
export function signTicket(bookingCode: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(bookingCode).digest("base64url");
  return `${bookingCode}.${signature}`;
}

// ---------------------------------------------------------------- idempotency

/**
 * Hash of what makes two createBooking requests "the same": showtime and the seat set (order does not matter).
 * The key is per user, so the user id is not part of it.
 */
export function hashCreateBookingRequest(body: {
  showtimeId: string;
  seatIds: readonly string[];
}): string {
  const canonical = JSON.stringify({
    method: "POST",
    path: "/bookings",
    showtimeId: body.showtimeId,
    seatIds: [...body.seatIds].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------- expiry

/**
 * The expiry job's rule for a booking whose payment window (5 min) is over: cancel it, unless the provider says a
 * payment is already in flight (`in_progress`) and the seat hold (6 min) is not over yet; then the webhook decides.
 * Once the hold is over it is cancelled regardless (a late success is refunded, rule 3d).
 */
export function shouldExpireBooking(
  gatewayOutcome: CancelOutcome,
  holdExpiresAt: Date,
  now: Date,
): boolean {
  const holdOver = holdExpiresAt.getTime() <= now.getTime();
  return gatewayOutcome !== "in_progress" || holdOver;
}

// ---------------------------------------------------------------- state change

/**
 * The one place a PENDING_PAYMENT booking becomes CANCELLED: a guarded UPDATE (`WHERE status = 'PENDING_PAYMENT'`)
 * so the user, the expiry job and a webhook can never both win, then seats are released and the audit event is
 * written in the SAME transaction (database-design §3, §15). Returns false when someone else got there first.
 */
export async function cancelPendingBooking(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    reason: "PAYMENT_TIMEOUT" | "USER_CANCELLED" | "AMOUNT_MISMATCH_REFUNDED";
    actor: "USER" | "SYSTEM" | "STRIPE";
    now: Date;
  },
): Promise<boolean> {
  const updated = await tx.booking.updateMany({
    where: { id: input.bookingId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", cancelReason: input.reason, cancelledAt: input.now },
  });
  if (updated.count === 0) return false;

  await tx.bookingSeat.updateMany({
    where: { bookingId: input.bookingId, releasedAt: null },
    data: { releasedAt: input.now },
  });
  await tx.bookingEvent.create({
    data: {
      bookingId: input.bookingId,
      type: "CANCELLED",
      actor: input.actor,
      data: { reason: input.reason },
    },
  });
  return true;
}

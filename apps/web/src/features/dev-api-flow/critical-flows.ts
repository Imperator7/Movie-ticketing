/**
 * Code-review walkthroughs of the critical endpoints for the dev-only `/critical-flows` page: each flow lists, in
 * the order the code runs, the design rule, the exact lines that implement it, what a reviewer should check, the
 * database constraint behind it and the tests that cover it. The words are hand-written; the code is read from the
 * repo on every request through text anchors, and critical-flows.test.ts fails when an anchor stops matching.
 */

/** Where code lives: a whole definition (`def`), or the lines from the line containing `from` to the one ending `to`. */
export type CodeSpan =
  | { file: string; def: string; label?: string }
  | { file: string; from: string; to?: string; label?: string };

export interface TestRef {
  file: string;
  /** The exact `it("…")` title. */
  name: string;
}

/** matches = does what the design says; note = a trade-off worth knowing; gap = something to fix or decide. */
export type Verdict = "matches" | "note" | "gap";

export interface Checkpoint {
  /** What must be true (the design's rule, in plain words). */
  rule: string;
  /** Where the design says it. */
  design?: string;
  /** How the code does it. */
  how: string;
  /** Questions to answer while reading the code. */
  review: readonly string[];
  code: readonly CodeSpan[];
  db?: readonly CodeSpan[];
  tests?: readonly TestRef[];
  verdict: Verdict;
  /** Why it's a note or a gap. */
  finding?: string;
}

export interface CriticalFlow {
  id: string;
  title: string;
  /** METHOD /path, or "job". */
  request: string;
  purpose: string;
  checkpoints: readonly Checkpoint[];
}

const BOOKING = "apps/api/src/booking/booking.service.ts";
const BOOKING_CTRL = "apps/api/src/booking/booking.controller.ts";
const SUPPORT = "apps/api/src/booking/booking-support.ts";
const EXPIRY = "apps/api/src/booking/booking-expiry.service.ts";
const PAYMENTS = "apps/api/src/payments/payments.service.ts";
const PAYMENTS_CTRL = "apps/api/src/payments/payments.controller.ts";
const RULES = "apps/api/src/payments/payment-rules.ts";
const STRIPE = "apps/api/src/payments/stripe.provider.ts";
const PROVIDER = "apps/api/src/payments/payment-provider.ts";
const GATEWAY = "apps/api/src/payments/provider-payment-gateway.ts";
const AUTH = "apps/api/src/auth/auth.service.ts";
const M_INIT = "apps/api/prisma/migrations/20261027220035_init/migration.sql";
const M_RULES = "apps/api/prisma/migrations/20261027220042_db_constraints/migration.sql";
const T = "apps/api/test";

export const CRITICAL_FLOWS: readonly CriticalFlow[] = [
  {
    id: "create-booking",
    title: "Create a booking (lock seats)",
    request: "POST /bookings",
    purpose:
      "The one place seats get locked. It must never sell a seat twice, never create two bookings for one click, never trust the browser's price, and never leave half a booking behind.",
    checkpoints: [
      {
        rule: "Every Buy click carries a UUID Idempotency-Key; without one the request is refused.",
        design: "database-design §16",
        how: "The controller parses the header before anything else and passes it to the service.",
        review: [
          "Is the key read before any database work?",
          "Missing → 422 IDEMPOTENCY_KEY_MISSING, not a UUID → 422 VALIDATION_FAILED?",
        ],
        code: [
          {
            file: BOOKING_CTRL,
            from: "const key = parseIdempotencyKey(idempotencyKey);",
            to: "return booking;",
          },
          { file: BOOKING_CTRL, def: "parseIdempotencyKey" },
        ],
        tests: [{ file: `${T}/booking.int-spec.ts`, name: "requires a UUID Idempotency-Key" }],
        verdict: "matches",
      },
      {
        rule: "A repeated key returns the first answer, even if the seats are gone by now; the same key with a different body is an error.",
        design: "database-design §16",
        how: "The stored row is looked up first. The request hash covers showtime + the sorted seat ids, so the same seats in another order count as the same request.",
        review: [
          "Does the replay happen before validation (so a retry never turns into SEAT_TAKEN)?",
          "Is the seat list sorted before hashing?",
          "Is the key looked up per user (userId + key), so one user can't read another's stored response?",
        ],
        code: [
          {
            file: BOOKING,
            from: "// A repeated key replays before anything is validated",
            to: "return this.replay(stored, requestHash);",
          },
          { file: BOOKING, def: "replay" },
          { file: SUPPORT, def: "hashCreateBookingRequest" },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "replays the stored 201 for the same key and body, without a second booking",
          },
          {
            file: `${T}/booking.int-spec.ts`,
            name: "treats the same seat set in another order as the same request",
          },
          {
            file: `${T}/booking.int-spec.ts`,
            name: "rejects the same key with a different body: 422 IDEMPOTENCY_KEY_REUSED",
          },
          {
            file: `${T}/access-control.int-spec.ts`,
            name: "createBooking: Bob reusing Alice's Idempotency-Key gets his own booking, not her stored response",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "1–4 seats, the showtime is SCHEDULED and still open (until 30 min after it starts), every seat is an active seat of that showtime's hall.",
        design: "database-design: Business rules",
        how: "Limits come from booking.config.ts; seats are looked up with hallId + isActive, so a seat id from another hall is 'not found'.",
        review: [
          "Is the limit read from BOOKING_CONFIG, not a magic number?",
          "Does the seat query filter by the showtime's hallId and isActive?",
          "Are all these checks before the transaction (cheap rejections)?",
        ],
        code: [
          {
            file: BOOKING,
            from: "if (dto.seatIds.length > BOOKING_CONFIG.MAX_SEATS) {",
            to: "seats per booking`,\n      );\n    }",
          },
          {
            file: BOOKING,
            from: "const showtime = await this.prisma.showtime.findUnique({",
            to: '"Booking for this showtime is closed");\n    }',
          },
          {
            file: BOOKING,
            from: "const seats = await this.prisma.seat.findMany({",
            to: "seatIds: dto.seatIds.filter((id) => !found.has(id)),\n      });\n    }",
          },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "answers 422 BOOKING_CLOSED for a cancelled showtime and one past the cut-off, not before it",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "The server decides the price. The browser only sends ids.",
        design: "database-design §1, §6",
        how: "Each seat's price comes from the showtime's price list for its seat type, in whole baht; the total is their sum.",
        review: [
          "Is any price, total or amount taken from the request body? (It must not be.)",
          "Integers only, no floats?",
        ],
        code: [
          {
            file: BOOKING,
            from: "// Server-side prices from the showtime, whole baht.",
            to: "return { seatId, priceBaht };\n    });",
          },
          {
            file: BOOKING,
            from: "const totalBaht = lines.reduce(",
          },
        ],
        db: [
          { file: M_RULES, from: 'ADD CONSTRAINT "booking_seats_price_baht_positive"' },
          { file: M_RULES, from: 'ADD CONSTRAINT "bookings_total_baht_positive"' },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "locks the seats, prices them on the server and writes the audit event",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Two requests for overlapping seats must never deadlock.",
        design: "database-design §2",
        how: "Seat ids are sorted before the transaction, so every request takes the row locks in the same order.",
        review: ["Is the sorted list (not the request order) used for the locks below?"],
        code: [
          {
            file: BOOKING,
            from: "// Lock seats (and stale bookings) in one global order",
            to: "const seatIds = lines.map((line) => line.seatId);",
          },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "the same seats requested in opposite orders never deadlock (409, not 500)",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "N parallel requests with one key create exactly one booking.",
        design: "database-design §16",
        how: "Inside the transaction the key row is inserted with ON CONFLICT DO NOTHING. A parallel request with the same key blocks on that primary key until the first commits, then replays its stored answer.",
        review: [
          "Is the key claimed as the FIRST statement in the transaction?",
          "If the transaction fails, does the key row roll back too (so a retry can try again)?",
        ],
        code: [
          {
            file: BOOKING,
            from: "// 0. Claim the idempotency key.",
            to: 'return { kind: "existing", row };\n      }',
          },
        ],
        db: [
          {
            file: M_INIT,
            from: 'CREATE TABLE "idempotency_keys" (',
            to: 'CONSTRAINT "idempotency_keys_pkey"',
          },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "N parallel requests with the same key create exactly one booking",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "One PENDING_PAYMENT booking per user; an expired one the job hasn't cleaned yet must not block the user.",
        design: "database-design §13",
        how: "The user's pending booking is locked (FOR UPDATE): still inside its hold → 409 with its id; hold over → cancelled right here as PAYMENT_TIMEOUT.",
        review: [
          "Is the comparison against hold_expires_at (6 min), not payment_expires_at (5 min)?",
          "Is the stale one cancelled with the shared guarded helper (seats released + event)?",
          "The partial unique index is the backstop if two requests slip past this check at once: is that error turned into 409 (see the last checkpoint)?",
        ],
        code: [
          {
            file: BOOKING,
            from: "// 1. The caller's own pending booking",
            to: "if (await this.cancelStale(tx, own.id, now)) staleCancelled.push(own.id);\n      }",
          },
        ],
        db: [
          {
            file: M_RULES,
            from: "-- §13 One PENDING_PAYMENT booking per user.",
            to: "WHERE \"status\" = 'PENDING_PAYMENT';",
          },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "refuses a second booking with ACTIVE_BOOKING_EXISTS and the booking id",
          },
          {
            file: `${T}/booking.int-spec.ts`,
            name: "cancels the caller's own stale pending booking and goes ahead",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Availability never depends on the expiry job having run: seats whose hold is over are free.",
        design: "database-design §3 (rules that keep this bug-free)",
        how: "Bookings holding the requested seats whose hold is over are locked (FOR UPDATE OF b, in id order) and cancelled in this same transaction, so their seat rows get released_at before the insert below.",
        review: [
          "Only bookings with hold_expires_at <= now, only PENDING_PAYMENT, only unreleased rows for these seats?",
          "Their Stripe intents: cancelled only after commit (no network call while holding row locks)?",
        ],
        code: [
          {
            file: BOOKING,
            from: "// 2. Stale holds",
            to: "if (await this.cancelStale(tx, id, now)) staleCancelled.push(id);\n      }",
          },
          { file: SUPPORT, def: "cancelPendingBooking" },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "takes over seats whose hold is over, cancelling the stale booking",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Payment window 5 min, seat hold 6 min, always window < hold (1 min buffer for in-flight payments).",
        design: "database-design §3",
        how: "Both deadlines are computed from booking.config.ts at creation, and a CHECK constraint refuses a row that breaks the order.",
        review: ["Deadlines from config, based on the same `now`?"],
        code: [
          {
            file: BOOKING,
            from: "// 3. The booking, then its seat locks.",
            to: "select: { id: true },\n      });",
          },
        ],
        db: [{ file: M_RULES, from: 'ADD CONSTRAINT "bookings_payment_before_hold"' }],
        verdict: "matches",
      },
      {
        rule: "A seat can have only one active lock per showtime. All seats or none.",
        design: "database-design §2",
        how: "All seat rows are inserted in one statement with ON CONFLICT … DO NOTHING on the partial unique index. If fewer rows come back than requested, it throws SEAT_TAKEN with the exact conflicting seats, and the whole transaction (booking, locks, key) rolls back.",
        review: [
          "Is the ON CONFLICT target exactly the partial index (showtime_id, seat_id) WHERE released_at IS NULL?",
          "Is the count compared with the number requested, and does the throw happen inside the transaction?",
          "Is there any path that commits a booking with fewer seats than asked?",
        ],
        code: [
          {
            file: BOOKING,
            from: "const locked = await tx.$queryRaw<{ seatId: string }[]>`",
            to: "{ seatIds: seatIds.filter((id) => !got.has(id)) },\n        );\n      }",
          },
        ],
        db: [{ file: M_RULES, from: "-- §2 Seat lock:", to: 'WHERE "released_at" IS NULL;' }],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "N parallel requests for the same seat: exactly one 201, the rest SEAT_TAKEN",
          },
          {
            file: `${T}/booking.int-spec.ts`,
            name: "parallel requests with overlapping seat sets never double-book a seat",
          },
          {
            file: `${T}/booking.int-spec.ts`,
            name: "answers SEAT_TAKEN with exactly the conflicting seats and leaves no partial lock",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Every state change writes a booking_events row in the same transaction; the stored idempotent response is written in it too.",
        design: "database-design §15, §16",
        how: "CREATED event, then the response body is saved on the key row, both before commit.",
        review: ["Same `tx` for the event and the key update (not this.prisma)?"],
        code: [
          {
            file: BOOKING,
            from: "await tx.bookingEvent.create({",
            to: 'return { kind: "created", booking: body };',
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Two parallel requests of one user with different keys: exactly one wins, the other gets 409 with the winner's id.",
        design: "database-design §13",
        how: "The losing insert hits the one-pending-per-user index (Prisma P2002). The service checks it isn't a booking-code collision, then answers ACTIVE_BOOKING_EXISTS; a code collision is retried up to 3 times.",
        review: [
          "Are only unique violations caught (any other error rethrown)?",
          "After commit: stale intents cancelled outside the transaction, failures only logged (the late-payment refund is the safety net)?",
        ],
        code: [
          {
            file: BOOKING,
            from: "await this.cancelIntentsAfterCommit(staleCancelled);",
            to: "if (attempt >= MAX_CREATE_ATTEMPTS) throw error;",
          },
          { file: BOOKING, def: "cancelIntentsAfterCommit" },
        ],
        db: [{ file: M_INIT, from: 'CREATE UNIQUE INDEX "bookings_booking_code_key"' }],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "parallel requests of one user with different keys: exactly one wins",
          },
        ],
        verdict: "matches",
      },
    ],
  },
  {
    id: "seat-availability",
    title: "Show which seats are free",
    request: "GET /showtimes/{id}/seats · GET /movies/{slug}/showtimes (seatsLeft)",
    purpose:
      "What customers see must use the same definition of 'locked' as the booking transaction, or the map lies.",
    checkpoints: [
      {
        rule: "A seat is locked when it has an unreleased row whose booking is CONFIRMED, or PENDING_PAYMENT and still inside its hold.",
        design: "database-design §2",
        how: "Both the seat map and the seatsLeft count use exactly that condition, with `now` from the request.",
        review: [
          "Do both queries use released_at IS NULL + (CONFIRMED or PENDING with hold_expires_at > now)?",
          "Same condition as the stale-hold query in createBooking (hold_expires_at <= now = free)?",
          "seatsLeft only counts active seats (is_active) on both sides of the subtraction?",
        ],
        code: [
          {
            file: "apps/api/src/showtimes/showtimes.service.ts",
            from: "this.prisma.bookingSeat.findMany({",
            to: 'lock.booking.status === "CONFIRMED" ? "BOOKED" : "HELD"]),',
          },
          {
            file: "apps/api/src/catalog/catalog.service.ts",
            from: "private async seatsLeft(showtimeIds",
            to: "WHERE st.id = ANY(${showtimeIds}::uuid[])`;",
            label: "CatalogService.seatsLeft",
          },
        ],
        tests: [
          {
            file: `${T}/showtimes.int-spec.ts`,
            name: "lists active seats only, with grid positions, prices and statuses from the locks",
          },
          {
            file: `${T}/catalog.int-spec.ts`,
            name: "computes seatsLeft from active locks: confirmed and held seats count, expired holds and released locks do not",
          },
        ],
        verdict: "matches",
      },
    ],
  },
  {
    id: "payment-intent",
    title: "Start a payment",
    request: "POST /bookings/{id}/payment-intent",
    purpose:
      "Hands the browser a Stripe PaymentIntent for exactly the booking total. A reload or second tab must not create a second chargeable intent.",
    checkpoints: [
      {
        rule: "Only the owner, only a PENDING_PAYMENT booking, only inside the 5-minute window.",
        design: "database-design §3; security API (authorization in every query)",
        how: "The booking is looked up by id AND userId (someone else's booking is a plain 404), then status and payment_expires_at are checked.",
        review: [
          "userId in the WHERE, not checked afterwards?",
          "Window compared with payment_expires_at (5 min)?",
        ],
        code: [
          {
            file: PAYMENTS,
            from: "const booking = await this.prisma.booking.findFirst({\n      where: { id: bookingId, userId },",
            to: '"The payment window has closed",\n      );\n    }',
          },
        ],
        tests: [{ file: `${T}/payments.int-spec.ts`, name: "someone else's booking is a 404" }],
        verdict: "matches",
      },
      {
        rule: "Reuse the open intent instead of creating another.",
        design: "database-design §4",
        how: "The newest PENDING/FAILED payment's intent is fetched from Stripe and handed out again while it can still be paid.",
        review: ["Which Stripe statuses count as reusable? (requires_* and processing)"],
        code: [
          {
            file: PAYMENTS,
            from: "const latest = booking.payments.find(",
            to: "if (canReuseIntent(intent)) return body(intent);\n    }",
          },
          { file: RULES, def: "canReuseIntent" },
        ],
        tests: [
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "asking again (page reload, second tab) reuses the same intent: no second charge possible",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "The amount sent to Stripe is the booking total × 100 (satang), converted in one helper; concurrent calls get the same intent.",
        design: "database-design §1",
        how: "Stripe's idempotency key is `booking:<id>:<attempt>`: two parallel calls compute the same attempt number, so Stripe returns the same intent.",
        review: [
          "Amount from booking.totalBaht (server), via toStripeAmount only?",
          "bookingId in the intent metadata (the webhook needs it)?",
        ],
        code: [
          {
            file: PAYMENTS,
            from: "const attempt = booking.payments.length + 1;",
            to: "idempotencyKey: `booking:${booking.id}:${String(attempt)}`,\n    });",
          },
          { file: PROVIDER, def: "toStripeAmount" },
          { file: STRIPE, def: "createIntent" },
        ],
        tests: [
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "creates one THB card + PromptPay intent at Stripe for exactly the booking total",
          },
        ],
        verdict: "note",
        finding:
          "createIntent sets payment_method_types, which Stripe's newest API version no longer accepts. It works because the stripe package is pinned to API 2025-10-29.clover; upgrading the package needs a switch to automatic_payment_methods.",
      },
      {
        rule: "One payments row per intent, PAYMENT_STARTED written once.",
        design: "database-design §4, §15",
        how: "createMany with skipDuplicates on the unique stripe_payment_intent_id; the event is written only when a row was really inserted.",
        review: ["Event only when created.count === 1?"],
        code: [
          {
            file: PAYMENTS,
            from: "await this.prisma.$transaction(async (tx) => {\n      const created = await tx.payment.createMany({",
            to: "return body(intent);",
          },
        ],
        db: [{ file: M_INIT, from: 'CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key"' }],
        tests: [
          {
            file: `${T}/payments.int-spec.ts`,
            name: "createPaymentIntent: one intent per booking, amount in baht, a PAYMENT_STARTED event",
          },
        ],
        verdict: "note",
        finding:
          "No row lock around the Stripe call (on purpose). If an intent is created at 4:59 and its payments row lands after the expiry job ran at 5:00, the job doesn't see it, so the intent stays payable. Paying it later is caught by the late-payment refund, so the money is safe, but the customer sees a charge then a refund.",
      },
    ],
  },
  {
    id: "webhook",
    title: "Stripe webhook (confirm, refund, fail)",
    request: "POST /payments/webhook",
    purpose:
      "The only thing that confirms a booking. It must reject fakes, process each event exactly once, confirm only the right amount, and refund money it can't honour.",
    checkpoints: [
      {
        rule: "Only events signed with STRIPE_WEBHOOK_SECRET are accepted, checked on the raw request bytes.",
        design: "security (webhook signature)",
        how: "The controller passes req.rawBody and the Stripe-Signature header to the provider; any failure is 400 and nothing changes.",
        review: [
          "Raw body (not parsed JSON) passed to constructEvent?",
          "Signature checked before any database work?",
        ],
        code: [
          { file: PAYMENTS_CTRL, def: "stripeWebhook" },
          { file: STRIPE, def: "parseWebhook" },
        ],
        tests: [
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "rejects a forged, tampered, unsigned or stale event with 400 and changes nothing",
          },
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "verifies the raw bytes: whitespace Stripe added is fine as long as the signature covers it",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Each event is processed exactly once, even when Stripe delivers it several times at once.",
        design: "database-design §5",
        how: "The event id is inserted into stripe_events first, in the same transaction as its effects. A duplicate inserts nothing and returns; a failure rolls back the insert too, so Stripe's retry gets processed.",
        review: [
          "Is the insert the first statement, inside the same transaction as the effects?",
          "Unknown event types are stored and marked processed (no retry storm)?",
        ],
        code: [{ file: PAYMENTS, def: "handleEvent" }],
        db: [
          {
            file: M_INIT,
            from: 'CREATE TABLE "stripe_events" (',
            to: 'CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")',
          },
        ],
        tests: [
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "the same event delivered 5 times at once: exactly one confirmation, no refund",
          },
          { file: `${T}/payments.int-spec.ts`, name: "a duplicate event is a no-op" },
        ],
        verdict: "matches",
      },
      {
        rule: "Find the payment for the intent, even if writing its row failed earlier.",
        design: "database-design §4",
        how: "By stripe_payment_intent_id; if missing, rebuilt from the intent's metadata.bookingId.",
        review: ["An intent with no bookingId (e.g. `stripe trigger`) is logged and ignored?"],
        code: [{ file: PAYMENTS, def: "paymentFor" }],
        verdict: "matches",
      },
      {
        rule: "Confirm only for exactly the booking total in THB.",
        design: "code comment in onSucceeded (not in database-design)",
        how: "amountMatches compares intent.amount with toStripeAmount(totalBaht) and the currency. On a mismatch it logs payment_amount_mismatch and returns.",
        review: [
          "What happens to the money on a mismatch?",
          "The event is marked processed, so Stripe won't retry: who notices?",
        ],
        code: [
          { file: PAYMENTS, from: "// Never trust the amount blindly", to: "return;\n    }" },
          { file: RULES, def: "amountMatches" },
        ],
        tests: [
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "an amount that does not match the booking is never confirmed",
          },
          { file: `${T}/payments.int-spec.ts`, name: "an amount mismatch is not confirmed" },
        ],
        verdict: "gap",
        finding:
          "The booking is correctly not confirmed, but the captured money is neither refunded nor raised anywhere except one log line. The booking then expires (the job sees a succeeded intent as 'in progress' and waits for the hold), so the customer is charged with no ticket. Decide: refund automatically like a late payment, or alert (planned: reconciliation job + CloudWatch alarm, Next #3).",
      },
      {
        rule: "PENDING_PAYMENT → CONFIRMED exactly once, with the payment marked SUCCEEDED and a CONFIRMED event, in one transaction.",
        design: "database-design §3 (guarded update, only the webhook confirms)",
        how: "updateMany WHERE status = 'PENDING_PAYMENT'. Only if it matched one row are the payment and the event written.",
        review: [
          "Guarded WHERE on status (not a read-then-write)?",
          "Can the browser redirect confirm anything? (It can't: only this path writes CONFIRMED.)",
        ],
        code: [
          {
            file: PAYMENTS,
            from: "const details = await this.provider.paymentDetails(intent.id);\n    const paid",
            to: "return;\n    }",
          },
        ],
        db: [{ file: M_RULES, from: 'ADD CONSTRAINT "bookings_confirmed_at_iff_confirmed"' }],
        verdict: "note",
        finding:
          "A success that arrives after the 6-minute hold but before anyone cleaned the booking up still confirms it. That's safe: its seat rows were never released, and taking them needs the booking cancelled first (the FOR UPDATE in createBooking and this update serialise on the booking row). The design doesn't spell this case out.",
      },
      {
        rule: "A success that can't confirm is either a replay (do nothing) or money to give back.",
        design: "database-design §3 safety net (rule 3d)",
        how: "Re-reads the booking: CANCELLED → refund as late; CONFIRMED by this same payment → replay; CONFIRMED by another payment → refund the duplicate.",
        review: ["Every outcome of the pure rule handled below?"],
        code: [
          {
            file: PAYMENTS,
            from: "const current = await tx.booking.findUniqueOrThrow({",
            to: "const action = actionForUnconfirmedPayment(current.status, otherSucceeded);",
          },
          { file: RULES, def: "actionForUnconfirmedPayment" },
        ],
        verdict: "matches",
      },
      {
        rule: "Refund exactly once.",
        design: "database-design §3 safety net; decision D11",
        how: "The payment is marked REFUNDED with a guarded update BEFORE calling Stripe, so a second event finds it refunded and stops. If the Stripe call fails, the transaction (including that mark) rolls back and Stripe retries the webhook; the refund's idempotency key `refund:<intent>` makes the retry safe.",
        review: [
          "Mark first, then call Stripe, all inside the transaction?",
          "Late payment: cancel_reason set to LATE_PAYMENT_REFUNDED; REFUNDED event written?",
        ],
        code: [
          {
            file: PAYMENTS,
            from: "// Paid too late (booking CANCELLED) or paid twice",
            to: 'reason: action === "refund_late" ? "LATE_PAYMENT" : "DUPLICATE_PAYMENT",',
          },
          { file: STRIPE, def: "refund" },
        ],
        tests: [
          {
            file: `${T}/payments-stripe.int-spec.ts`,
            name: "paid but the webhook came after the hold ended: the booking stays cancelled and Stripe refunds once",
          },
          {
            file: `${T}/payments.int-spec.ts`,
            name: "a payment that arrives after the booking was cancelled is refunded (LATE_PAYMENT_REFUNDED)",
          },
        ],
        verdict: "note",
        finding:
          "Stripe is called (paymentDetails, refund) inside the database transaction, so the booking row stays locked for as long as Stripe takes (transaction timeout 30 s). That's what makes the refund exactly-once; the cost is a slow Stripe holding a connection and blocking a cancel of the same booking meanwhile.",
      },
      {
        rule: "A declined payment keeps the booking payable; a cancelled intent closes only that payment.",
        design: "database-design §4",
        how: "payment_failed: payment → FAILED with the decline code, booking untouched. canceled: payment → CANCELLED (guarded).",
        review: ["Booking status untouched on failure (the customer can retry inside the window)?"],
        code: [
          { file: PAYMENTS, def: "onFailed" },
          {
            file: PAYMENTS,
            from: 'case "payment_intent.canceled":',
            to: 'outcome = "processed";\n              break;',
          },
        ],
        tests: [
          {
            file: `${T}/payments.int-spec.ts`,
            name: "payment_failed keeps the booking payable; canceled closes the payment",
          },
        ],
        verdict: "matches",
      },
    ],
  },
  {
    id: "cancel",
    title: "Cancel before paying",
    request: "POST /bookings/{id}/cancel",
    purpose:
      "The customer gives up. It must not release seats someone is paying for right now, and must not race the expiry job or the webhook.",
    checkpoints: [
      {
        rule: "Only the owner, only PENDING_PAYMENT.",
        design: "database-design §3",
        how: "Looked up by id + userId; anything else → 404 or 409 BOOKING_NOT_PENDING.",
        review: ["userId in the WHERE?"],
        code: [
          {
            file: BOOKING,
            from: "const current = await this.prisma.booking.findFirst({\n      where: { id: bookingId, userId },\n      select: { id: true, status: true },",
            to: 'if (current.status !== "PENDING_PAYMENT") throw this.notPending();',
          },
        ],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "answers 409 BOOKING_NOT_PENDING for a cancelled or confirmed booking",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Stripe first: if a payment is processing or already succeeded, refuse (409 PAYMENT_IN_PROGRESS).",
        design: "database-design §3",
        how: "Every open intent of the booking is cancelled at Stripe; 'processing', 'succeeded' and 'requires_capture' come back as in_progress.",
        review: [
          "Is the Stripe cancel before the database cancel? (Otherwise seats could be released while money arrives.)",
          "Is 'succeeded' treated as in progress?",
        ],
        code: [
          {
            file: BOOKING,
            from: "// Stripe first: if the payment is already processing",
            to: '"The payment is being processed and cannot be cancelled",\n      );\n    }',
          },
          { file: GATEWAY, def: "cancelPaymentIntent" },
          { file: STRIPE, def: "cancelIntent" },
          { file: STRIPE, def: "IN_PROGRESS" },
        ],
        tests: [
          {
            file: `${T}/payments.int-spec.ts`,
            name: "cancelling a booking cancels its intent; the expiry job does too",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "PENDING_PAYMENT → CANCELLED once: seats released and event written in the same transaction; losing a race is a 409.",
        design: "database-design §3, §15",
        how: "The shared cancelPendingBooking: guarded updateMany, then booking_seats.released_at, then the CANCELLED event.",
        review: [
          "Does the shared helper return false (→ 409) when the job or the webhook won?",
          "Seats released in the same transaction as the status change?",
        ],
        code: [
          {
            file: BOOKING,
            from: "await this.prisma.$transaction(async (tx) => {\n      const cancelled = await cancelPendingBooking(tx, {",
            to: "if (!cancelled) throw this.notPending();\n    });",
          },
          { file: SUPPORT, def: "cancelPendingBooking" },
        ],
        db: [{ file: M_RULES, from: 'ADD CONSTRAINT "bookings_cancel_reason_iff_cancelled"' }],
        tests: [
          {
            file: `${T}/booking.int-spec.ts`,
            name: "two parallel cancels: one 200, one 409, one CANCELLED event",
          },
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "races with a user cancel without double-cancelling",
          },
        ],
        verdict: "matches",
      },
    ],
  },
  {
    id: "expiry",
    title: "Expiry job (every 30 s)",
    request: "background job",
    purpose:
      "Closes bookings that weren't paid in time. It must never cancel a booking whose payment is landing, and must be safe with many API containers.",
    checkpoints: [
      {
        rule: "Only one container runs a pass at a time.",
        design: "database-design §18",
        how: "pg_try_advisory_xact_lock: the others skip this tick. The lock ends with the transaction.",
        review: ["try (not wait) lock, so a slow pass doesn't pile up the others?"],
        code: [
          {
            file: EXPIRY,
            from: "const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`",
            to: "idempotencyKeysDeleted: 0,\n          };",
          },
        ],
        tests: [
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "does nothing while another container holds the advisory lock",
          },
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "parallel runs (many containers) cancel each booking exactly once",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "At 5 min ask Stripe to cancel; if a payment is in flight, wait for the webhook until the 6-min hold is over.",
        design: "database-design §3 timeline",
        how: "Due = PENDING_PAYMENT past payment_expires_at. Stripe cancel first; in_progress and not past the hold → skip this tick. A Stripe error counts as in_progress, so one bad booking never blocks the batch.",
        review: [
          "Due uses payment_expires_at (5 min); the wait ends at hold_expires_at (6 min)?",
          "A Stripe error can't make the job release seats early?",
        ],
        code: [
          {
            file: EXPIRY,
            from: "const due = await tx.booking.findMany({",
            to: "take: BATCH_SIZE,\n        });",
          },
          {
            file: EXPIRY,
            from: "let outcome: CancelOutcome;",
            to: "if (done) cancelled++;",
          },
          { file: SUPPORT, def: "shouldExpireBooking" },
        ],
        tests: [
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "asks the gateway first and leaves a payment that is processing alone until the hold is over",
          },
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "one booking whose provider call fails never blocks the batch (Stripe down, unknown intent)",
          },
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "cancels bookings past the payment window: PAYMENT_TIMEOUT, seats released, SYSTEM event",
          },
        ],
        verdict: "note",
        finding:
          "Stripe calls run inside the job's transaction (it holds the advisory lock and a connection for the whole batch of 100). Fine at this scale; with many due bookings and a slow Stripe a pass could approach the transaction timeout. Rows themselves are only locked by the guarded update at the end.",
      },
      {
        rule: "Running twice changes nothing; idempotency keys older than 24 h are removed.",
        design: "database-design §16, §18",
        how: "The guarded cancel makes a second pass a no-op; expired key rows are deleted in the same pass.",
        review: ["Live keys untouched?"],
        code: [{ file: EXPIRY, from: "const keys = await tx.idempotencyKey.deleteMany" }],
        tests: [
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "is idempotent: a second run changes nothing and writes no second event",
          },
          {
            file: `${T}/booking-expiry.int-spec.ts`,
            name: "deletes expired idempotency keys and keeps live ones",
          },
        ],
        verdict: "matches",
      },
    ],
  },
  {
    id: "refresh",
    title: "Refresh the session",
    request: "POST /auth/refresh",
    purpose:
      "Each refresh token works once. A stolen copy used later must log everyone out of that login, without punishing two tabs refreshing at the same moment.",
    checkpoints: [
      {
        rule: "Find the token by its hash and lock the row.",
        design: "database-design §10, §14",
        how: "SELECT … FOR UPDATE on refresh_tokens by token_hash (peppered hash; the raw token is never stored).",
        review: ["FOR UPDATE inside the transaction, so two refreshes with one token serialise?"],
        code: [
          {
            file: AUTH,
            from: "const rows = await tx.$queryRaw<LockedTokenRow[]>`",
            to: "const decision = decideRotation(row, now, this.reuseGraceMs);",
          },
          { file: "apps/api/src/auth/refresh-rotation.ts", def: "decideRotation" },
        ],
        tests: [
          {
            file: `${T}/auth.int-spec.ts`,
            name: "two concurrent refreshes with the same token: exactly one succeeds (row lock)",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Reuse of a revoked token (after the 10 s grace) revokes the whole family, and that stays committed.",
        design: "database-design §14",
        how: "The family is revoked and the transaction returns 'invalid' instead of throwing, so the revocation commits; the 401 is thrown after.",
        review: [
          "Returned, not thrown, inside the transaction (a throw would roll the revocation back)?",
        ],
        code: [
          {
            file: AUTH,
            from: 'if (decision === "reuse") {',
            to: 'return { kind: "invalid" }; // committed: the family stays revoked\n      }',
          },
        ],
        tests: [
          {
            file: `${T}/auth.int-spec.ts`,
            name: "reuse of a rotated token revokes the whole family, including the newest token",
          },
        ],
        verdict: "matches",
      },
      {
        rule: "Rotate: revoke the presented token, issue a successor in the same family.",
        design: "database-design §14",
        how: "Both in the same transaction; the successor gets a fresh 7-day expiry.",
        review: ["Old token revoked before the new one is returned?"],
        code: [
          {
            file: AUTH,
            from: "await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: now } });",
            to: 'kind: "rotated",',
          },
        ],
        verdict: "matches",
      },
    ],
  },
];

/** Booking states with the code that moves them (drawn on the page). */
export const BOOKING_STATES = `stateDiagram-v2
  [*] --> PENDING_PAYMENT: createBooking · createInTransaction
  PENDING_PAYMENT --> CONFIRMED: webhook · onSucceeded (guarded update)
  PENDING_PAYMENT --> CANCELLED: cancelPendingBooking (USER_CANCELLED / PAYMENT_TIMEOUT)
  CANCELLED --> CANCELLED: late success · refund (LATE_PAYMENT_REFUNDED)
  CONFIRMED --> [*]
  CANCELLED --> [*]`;

/** Payment (one PaymentIntent) states with the code that moves them. */
export const PAYMENT_STATES = `stateDiagram-v2
  [*] --> PENDING: createPaymentIntent
  PENDING --> FAILED: webhook · onFailed
  FAILED --> FAILED: another decline
  PENDING --> SUCCEEDED: onSucceeded
  FAILED --> SUCCEEDED: retry paid · onSucceeded
  PENDING --> CANCELLED: gateway cancel / canceled event
  FAILED --> CANCELLED: gateway cancel / canceled event
  PENDING --> REFUNDED: late or duplicate · refund
  FAILED --> REFUNDED: late or duplicate · refund`;

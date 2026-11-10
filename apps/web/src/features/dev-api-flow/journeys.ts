/**
 * The main flows of the app, step by step, for the dev-only `/api-flow` page. Only the order and the words are
 * written by hand: each step names a file and a function (or an exact piece of text), and the page looks up the
 * line and shows the code. api-flow.test.ts fails when a step no longer points at real code.
 */

export type Actor = "browser" | "api" | "db" | "stripe" | "job";

export const ACTORS: Record<Actor, string> = {
  browser: "Browser (web)",
  api: "API (NestJS)",
  db: "Postgres",
  stripe: "Stripe",
  job: "Expiry job",
};

export interface JourneyStep {
  /** Who does this step. */
  actor: Actor;
  /** Who it talks to, when it calls someone (drawn as an arrow). */
  to?: Actor;
  /** Short label for the diagram arrow. */
  label: string;
  /** One or two sentences: what happens and why. */
  text: string;
  /** Repo-relative file. */
  file?: string;
  /** A function/method/const name defined in `file`, or exact text inside it. */
  find?: string;
}

export interface Journey {
  id: string;
  title: string;
  summary: string;
  steps: readonly JourneyStep[];
}

const WEB = "apps/web/src";
const API = "apps/api/src";

export const JOURNEYS: readonly Journey[] = [
  {
    id: "book",
    title: "1 · Pick seats and hold them",
    summary:
      "The customer taps seats and presses Buy. The API locks the seats in one transaction, so two people can never get the same seat, and starts the 5-minute hold.",
    steps: [
      {
        actor: "browser",
        label: "Buy",
        text: "The seat screen shows the chosen seats as held right away (optimistic), before the server answers.",
        file: `${WEB}/features/showtimes/showtime-view.tsx`,
        find: "const buy = useCreateBookingOptimistic(id);",
      },
      {
        actor: "browser",
        to: "api",
        label: "POST /bookings",
        text: "Sends showtimeId + seatIds with an Idempotency-Key, so a retry after a network error can't book twice.",
        file: `${WEB}/features/bookings/use-booking-mutations.ts`,
        find: "useCreateBookingOptimistic",
      },
      {
        actor: "api",
        label: "createBooking",
        text: "The controller reads the logged-in user and the Idempotency-Key, then hands over to the service.",
        file: `${API}/booking/booking.controller.ts`,
        find: "createBooking",
      },
      {
        actor: "api",
        label: "BookingService.create",
        text: "Replays the saved answer if this key was already used; otherwise runs the booking transaction.",
        file: `${API}/booking/booking.service.ts`,
        find: "create",
      },
      {
        actor: "api",
        to: "db",
        label: "lock seats (one transaction)",
        text: "Locks the seats in sorted order (no deadlocks), checks none is taken, computes the price on the server and writes the booking, its seats and a CREATED event.",
        file: `${API}/booking/booking.service.ts`,
        find: "createInTransaction",
      },
      {
        actor: "api",
        to: "browser",
        label: "201 booking (PENDING_PAYMENT)",
        text: "The browser replaces its optimistic preview with the real booking and goes to checkout. If a seat was taken, it rolls back and says sorry.",
        file: `${WEB}/features/showtimes/showtime-view.tsx`,
        find: "router.push(`/checkout?bookingId=${booking.id}`)",
      },
    ],
  },
  {
    id: "pay",
    title: "2 · Pay with Stripe",
    summary:
      "Checkout asks the API for a PaymentIntent, the customer pays inside Stripe's own form, and Stripe tells the API by webhook. Only the webhook confirms the booking; the browser's word is never trusted.",
    steps: [
      {
        actor: "browser",
        to: "api",
        label: "POST /bookings/{id}/payment-intent",
        text: "The checkout page asks for a PaymentIntent for this booking.",
        file: `${WEB}/features/payments/payment-panel.tsx`,
        find: "queryFn: () => createPaymentIntent(props.bookingId)",
      },
      {
        actor: "api",
        label: "PaymentsService.createPaymentIntent",
        text: "Checks the booking is the user's and still PENDING_PAYMENT, reuses an existing intent when it can, and records PAYMENT_STARTED.",
        file: `${API}/payments/payments.service.ts`,
        find: "createPaymentIntent",
      },
      {
        actor: "api",
        to: "stripe",
        label: "create PaymentIntent (THB × 100)",
        text: "Creates the intent at Stripe in satang, with bookingId in metadata and an idempotency key.",
        file: `${API}/payments/stripe.provider.ts`,
        find: "createIntent",
      },
      {
        actor: "api",
        to: "browser",
        label: "clientSecret + publishableKey",
        text: "A pk_ key means real Stripe: the browser shows Stripe's Payment Element (otherwise the demo panel).",
        file: `${WEB}/features/payments/payment-panel.tsx`,
        find: "if (isStripeKey(body.publishableKey)) {",
      },
      {
        actor: "browser",
        to: "stripe",
        label: "confirmPayment (card / PromptPay)",
        text: "Card details go straight to Stripe, never to our API. Stripe then sends the customer back to /checkout/complete.",
        file: `${WEB}/features/payments/stripe-payment-panel.tsx`,
        find: "stripe.confirmPayment(",
      },
      {
        actor: "stripe",
        to: "api",
        label: "webhook payment_intent.succeeded",
        text: "Stripe POSTs the event (locally through `stripe listen`). The controller checks the Stripe-Signature against the raw body first.",
        file: `${API}/payments/payments.controller.ts`,
        find: "stripeWebhook",
      },
      {
        actor: "api",
        label: "verify signature",
        text: "Rejects anything not signed with STRIPE_WEBHOOK_SECRET, so nobody can fake a payment.",
        file: `${API}/payments/stripe.provider.ts`,
        find: "parseWebhook",
      },
      {
        actor: "api",
        to: "db",
        label: "save event once",
        text: "Inserts the event id into stripe_events first, in the same transaction: a duplicate delivery does nothing.",
        file: `${API}/payments/payments.service.ts`,
        find: "handleEvent",
      },
      {
        actor: "api",
        to: "db",
        label: "booking → CONFIRMED",
        text: "Checks the amount, confirms the booking with a guarded update. A late or duplicate payment is refunded instead.",
        file: `${API}/payments/payments.service.ts`,
        find: "onSucceeded",
      },
      {
        actor: "api",
        label: "late / duplicate rule",
        text: "The pure rule that decides: already confirmed, refund a late payment, or refund a duplicate.",
        file: `${API}/payments/payment-rules.ts`,
        find: "actionForUnconfirmedPayment",
      },
      {
        actor: "browser",
        to: "api",
        label: "poll GET /bookings/{id}",
        text: "The result page polls the booking until the webhook has confirmed it, then shows the ticket.",
        file: `${WEB}/features/payments/checkout-complete-view.tsx`,
        find: "refetchInterval",
      },
    ],
  },
  {
    id: "expire",
    title: "3 · The hold runs out",
    summary:
      "Every 30 s a background job looks for holds past their 5 minutes. It cancels the Stripe intent first, so a customer can't pay for seats that were just released.",
    steps: [
      {
        actor: "job",
        label: "every 30 s",
        text: "Starts the timer when the app boots.",
        file: `${API}/booking/booking-expiry.service.ts`,
        find: "onApplicationBootstrap",
      },
      {
        actor: "job",
        to: "db",
        label: "advisory lock + find expired",
        text: "Takes a Postgres advisory lock (only one API instance runs the job), then lists PENDING_PAYMENT bookings past their hold.",
        file: `${API}/booking/booking-expiry.service.ts`,
        find: "runOnce",
      },
      {
        actor: "job",
        to: "stripe",
        label: "cancel PaymentIntent",
        text: "Asks Stripe to cancel the intent. A Stripe error only skips this booking until the next run.",
        file: `${API}/payments/provider-payment-gateway.ts`,
        find: "cancelPaymentIntent",
      },
      {
        actor: "job",
        label: "expire or wait?",
        text: "If Stripe is already processing a payment, the booking waits; otherwise it is expired.",
        file: `${API}/booking/booking-support.ts`,
        find: "shouldExpireBooking",
      },
      {
        actor: "job",
        to: "db",
        label: "booking → EXPIRED, seats free",
        text: "Guarded update plus an EXPIRED event in the same transaction; the seat locks are released.",
        file: `${API}/booking/booking-support.ts`,
        find: "cancelPendingBooking",
      },
    ],
  },
  {
    id: "auth",
    title: "4 · Log in and stay logged in",
    summary:
      "Login returns a short access token (kept in memory) and sets a refresh cookie. When the access token runs out, the browser quietly gets a new one; every refresh token is used once.",
    steps: [
      {
        actor: "browser",
        to: "api",
        label: "POST /auth/login",
        text: "The login form sends email and password, stores the session and goes back to where the customer was.",
        file: `${WEB}/features/auth/login-form.tsx`,
        find: "LoginForm",
      },
      {
        actor: "api",
        to: "db",
        label: "check password (argon2id)",
        text: "Finds the user, verifies the password hash and gives the same answer for unknown email or wrong password.",
        file: `${API}/auth/auth.service.ts`,
        find: "login",
      },
      {
        actor: "api",
        to: "db",
        label: "new token family",
        text: "Signs the access token (JWT) and stores a hashed refresh token; the raw one goes into an httpOnly cookie.",
        file: `${API}/auth/auth.service.ts`,
        find: "startSession",
      },
      {
        actor: "browser",
        to: "api",
        label: "POST /auth/refresh",
        text: "On app load or a 401, one refresh at a time across all tabs (Web Lock).",
        file: `${WEB}/lib/api-client.ts`,
        find: "createSessionRefresher",
      },
      {
        actor: "api",
        to: "db",
        label: "rotate refresh token",
        text: "Locks the token row, swaps it for a new one; reusing an old token later revokes the whole family.",
        file: `${API}/auth/auth.service.ts`,
        find: "refresh",
      },
    ],
  },
];

/** Mermaid sequence diagram of a journey (numbered like the step list). */
export function journeyChart(journey: Journey): string {
  const used = new Set<Actor>();
  for (const step of journey.steps) {
    used.add(step.actor);
    if (step.to) used.add(step.to);
  }
  const order = (Object.keys(ACTORS) as Actor[]).filter((actor) => used.has(actor));
  const lines = ["sequenceDiagram", "  autonumber"];
  for (const actor of order) lines.push(`  participant ${actor} as ${ACTORS[actor]}`);
  for (const step of journey.steps) {
    const label = step.label.replace(/[;#]/g, " ");
    lines.push(`  ${step.actor}->>${step.to ?? step.actor}: ${label}`);
  }
  return lines.join("\n");
}

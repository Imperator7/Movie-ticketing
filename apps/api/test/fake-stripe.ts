import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { createStripeClient } from "../src/payments/stripe.provider.js";

/**
 * A tiny local Stripe API for integration tests: the REAL Stripe SDK talks HTTP to it, so the adapter's requests
 * (form encoding, idempotency headers, expand) and Stripe's error responses are exercised without the internet.
 * It implements only what the API uses: create / retrieve / cancel PaymentIntents and create refunds.
 */

export interface RecordedRequest {
  method: string;
  path: string;
  idempotencyKey: string | undefined;
  form: URLSearchParams;
}

interface FakeIntent {
  id: string;
  object: "payment_intent";
  client_secret: string;
  status: Stripe.PaymentIntent.Status;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  payment_method_types: string[];
  latest_charge: object | null;
  last_payment_error: object | null;
}

export const WEBHOOK_SECRET = "whsec_integration_test";

export class FakeStripe {
  readonly requests: RecordedRequest[] = [];
  readonly refunds: { paymentIntent: string; idempotencyKey: string | undefined }[] = [];
  private readonly intents = new Map<string, FakeIntent>();
  private readonly idempotent = new Map<string, string>();
  private server: Server | undefined;
  private failNext = 0;
  private counter = 0;

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server?.close(() => {
        resolve();
      });
    });
  }

  /** A real Stripe SDK client pointed at this server (no retries, so a failure shows up at once). */
  client(): Stripe {
    const { port } = this.server?.address() as AddressInfo;
    return createStripeClient("sk_test_integration", {
      host: "127.0.0.1",
      port,
      protocol: "http",
      maxNetworkRetries: 0,
      telemetry: false,
    });
  }

  /** The next `count` API calls answer 500 (Stripe having a bad day). */
  failNextRequests(count: number): void {
    this.failNext = count;
  }

  intent(id: string): FakeIntent {
    const intent = this.intents.get(id);
    if (!intent) throw new Error(`no intent ${id}`);
    return intent;
  }

  intentForBooking(bookingId: string): FakeIntent {
    const found = [...this.intents.values()].filter((i) => i.metadata.bookingId === bookingId);
    const last = found.at(-1);
    if (!last) throw new Error(`no intent for booking ${bookingId}`);
    return last;
  }

  /** The customer pays (what Stripe.js + the bank do). */
  pay(id: string, method: "card" | "promptpay"): void {
    const intent = this.intent(id);
    intent.status = "succeeded";
    intent.last_payment_error = null;
    intent.latest_charge = {
      id: `ch_${id}`,
      object: "charge",
      payment_method_details:
        method === "card"
          ? { type: "card", card: { brand: "mastercard", last4: "4444" } }
          : { type: "promptpay", promptpay: {} },
    };
  }

  /** The bank declines the card (Stripe test card 4000 0000 0000 0002). */
  decline(id: string): void {
    const intent = this.intent(id);
    intent.status = "requires_payment_method";
    intent.last_payment_error = {
      type: "card_error",
      code: "card_declined",
      message: "Your card was declined.",
      payment_method: { type: "card", card: { brand: "visa", last4: "0002" } },
    };
  }

  /** A webhook event as Stripe sends it, with the intent's current state. */
  event(type: string, intentId: string, eventId = `evt_${this.next()}`): string {
    return JSON.stringify({
      id: eventId,
      object: "event",
      api_version: "2025-10-29.clover",
      created: Math.floor(Date.now() / 1000),
      type,
      data: { object: { ...this.intent(intentId), latest_charge: `ch_${intentId}` } },
    });
  }

  /** The `Stripe-Signature` header for a payload (Stripe's own test helper, real HMAC). */
  sign(payload: string, secret = WEBHOOK_SECRET): string {
    return Stripe.webhooks.generateTestHeaderString({ payload, secret });
  }

  // ---------------------------------------------------------------- HTTP

  private next(): string {
    this.counter += 1;
    return `${String(Date.now())}${String(this.counter)}`;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://stripe.local");
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const form = new URLSearchParams(req.method === "GET" ? url.search : body);
    const header = req.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;
    this.requests.push({ method: req.method ?? "", path: url.pathname, idempotencyKey, form });

    const send = (status: number, json: unknown): void => {
      res.writeHead(status, { "content-type": "application/json", "request-id": "req_fake" });
      res.end(JSON.stringify(json));
    };
    const error = (status: number, type: string, message: string): void => {
      send(status, { error: { type, message } });
    };

    if (this.failNext > 0) {
      this.failNext -= 1;
      error(500, "api_error", "Something went wrong on Stripe's end.");
      return;
    }

    const parts = url.pathname.split("/").filter(Boolean); // v1, payment_intents, id, cancel
    if (req.method === "POST" && url.pathname === "/v1/payment_intents") {
      const known = idempotencyKey ? this.idempotent.get(idempotencyKey) : undefined;
      if (known) {
        send(200, this.intent(known));
        return;
      }
      const id = `pi_test_${this.next()}`;
      const intent: FakeIntent = {
        id,
        object: "payment_intent",
        client_secret: `${id}_secret_test`,
        status: "requires_payment_method",
        amount: Number(form.get("amount")),
        currency: form.get("currency") ?? "",
        metadata: {
          bookingId: form.get("metadata[bookingId]") ?? "",
          bookingCode: form.get("metadata[bookingCode]") ?? "",
        },
        payment_method_types: form
          .getAll("payment_method_types[0]")
          .concat(form.getAll("payment_method_types[1]")),
        latest_charge: null,
        last_payment_error: null,
      };
      this.intents.set(id, intent);
      if (idempotencyKey) this.idempotent.set(idempotencyKey, id);
      send(200, intent);
      return;
    }

    if (parts[0] === "v1" && parts[1] === "payment_intents" && parts[2]) {
      const intent = this.intents.get(parts[2]);
      if (!intent) {
        error(404, "invalid_request_error", `No such payment_intent: '${parts[2]}'`);
        return;
      }
      if (req.method === "GET" && parts.length === 3) {
        send(200, intent);
        return;
      }
      if (req.method === "POST" && parts[3] === "cancel") {
        if (["canceled", "succeeded", "processing"].includes(intent.status)) {
          error(
            400,
            "invalid_request_error",
            `You cannot cancel this PaymentIntent because it has a status of ${intent.status}.`,
          );
          return;
        }
        intent.status = "canceled";
        send(200, intent);
        return;
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/refunds") {
      const paymentIntent = form.get("payment_intent") ?? "";
      const known = idempotencyKey
        ? this.refunds.find((r) => r.idempotencyKey === idempotencyKey)
        : undefined;
      if (!known) this.refunds.push({ paymentIntent, idempotencyKey });
      send(200, { id: `re_${paymentIntent}`, object: "refund", payment_intent: paymentIntent });
      return;
    }

    error(
      404,
      "invalid_request_error",
      `Unrecognized request URL (${req.method ?? ""}: ${url.pathname})`,
    );
  }
}

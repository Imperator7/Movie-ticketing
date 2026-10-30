import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "./fake.provider.js";
import { InvalidSignatureError, toStripeAmount } from "./payment-provider.js";
import { StripePaymentProvider } from "./stripe.provider.js";

describe("toStripeAmount", () => {
  it("converts whole baht to satang and refuses anything else", () => {
    expect(toStripeAmount(440)).toBe(44_000);
    expect(() => toStripeAmount(0)).toThrow(RangeError);
    expect(() => toStripeAmount(1.5)).toThrow(RangeError);
  });
});

describe("FakePaymentProvider", () => {
  const input = {
    bookingId: "b1",
    bookingCode: "MT-AAAAAA",
    amountSatang: 44_000,
    idempotencyKey: "k1",
  };

  it("is idempotent per key", async () => {
    const fake = new FakePaymentProvider();
    const a = await fake.createIntent(input);
    const b = await fake.createIntent(input);
    const c = await fake.createIntent({ ...input, idempotencyKey: "k2" });
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
    expect(a).toMatchObject({ amount: 44_000, currency: "thb", bookingId: "b1" });
  });

  it("cancel: cancelled once, then nothing to cancel; a paid intent is in progress", async () => {
    const fake = new FakePaymentProvider();
    const a = await fake.createIntent(input);
    expect(await fake.cancelIntent(a.id)).toBe("cancelled");
    expect(await fake.cancelIntent(a.id)).toBe("nothing_to_cancel");
    expect(fake.simulatePayment(a.id, "CARD")).toBeNull();

    const b = await fake.createIntent({ ...input, idempotencyKey: "k3" });
    const event = fake.simulatePayment(b.id, "PROMPTPAY");
    expect(event?.type).toBe("payment_intent.succeeded");
    expect(await fake.cancelIntent(b.id)).toBe("in_progress");
    expect(await fake.paymentDetails(b.id)).toEqual({
      method: "PROMPTPAY",
      cardBrand: null,
      cardLast4: null,
    });
  });

  it("never accepts webhooks", () => {
    expect(() => new FakePaymentProvider().parseWebhook()).toThrow(InvalidSignatureError);
  });
});

describe("StripePaymentProvider.parseWebhook", () => {
  const secret = "whsec_unit";
  const provider = new StripePaymentProvider("sk_test_unit", "pk_test_unit", secret);
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        object: "payment_intent",
        id: "pi_1",
        client_secret: "pi_1_secret",
        status: "succeeded",
        amount: 44_000,
        currency: "thb",
        metadata: { bookingId: "b1" },
        last_payment_error: null,
      },
    },
  });

  it("verifies the signature and maps the intent", () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = provider.parseWebhook(Buffer.from(payload), signature);
    expect(event).toMatchObject({
      id: "evt_1",
      type: "payment_intent.succeeded",
      intent: { id: "pi_1", amount: 44_000, currency: "thb", bookingId: "b1", failureCode: null },
    });
  });

  it("rejects a wrong signature or a tampered body", () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect(() => provider.parseWebhook(Buffer.from(payload), signature)).toThrow(
      InvalidSignatureError,
    );
    const good = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => provider.parseWebhook(Buffer.from(payload.replace("44000", "1")), good)).toThrow(
      InvalidSignatureError,
    );
  });
});

import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { StripePaymentProvider, type StripeClient } from "./stripe.provider.js";

/**
 * The Stripe adapter against a stubbed SDK client: which calls it makes, with which idempotency keys, and how it
 * reads Stripe's answers. The real HTTP round trip is in test/payments-stripe.int-spec.ts.
 */

type Intent = Partial<Stripe.PaymentIntent> & { id: string; status: Stripe.PaymentIntent.Status };

function intent(overrides: Partial<Intent> & { status: Stripe.PaymentIntent.Status }): Intent {
  return {
    id: "pi_1",
    client_secret: "pi_1_secret",
    amount: 44_000,
    currency: "thb",
    metadata: { bookingId: "b1" },
    latest_charge: null,
    last_payment_error: null,
    ...overrides,
  };
}

function stubClient() {
  const paymentIntents = {
    create: vi.fn<(...args: unknown[]) => Promise<Intent>>(),
    retrieve: vi.fn<(...args: unknown[]) => Promise<Intent>>(),
    cancel: vi.fn<(...args: unknown[]) => Promise<Intent>>(),
  };
  const refunds = { create: vi.fn<(...args: unknown[]) => Promise<unknown>>() };
  const client = { paymentIntents, refunds, webhooks: {} } as unknown as StripeClient;
  return {
    paymentIntents,
    refunds,
    provider: new StripePaymentProvider(client, "pk_test_unit", "whsec_unit"),
  };
}

const invalidRequest = (): Error =>
  new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    message: "This PaymentIntent's status is succeeded",
  });

describe("StripePaymentProvider.createIntent", () => {
  it("creates a THB card + PromptPay intent with the booking in metadata and the caller's idempotency key", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.create.mockResolvedValue(intent({ status: "requires_payment_method" }));

    const result = await provider.createIntent({
      bookingId: "b1",
      bookingCode: "MT-AAAAAA",
      amountSatang: 44_000,
      idempotencyKey: "booking:b1:1",
    });

    expect(paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 44_000,
        currency: "thb",
        payment_method_types: ["card", "promptpay"],
        description: "Movie tickets MT-AAAAAA",
        metadata: { bookingId: "b1", bookingCode: "MT-AAAAAA" },
      },
      { idempotencyKey: "booking:b1:1" },
    );
    expect(result).toEqual({
      id: "pi_1",
      clientSecret: "pi_1_secret",
      status: "requires_payment_method",
      amount: 44_000,
      currency: "thb",
      bookingId: "b1",
    });
  });

  it("maps a missing client secret to '' and missing metadata to a null booking id", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({ status: "canceled", client_secret: null, metadata: {} }),
    );
    expect(await provider.retrieveIntent("pi_1")).toMatchObject({
      clientSecret: "",
      bookingId: null,
    });
  });
});

describe("StripePaymentProvider.cancelIntent", () => {
  it("cancels an intent that can still be paid", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(intent({ status: "requires_payment_method" }));
    paymentIntents.cancel.mockResolvedValue(intent({ status: "canceled" }));

    expect(await provider.cancelIntent("pi_1")).toBe("cancelled");
    expect(paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
  });

  it("reports nothing to cancel for an already cancelled intent, without calling cancel", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(intent({ status: "canceled" }));

    expect(await provider.cancelIntent("pi_1")).toBe("nothing_to_cancel");
    expect(paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it.each(["processing", "succeeded", "requires_capture"] as const)(
    "never cancels a %s intent: the webhook decides",
    async (status) => {
      const { paymentIntents, provider } = stubClient();
      paymentIntents.retrieve.mockResolvedValue(intent({ status }));

      expect(await provider.cancelIntent("pi_1")).toBe("in_progress");
      expect(paymentIntents.cancel).not.toHaveBeenCalled();
    },
  );

  it("customer paid between retrieve and cancel: Stripe refuses, the re-read says in progress", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve
      .mockResolvedValueOnce(intent({ status: "requires_payment_method" }))
      .mockResolvedValueOnce(intent({ status: "succeeded" }));
    paymentIntents.cancel.mockRejectedValue(invalidRequest());

    expect(await provider.cancelIntent("pi_1")).toBe("in_progress");
  });

  it("cancelled by someone else meanwhile: nothing to cancel", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve
      .mockResolvedValueOnce(intent({ status: "requires_action" }))
      .mockResolvedValueOnce(intent({ status: "canceled" }));
    paymentIntents.cancel.mockRejectedValue(invalidRequest());

    expect(await provider.cancelIntent("pi_1")).toBe("nothing_to_cancel");
  });

  it("rethrows a refusal it cannot explain, and any other error (e.g. Stripe down)", async () => {
    const unexplained = stubClient();
    unexplained.paymentIntents.retrieve.mockResolvedValue(
      intent({ status: "requires_payment_method" }),
    );
    unexplained.paymentIntents.cancel.mockRejectedValue(invalidRequest());
    await expect(unexplained.provider.cancelIntent("pi_1")).rejects.toBeInstanceOf(
      Stripe.errors.StripeInvalidRequestError,
    );

    const down = stubClient();
    down.paymentIntents.retrieve.mockResolvedValue(intent({ status: "requires_payment_method" }));
    down.paymentIntents.cancel.mockRejectedValue(new Error("socket hang up"));
    await expect(down.provider.cancelIntent("pi_1")).rejects.toThrow("socket hang up");
    expect(down.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
  });
});

describe("StripePaymentProvider.refund", () => {
  it("refunds the whole intent with a fixed idempotency key, so a retried webhook never refunds twice", async () => {
    const { refunds, provider } = stubClient();
    refunds.create.mockResolvedValue({ id: "re_1" });

    await provider.refund("pi_1");

    expect(refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", reason: "requested_by_customer" },
      { idempotencyKey: "refund:pi_1" },
    );
  });
});

describe("StripePaymentProvider.paymentDetails", () => {
  const charge = (details: object) => ({ object: "charge", payment_method_details: details });

  it("asks Stripe to expand the charge and the failed payment method", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(intent({ status: "succeeded" }));
    await provider.paymentDetails("pi_1");
    expect(paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", {
      expand: ["latest_charge", "last_payment_error.payment_method"],
    });
  });

  it("reads brand and last 4 from the charge of a card payment", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({
        status: "succeeded",
        latest_charge: charge({
          type: "card",
          card: { brand: "mastercard", last4: "4444" },
        }) as unknown as Stripe.Charge,
      }),
    );
    expect(await provider.paymentDetails("pi_1")).toEqual({
      method: "CARD",
      cardBrand: "mastercard",
      cardLast4: "4444",
    });
  });

  it("PromptPay has no card details", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({
        status: "succeeded",
        latest_charge: charge({ type: "promptpay" }) as unknown as Stripe.Charge,
      }),
    );
    expect(await provider.paymentDetails("pi_1")).toEqual({
      method: "PROMPTPAY",
      cardBrand: null,
      cardLast4: null,
    });
  });

  it("a declined card has no charge: details come from the failed payment method", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({
        status: "requires_payment_method",
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          payment_method: { type: "card", card: { brand: "visa", last4: "0002" } },
        } as unknown as Stripe.PaymentIntent.LastPaymentError,
      }),
    );
    expect(await provider.paymentDetails("pi_1")).toEqual({
      method: "CARD",
      cardBrand: "visa",
      cardLast4: "0002",
    });
  });

  it("a failed PromptPay payment is recorded as PromptPay", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({
        status: "requires_payment_method",
        last_payment_error: {
          type: "invalid_request_error",
          payment_method: { type: "promptpay" },
        } as unknown as Stripe.PaymentIntent.LastPaymentError,
      }),
    );
    expect((await provider.paymentDetails("pi_1")).method).toBe("PROMPTPAY");
  });

  it("nothing known yet (unexpanded charge id, no error): a card with no details", async () => {
    const { paymentIntents, provider } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({ status: "processing", latest_charge: "ch_1" }),
    );
    expect(await provider.paymentDetails("pi_1")).toEqual({
      method: "CARD",
      cardBrand: null,
      cardLast4: null,
    });
  });
});

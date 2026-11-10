import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "../config/config.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { FakePaymentProvider } from "./fake.provider.js";
import type { PaymentProvider } from "./payment-provider.js";
import { actionForUnconfirmedPayment, amountMatches, canReuseIntent } from "./payment-rules.js";
import { createPaymentProvider } from "./payments.module.js";
import { ProviderPaymentGateway } from "./provider-payment-gateway.js";
import { StripePaymentProvider } from "./stripe.provider.js";

describe("canReuseIntent", () => {
  it.each(["requires_payment_method", "requires_confirmation", "requires_action", "processing"])(
    "reuses a %s intent",
    (status) => {
      expect(canReuseIntent({ status, clientSecret: "pi_secret" })).toBe(true);
    },
  );

  it.each(["succeeded", "canceled", "requires_capture"])(
    "never hands out a %s intent again",
    (status) => {
      expect(canReuseIntent({ status, clientSecret: "pi_secret" })).toBe(false);
    },
  );

  it("needs a client secret", () => {
    expect(canReuseIntent({ status: "requires_payment_method", clientSecret: "" })).toBe(false);
  });
});

describe("amountMatches", () => {
  it("is exactly the total in satang, in THB", () => {
    expect(amountMatches({ amount: 44_000, currency: "thb" }, 440)).toBe(true);
  });

  it("rejects one satang off, another currency, or a partial payment", () => {
    expect(amountMatches({ amount: 43_999, currency: "thb" }, 440)).toBe(false);
    expect(amountMatches({ amount: 44_001, currency: "thb" }, 440)).toBe(false);
    expect(amountMatches({ amount: 44_000, currency: "usd" }, 440)).toBe(false);
    expect(amountMatches({ amount: 22_000, currency: "thb" }, 440)).toBe(false);
  });
});

describe("actionForUnconfirmedPayment (rule 3d)", () => {
  it("a cancelled booking (late payment) is refunded", () => {
    expect(actionForUnconfirmedPayment("CANCELLED", false)).toBe("refund_late");
  });

  it("a booking this payment already confirmed needs nothing (replayed event)", () => {
    expect(actionForUnconfirmedPayment("CONFIRMED", false)).toBe("already_confirmed");
  });

  it("a booking confirmed by ANOTHER payment refunds this one (paid twice)", () => {
    expect(actionForUnconfirmedPayment("CONFIRMED", true)).toBe("refund_duplicate");
  });

  it("never keeps money for a booking that is not confirmed by it", () => {
    expect(actionForUnconfirmedPayment("PENDING_PAYMENT", false)).toBe("refund_duplicate");
  });
});

describe("ProviderPaymentGateway", () => {
  function gateway(intentIds: string[], outcomes: Record<string, string>) {
    const prisma = {
      payment: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            intentIds.map((id, i) => ({ id: `pay_${String(i)}`, stripePaymentIntentId: id })),
          ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const provider = {
      cancelIntent: vi.fn((id: string) => Promise.resolve(outcomes[id])),
    };
    return {
      prisma,
      provider,
      gateway: new ProviderPaymentGateway(
        prisma as unknown as PrismaService,
        provider as unknown as PaymentProvider,
      ),
    };
  }

  it("nothing open: nothing to cancel, no writes", async () => {
    const { gateway: g, prisma } = gateway([], {});
    expect(await g.cancelPaymentIntent("b1")).toBe("nothing_to_cancel");
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("looks only at the booking's open (pending / failed) payments", async () => {
    const { gateway: g, prisma } = gateway([], {});
    await g.cancelPaymentIntent("b1");
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: "b1", status: { in: ["PENDING", "FAILED"] } },
      }),
    );
  });

  it("cancels every open intent and marks each row CANCELLED with a guarded update", async () => {
    const { gateway: g, prisma } = gateway(["pi_a", "pi_b"], {
      pi_a: "cancelled",
      pi_b: "nothing_to_cancel",
    });
    expect(await g.cancelPaymentIntent("b1")).toBe("cancelled");
    expect(prisma.payment.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay_0", status: { in: ["PENDING", "FAILED"] } },
      data: { status: "CANCELLED" },
    });
  });

  it("a payment in flight wins and its row is left for the webhook; the others are still cancelled", async () => {
    const {
      gateway: g,
      prisma,
      provider,
    } = gateway(["pi_a", "pi_b"], {
      pi_a: "in_progress",
      pi_b: "cancelled",
    });
    expect(await g.cancelPaymentIntent("b1")).toBe("in_progress");
    expect(provider.cancelIntent).toHaveBeenCalledTimes(2);
    expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "pay_1" }) as unknown }),
    );
  });
});

describe("createPaymentProvider", () => {
  const config = (env: Record<string, string | undefined>): ConfigService =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

  it("uses the in-process fake unless PAYMENTS_PROVIDER is stripe", () => {
    expect(createPaymentProvider(config({ PAYMENTS_PROVIDER: "fake" }))).toBeInstanceOf(
      FakePaymentProvider,
    );
  });

  it("builds the Stripe adapter with the publishable key from the environment", () => {
    const provider = createPaymentProvider(
      config({
        PAYMENTS_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_test_x",
        STRIPE_PUBLISHABLE_KEY: "pk_test_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      }),
    );
    expect(provider).toBeInstanceOf(StripePaymentProvider);
    expect(provider.publishableKey).toBe("pk_test_x");
  });

  it("refuses to start Stripe with a key missing", () => {
    expect(() =>
      createPaymentProvider(
        config({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x" }),
      ),
    ).toThrow("Stripe keys are missing");
  });
});

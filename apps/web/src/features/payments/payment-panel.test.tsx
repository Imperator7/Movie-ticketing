import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/intl";
import { isStripeKey, PaymentPanel } from "./payment-panel";

const createPaymentIntent = vi.fn();
vi.mock("@/api/generated/endpoints/payments/payments", () => ({
  createPaymentIntent: (...args: unknown[]) => createPaymentIntent(...args) as unknown,
}));
vi.mock("./stripe-payment-panel", () => ({
  StripePaymentPanel: ({ publishableKey }: { publishableKey: string }) => (
    <p>stripe panel {publishableKey}</p>
  ),
}));

const props = {
  bookingId: "b1",
  amountBaht: 440,
  locale: "en" as const,
  disabled: false,
  onSubmitted: vi.fn(),
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <PaymentPanel {...props} />
    </QueryClientProvider>,
  );
}

const intent = (publishableKey: string) => ({
  status: 200,
  data: {
    clientSecret: "pi_1_secret",
    publishableKey,
    amountBaht: 440,
    paymentExpiresAt: "2026-10-28T10:05:00Z",
  },
});

describe("isStripeKey", () => {
  it("accepts test and live publishable keys only", () => {
    expect(isStripeKey("pk_test_123")).toBe(true);
    expect(isStripeKey("pk_live_123")).toBe(true);
    expect(isStripeKey("demo")).toBe(false);
    expect(isStripeKey("sk_test_123")).toBe(false);
  });
});

describe("PaymentPanel", () => {
  it("shows Stripe's Payment Element for a Stripe key", async () => {
    createPaymentIntent.mockResolvedValueOnce(intent("pk_test_abc"));
    renderPanel();
    expect(await screen.findByText("stripe panel pk_test_abc")).toBeInTheDocument();
    expect(createPaymentIntent).toHaveBeenCalledWith("b1");
  });

  it("falls back to the demo panel when the API runs the fake provider", async () => {
    createPaymentIntent.mockResolvedValue(intent("demo"));
    renderPanel();
    expect(await screen.findByText(/Demo mode/)).toBeInTheDocument();
  });
});

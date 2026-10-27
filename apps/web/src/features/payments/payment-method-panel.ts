import type { ComponentType } from "react";
import type { Locale } from "@/lib/format";

export interface PaymentMethodPanelProps {
  bookingId: string;
  amountBaht: number;
  locale: Locale;
  /** True when the window ended or the booking is no longer payable. */
  disabled: boolean;
  /** The payment was submitted successfully; the caller moves on to `/checkout/complete`. */
  onSubmitted: () => void;
}

/**
 * The payment UI of the checkout screen. Phase 5 swaps `DemoPaymentPanel` for a Stripe Payment
 * Element implementation of this same interface; the checkout screen doesn't change.
 */
export type PaymentMethodPanel = ComponentType<PaymentMethodPanelProps>;

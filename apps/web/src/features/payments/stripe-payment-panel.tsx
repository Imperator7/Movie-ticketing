"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CircleAlert, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatBaht } from "@/lib/format";
import type { PaymentMethodPanelProps } from "./payment-method-panel";

/** One Stripe.js instance per publishable key (loadStripe must not run on every render). */
const stripeByKey = new Map<string, Promise<Stripe | null>>();
function stripeFor(publishableKey: string): Promise<Stripe | null> {
  let stripe = stripeByKey.get(publishableKey);
  if (!stripe) {
    stripe = loadStripe(publishableKey);
    stripeByKey.set(publishableKey, stripe);
  }
  return stripe;
}

function PayForm({
  bookingId,
  amountBaht,
  locale,
  disabled,
  onSubmitted,
}: PaymentMethodPanelProps) {
  const t = useTranslations("checkout");
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    // Card: confirmed in place. PromptPay: Stripe.js shows the QR and resolves when it is paid or closed.
    // The booking is confirmed by the webhook, never by this result (database-design §3).
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/${locale}/checkout/complete?bookingId=${bookingId}`,
      },
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? t("declined"));
      return;
    }
    onSubmitted();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <PaymentElement options={{ layout: "tabs" }} />
      <Button type="submit" size="xl" disabled={disabled || busy || !stripe || !elements}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {busy ? t("paying") : t("pay", { amount: formatBaht(amountBaht, locale) })}
      </Button>
      {error ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

/** The Stripe Payment Element (card + PromptPay) for an intent the API already created. */
export function StripePaymentPanel({
  publishableKey,
  clientSecret,
  ...props
}: PaymentMethodPanelProps & { publishableKey: string; clientSecret: string }) {
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <Elements
        stripe={stripeFor(publishableKey)}
        options={{
          clientSecret,
          locale: locale === "th" ? "th" : "en",
          appearance: { theme: "night", variables: { borderRadius: "10px" } },
        }}
      >
        <PayForm {...props} />
      </Elements>
    </section>
  );
}

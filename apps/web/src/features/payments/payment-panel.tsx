"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createPaymentIntent } from "@/api/generated/endpoints/payments/payments";
import { dataOf } from "@/api/unwrap";
import { QueryError } from "@/components/page-states";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoPaymentPanel } from "./demo-payment-panel";
import type { PaymentMethodPanelProps } from "./payment-method-panel";
import { StripePaymentPanel } from "./stripe-payment-panel";

/** A Stripe publishable key; anything else ("demo") means the API runs the fake payment provider. */
export const isStripeKey = (key: string): boolean => /^pk_(test|live)_/.test(key);

/**
 * The checkout's payment UI: asks the API for the booking's PaymentIntent, then shows Stripe's Payment Element,
 * or the demo panel when the API runs without Stripe (PAYMENTS_PROVIDER=fake).
 */
export function PaymentPanel(props: PaymentMethodPanelProps) {
  const t = useTranslations("checkout");
  const intent = useQuery({
    queryKey: ["payment-intent", props.bookingId],
    queryFn: () => createPaymentIntent(props.bookingId),
    enabled: !props.disabled,
    // The intent is reused server-side; never refetch it in the background.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const body = dataOf(intent.data);

  if (intent.isError) {
    return (
      <QueryError
        title={t("loadError")}
        error={intent.error}
        onRetry={() => void intent.refetch()}
      />
    );
  }
  if (!body) {
    return props.disabled ? <DemoPaymentPanel {...props} /> : <Skeleton className="h-64" />;
  }
  if (isStripeKey(body.publishableKey)) {
    return (
      <StripePaymentPanel
        {...props}
        publishableKey={body.publishableKey}
        clientSecret={body.clientSecret}
      />
    );
  }
  return <DemoPaymentPanel {...props} />;
}

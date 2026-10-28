"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleAlert, CreditCard, FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import { createPaymentIntent } from "@/api/generated/endpoints/payments/payments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBaht } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { demoPay } from "./demo-pay";
import type { PaymentMethodPanelProps } from "./payment-method-panel";

/**
 * DEMO stand-in for the Stripe Payment Element (Phase 5). It has no card inputs at all: the card tab
 * shows Stripe's read-only test card, and PromptPay shows a placeholder QR.
 */
export function DemoPaymentPanel({
  bookingId,
  amountBaht,
  locale,
  disabled,
  onSubmitted,
}: PaymentMethodPanelProps) {
  const t = useTranslations("checkout");

  // Exercise the contract's payment-intent endpoint like the real panel will (the result is unused here).
  useEffect(() => {
    if (!disabled) void createPaymentIntent(bookingId).catch(() => undefined);
  }, [bookingId, disabled]);

  const pay = useMutation({
    mutationFn: (method: "CARD" | "PROMPTPAY") => demoPay(bookingId, method),
    onSuccess: (result) => {
      if (result === "processing") onSubmitted();
    },
  });

  const declined = pay.data === "declined";
  // The real API has no /__demo/pay (Stripe comes in Phase 5): say so instead of failing silently.
  const unavailable = pay.error instanceof ApiError && pay.error.status === 404;
  const busy = pay.isPending || pay.data === "processing";
  const amount = formatBaht(amountBaht, locale);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          <FlaskConical aria-hidden />
          {t("demoBadge")}
        </Badge>
        <p className="text-xs text-muted-foreground">{t("demoNote")}</p>
      </div>

      <Tabs defaultValue="card">
        <TabsList>
          <TabsTrigger value="card">{t("tabCard")}</TabsTrigger>
          <TabsTrigger value="promptpay">{t("tabPromptpay")}</TabsTrigger>
        </TabsList>

        <TabsContent value="card" className="flex flex-col gap-3 pt-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3">
            <CreditCard aria-hidden className="size-5 text-muted-foreground" />
            <div>
              <p className="font-mono text-sm font-medium">{t("testCard")}</p>
              <p className="text-xs text-muted-foreground">{t("testCardNote")}</p>
            </div>
          </div>
          <Button
            size="xl"
            disabled={disabled || busy}
            onClick={() => {
              pay.mutate("CARD");
            }}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {busy ? t("paying") : t("pay", { amount })}
          </Button>
        </TabsContent>

        <TabsContent value="promptpay" className="flex flex-col items-center gap-3 pt-4">
          <div className="rounded-xl bg-card p-3 text-card-foreground ring-1 ring-border dark:bg-foreground dark:text-background">
            <QRCodeSVG
              value={`PROMPTPAY-DEMO|${bookingId}|${amountBaht.toString()}`}
              size={168}
              fgColor="currentColor"
              bgColor="transparent"
              role="img"
              title={t("qrAlt")}
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">{t("promptpayHint")}</p>
          <Button
            size="xl"
            variant="secondary"
            disabled={disabled || busy}
            onClick={() => {
              pay.mutate("PROMPTPAY");
            }}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {busy ? t("paying") : t("simulateScan")}
          </Button>
        </TabsContent>
      </Tabs>

      {unavailable ? (
        <Alert role="status">
          <FlaskConical aria-hidden />
          <AlertDescription>{t("paymentUnavailable")}</AlertDescription>
        </Alert>
      ) : null}

      {declined ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription>{t("declined")}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

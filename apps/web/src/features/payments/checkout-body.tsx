"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Booking } from "@/api/generated/model";
import { CountdownChip } from "@/components/cinema/countdown-chip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatBaht, formatShowDateTime, type Locale } from "@/lib/format";
import { pickText } from "@/lib/localized";
import type { PaymentMethodPanel } from "./payment-method-panel";

export interface CheckoutBodyProps {
  booking: Booking;
  /** Time left to pay on the server's clock; `null` while unknown. */
  msLeft: number | null;
  locale: Locale;
  PaymentPanel: PaymentMethodPanel;
  /** The user pressed "cancel booking" and confirmed. */
  onConfirmCancel: () => void;
  /** The user tried to leave (back button or link) and the "going back will cancel" dialog is open. */
  leaveOpen: boolean;
  onConfirmLeave: () => void;
  onKeepBooking: () => void;
  /** "Time's up" dialog action: back to the seat map. */
  onTimeUpContinue: () => void;
  onPaymentSubmitted: () => void;
  /** Booking is not pending (confirmed/cancelled meanwhile): go to the result screen. */
  onViewResult: () => void;
  busy?: boolean;
}

/** Seconds at which the last minute is announced to screen readers. */
const ANNOUNCE_AT = [60, 30, 10];

/** The checkout screen without data fetching: summary, countdown, payment panel and its dialogs. */
export function CheckoutBody({
  booking,
  msLeft,
  locale,
  PaymentPanel,
  onConfirmCancel,
  leaveOpen,
  onConfirmLeave,
  onKeepBooking,
  onTimeUpContinue,
  onPaymentSubmitted,
  onViewResult,
  busy = false,
}: CheckoutBodyProps) {
  const t = useTranslations("checkout");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const pending = booking.status === "PENDING_PAYMENT";
  const timeUp = pending && msLeft !== null && msLeft <= 0;
  const secondsLeft = msLeft === null ? null : Math.ceil(msLeft / 1000);

  // Announce the last minute (60 / 30 / 10 s) to screen readers; state is adjusted while rendering.
  const [lastSecond, setLastSecond] = useState<number | null>(null);
  if (secondsLeft !== lastSecond) {
    setLastSecond(secondsLeft);
    if (secondsLeft !== null && ANNOUNCE_AT.includes(secondsLeft)) {
      setAnnouncement(
        secondsLeft === 60 ? t("announceMinute") : t("announceSeconds", { seconds: secondsLeft }),
      );
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
      <section aria-labelledby="checkout-summary" className="flex flex-col gap-4">
        <h2 id="checkout-summary" className="text-xl font-semibold">
          {t("summary")}
        </h2>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-lg font-semibold">{pickText(booking.showtime.movie.title, locale)}</p>
          <p className="text-sm text-muted-foreground">
            {pickText(booking.showtime.cinema.name, locale)} ·{" "}
            {formatShowDateTime(booking.showtime.startsAt, locale)}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("seats")}</dt>
              <dd className="font-mono font-medium">
                {booking.seats.map((s) => s.label).join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("total")}</dt>
              <dd className="font-mono text-lg font-semibold tabular">
                {formatBaht(booking.totalBaht, locale)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {pending ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <span className="text-sm text-muted-foreground">{t("timeLeft")}</span>
              {msLeft !== null ? <CountdownChip msLeft={msLeft} ariaLabel={t("timeLeft")} /> : null}
            </div>
            <PaymentPanel
              bookingId={booking.id}
              amountBaht={booking.totalBaht}
              locale={locale}
              disabled={timeUp || busy}
              onSubmitted={onPaymentSubmitted}
            />
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setCancelOpen(true);
              }}
            >
              {t("cancelBooking")}
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <p role="status">{t("notPending")}</p>
            <Button onClick={onViewResult}>{t("viewResult")}</Button>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onConfirmCancel();
              }}
            >
              {t("confirmCancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={leaveOpen}
        onOpenChange={(open) => {
          if (!open) onKeepBooking();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("leaveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onConfirmLeave();
              }}
            >
              {t("leaveConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Time's up: not dismissible, the only way on is back to the seat map. */}
      <AlertDialog open={timeUp}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timesUpTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("timesUpDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                onTimeUpContinue();
              }}
            >
              {t("timesUpAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

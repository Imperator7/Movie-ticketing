"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { useGetBooking } from "@/api/generated/endpoints/bookings/bookings";
import type { Booking } from "@/api/generated/model";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/features/auth/require-auth";
import { BookingTicket } from "@/features/bookings/booking-ticket";
import { showtimePath } from "@/features/showtimes/seat-params";
import { Link } from "@/i18n/navigation";

const POLL_MS = 1_500;

/** The outcome for a booking: confirming..., ticket, or a cancelled notice with the plan §6 copy. */
export function CheckoutResult({ booking }: { booking: Booking | undefined }) {
  const t = useTranslations("complete");

  if (!booking || booking.status === "PENDING_PAYMENT") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
        <Loader2 aria-hidden className="size-8 animate-spin text-primary" />
        <p className="text-xl font-semibold">{t("confirming")}</p>
        <p className="text-sm text-muted-foreground">{t("confirmingHint")}</p>
      </div>
    );
  }

  if (booking.status === "CONFIRMED") {
    return (
      <div className="flex flex-col gap-6">
        <div role="status" className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-2xl font-bold">{t("confirmedTitle")}</h2>
          <p className="text-muted-foreground">{t("confirmedHint")}</p>
        </div>
        <BookingTicket booking={booking} />
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href={`/booking?id=${booking.id}`}>{t("viewTicket")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/bookings">{t("myBookings")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const message =
    booking.cancelReason === "LATE_PAYMENT_REFUNDED"
      ? t("cancelledLate")
      : booking.cancelReason === "PAYMENT_TIMEOUT"
        ? t("cancelledTimeout")
        : t("cancelledUser");
  const seatsHref = showtimePath(
    booking.showtime.id,
    booking.seats.map((s) => s.label),
  );

  return (
    <div className="flex flex-col items-start gap-4">
      <Alert role="alert" variant="warning">
        <TriangleAlert aria-hidden />
        <AlertDescription className="text-foreground">{message}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={seatsHref}>{t("backToSeats")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}

function CompleteContent({ bookingId }: { bookingId: string }) {
  const t = useTranslations("complete");
  const query = useGetBooking(bookingId, {
    query: {
      enabled: bookingId !== "",
      // Poll until the webhook has decided (CONFIRMED / CANCELLED).
      refetchInterval: (q) => {
        const response = q.state.data;
        return response?.status === 200 && response.data.status !== "PENDING_PAYMENT"
          ? false
          : POLL_MS;
      },
      staleTime: 0,
    },
  });
  if (query.isError) {
    return (
      <QueryError title={t("loadError")} error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  return <CheckoutResult booking={dataOf(query.data)} />;
}

/** `/checkout/complete?bookingId=` (plan §6): "Confirming payment…" then the ticket or the reason it failed. */
export function CheckoutCompleteView() {
  const bookingId = useSearchParams().get("bookingId") ?? "";
  return (
    <PageContainer>
      <RequireAuth>
        <CompleteContent bookingId={bookingId} />
      </RequireAuth>
    </PageContainer>
  );
}

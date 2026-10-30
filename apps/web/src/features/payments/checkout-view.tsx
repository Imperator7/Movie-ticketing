"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter as useFullRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGetBooking } from "@/api/generated/endpoints/bookings/bookings";
import type { Booking } from "@/api/generated/model";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAuth } from "@/features/auth/require-auth";
import { useErrorMessage } from "@/features/auth/use-error-message";
import { useBackNavigationGuard, type BlockedNavigation } from "@/features/bookings/use-back-guard";
import { useCancelBookingOptimistic } from "@/features/bookings/use-booking-mutations";
import { useCountdown } from "@/features/bookings/use-countdown";
import { showtimePath } from "@/features/showtimes/seat-params";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { toLocale } from "@/lib/localized";
import { CheckoutBody } from "./checkout-body";
import type { PaymentMethodPanel } from "./payment-method-panel";
import { PaymentPanel as DefaultPaymentPanel } from "./payment-panel";

function CheckoutContent({ bookingId, Panel }: { bookingId: string; Panel: PaymentMethodPanel }) {
  const t = useTranslations("checkout");
  const locale = toLocale(useLocale());
  const router = useRouter();
  const fullRouter = useFullRouter();
  const errorMessage = useErrorMessage();

  const query = useGetBooking(bookingId, { query: { enabled: bookingId !== "" } });
  const booking = dataOf(query.data);
  const msLeft = useCountdown(booking?.paymentExpiresAt);

  const [leaving, setLeaving] = useState<BlockedNavigation | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const pending = booking?.status === "PENDING_PAYMENT";

  useBackNavigationGuard(pending && !submitted, (navigation) => {
    setLeaving(navigation);
  });

  // Confirmed meanwhile (e.g. paid in another tab): go to the result.
  useEffect(() => {
    if (booking?.status === "CONFIRMED")
      router.replace(`/checkout/complete?bookingId=${booking.id}`);
  }, [booking, router]);

  const seatsPath = (b: Booking) =>
    showtimePath(
      b.showtime.id,
      b.seats.map((s) => s.label),
    );

  const cancel = useCancelBookingOptimistic();

  /**
   * Cancels the booking (optimistically), then goes to `go`. If the server refuses (e.g. a payment
   * is in progress) everything is rolled back, the error is shown and the user stays here.
   */
  const cancelThen = async (b: Booking, go: () => void) => {
    setLeaving(null);
    try {
      await cancel.mutateAsync(b);
    } catch (error) {
      // Already cancelled or timed out: the seat map is still the right place.
      if (!(error instanceof ApiError && error.code === "BOOKING_NOT_PENDING")) {
        toast.error(errorMessage(error));
        return;
      }
    }
    go();
  };

  if (query.isError) {
    return (
      <QueryError title={t("loadError")} error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (!booking) {
    return (
      <div aria-busy="true" className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <CheckoutBody
      booking={booking}
      msLeft={msLeft}
      locale={locale}
      PaymentPanel={Panel}
      busy={cancel.isPending}
      leaveOpen={leaving !== null}
      onKeepBooking={() => {
        setLeaving(null);
      }}
      onConfirmLeave={() => {
        const target = leaving;
        void cancelThen(booking, () => {
          // A clicked link goes where it pointed (its href already has the locale); back goes to the seat map.
          if (target?.type === "link") fullRouter.push(target.href);
          else router.replace(seatsPath(booking));
        });
      }}
      onConfirmCancel={() => {
        void cancelThen(booking, () => {
          router.replace(seatsPath(booking));
        });
      }}
      onTimeUpContinue={() => {
        void cancelThen(booking, () => {
          router.replace(seatsPath(booking));
        });
      }}
      onPaymentSubmitted={() => {
        setSubmitted(true);
        router.push(`/checkout/complete?bookingId=${booking.id}`);
      }}
      onViewResult={() => {
        router.replace(`/checkout/complete?bookingId=${booking.id}`);
      }}
    />
  );
}

/** `/checkout?bookingId=`: pay within 5 minutes; leaving cancels the booking (plan §6). */
export function CheckoutView({
  PaymentPanel = DefaultPaymentPanel,
}: {
  PaymentPanel?: PaymentMethodPanel;
}) {
  const t = useTranslations("checkout");
  const bookingId = useSearchParams().get("bookingId") ?? "";
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <RequireAuth>
          <CheckoutContent bookingId={bookingId} Panel={PaymentPanel} />
        </RequireAuth>
      </div>
    </PageContainer>
  );
}

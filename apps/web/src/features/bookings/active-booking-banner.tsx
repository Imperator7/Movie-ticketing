"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname as useFullPathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGetActiveBooking } from "@/api/generated/endpoints/bookings/bookings";
import { BookingBanner } from "@/components/cinema/booking-banner";
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
import { useAuth } from "@/features/auth/session";
import { useErrorMessage } from "@/features/auth/use-error-message";
import { useRouter } from "@/i18n/navigation";
import { pickText, toLocale } from "@/lib/localized";
import { useCancelBookingOptimistic } from "./use-booking-mutations";
import { useCountdown } from "./use-countdown";

/**
 * Global "booking in progress" bar (plan §6). `getActiveBooking` runs on load and on window focus
 * (React Query's refetchOnWindowFocus). Hidden on the checkout pages, which show the same info.
 */
export function ActiveBookingBanner() {
  const t = useTranslations("banner");
  const locale = toLocale(useLocale());
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const fullPath = useFullPathname();
  const { ready, isAuthenticated } = useAuth();
  const [confirming, setConfirming] = useState(false);

  const query = useGetActiveBooking({
    query: { enabled: ready && isAuthenticated, refetchOnWindowFocus: true },
  });
  const response = query.data;
  const booking = response?.status === 200 ? response.data : undefined;
  const msLeft = useCountdown(booking?.paymentExpiresAt);

  const expired = msLeft !== null && msLeft <= 0;
  useEffect(() => {
    // The window ended: ask the server again (it cancels with PAYMENT_TIMEOUT) so the bar goes away.
    if (expired) void query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  // Optimistic: the bar disappears at once and rolls back if the server refuses.
  const cancel = useCancelBookingOptimistic();

  if (!booking || msLeft === null || /\/checkout(\/|$)/.test(fullPath)) return null;

  return (
    <>
      <BookingBanner
        className="static"
        movieTitle={pickText(booking.showtime.movie.title, locale)}
        seats={booking.seats.map((s) => s.label)}
        msLeft={msLeft}
        labels={{
          title: t("title"),
          seats: t("seats"),
          continuePayment: t("continuePayment"),
          cancel: t("cancel"),
          timeLeft: t("timeLeft"),
        }}
        onContinue={() => {
          router.push(`/checkout?bookingId=${booking.id}`);
        }}
        onCancel={() => {
          setConfirming(true);
        }}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                cancel.mutate(booking, {
                  onError: (error) => {
                    toast.error(errorMessage(error));
                  },
                });
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

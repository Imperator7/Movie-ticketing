"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useGetBooking } from "@/api/generated/endpoints/bookings/bookings";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAuth } from "@/features/auth/require-auth";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { BookingTicket } from "./booking-ticket";

function TicketContent({ id }: { id: string }) {
  const t = useTranslations("ticket");
  const query = useGetBooking(id, { query: { enabled: id !== "" } });
  const booking = dataOf(query.data);

  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <QueryError
        title={missing ? t("notFound") : t("loadError")}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!booking) return <Skeleton aria-busy="true" className="mx-auto h-96 w-full max-w-md" />;

  return (
    <div className="flex flex-col gap-4">
      <BookingTicket booking={booking} />
      {booking.status === "PENDING_PAYMENT" ? (
        <Button asChild className="mx-auto">
          <Link href={`/checkout?bookingId=${booking.id}`}>{t("continuePayment")}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** `/booking?id=`: the ticket. */
export function BookingView() {
  const t = useTranslations("ticket");
  const id = useSearchParams().get("id") ?? "";
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <Link href="/bookings" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t("back")}
        </Link>
        <RequireAuth>
          <TicketContent id={id} />
        </RequireAuth>
      </div>
    </PageContainer>
  );
}

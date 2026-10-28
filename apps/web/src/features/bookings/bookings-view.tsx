"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useListMyBookings } from "@/api/generated/endpoints/bookings/bookings";
import type { Booking } from "@/api/generated/model";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth } from "@/features/auth/require-auth";
import { Link } from "@/i18n/navigation";
import { formatBaht, formatShowDateTime } from "@/lib/format";
import { pickText, toLocale } from "@/lib/localized";

function BookingRow({ booking }: { booking: Booking }) {
  const t = useTranslations("bookings");
  const locale = toLocale(useLocale());
  const confirmed = booking.status === "CONFIRMED";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-semibold">{pickText(booking.showtime.movie.title, locale)}</p>
        <p className="text-sm text-muted-foreground">
          {formatShowDateTime(booking.showtime.startsAt, locale)} ·{" "}
          {pickText(booking.showtime.cinema.name, locale)}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {booking.bookingCode} ·{" "}
          {t("seats", { seats: booking.seats.map((s) => s.label).join(", ") })} ·{" "}
          {formatBaht(booking.totalBaht, locale)}
        </p>
      </div>
      <Badge variant={confirmed ? "default" : "secondary"}>
        {confirmed ? t("statusConfirmed") : t("statusCancelled")}
      </Badge>
      <Button asChild size="sm" variant="outline">
        <Link href={`/booking?id=${booking.id}`}>{t("view")}</Link>
      </Button>
    </li>
  );
}

export const BOOKINGS_PAGE_SIZE = 10;

function BookingList({ scope }: { scope: "upcoming" | "past" }) {
  const t = useTranslations("bookings");
  const [page, setPage] = useState(1);
  const query = useListMyBookings(
    { scope, page, pageSize: BOOKINGS_PAGE_SIZE },
    { query: { placeholderData: keepPreviousData } },
  );
  const result = dataOf(query.data);
  const items = result?.items;
  const pages = result ? Math.max(1, Math.ceil(result.total / BOOKINGS_PAGE_SIZE)) : 1;

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <QueryError title={t("loadError")} error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-muted-foreground">
          {scope === "upcoming" ? t("emptyUpcoming") : t("emptyPast")}
        </p>
        <Button asChild>
          <Link href="/movies">{t("browse")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((booking) => (
          <BookingRow key={booking.id} booking={booking} />
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground tabular">
            {t("pageOf", { page, pages })}
          </span>
          <Button
            variant="outline"
            disabled={page >= pages}
            onClick={() => {
              setPage(page + 1);
            }}
          >
            {t("next")}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

export function BookingsView() {
  const t = useTranslations("bookings");
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <RequireAuth>
          <Tabs
            value={scope}
            onValueChange={(value) => {
              setScope(value === "past" ? "past" : "upcoming");
            }}
          >
            <TabsList>
              <TabsTrigger value="upcoming">{t("upcoming")}</TabsTrigger>
              <TabsTrigger value="past">{t("past")}</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="pt-4">
              <BookingList scope="upcoming" />
            </TabsContent>
            <TabsContent value="past" className="pt-4">
              <BookingList scope="past" />
            </TabsContent>
          </Tabs>
        </RequireAuth>
      </div>
    </PageContainer>
  );
}

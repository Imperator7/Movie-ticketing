"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useListMyBookings } from "@/api/generated/endpoints/bookings/bookings";
import type { Booking } from "@/api/generated/model";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { PosterImage } from "@/components/cinema/movie-poster-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth } from "@/features/auth/require-auth";
import { Link } from "@/i18n/navigation";
import {
  bangkokMonth,
  formatBaht,
  formatMonthYear,
  formatShowtime,
  formatTicketDate,
  type Locale,
} from "@/lib/format";
import { pickText, toLocale } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { FORMAT_LABEL, Perforation, SeatChips, TicketStamp, ticketState } from "./ticket-parts";

export interface MonthGroup {
  /** "YYYY-MM" in Bangkok. */
  key: string;
  label: string;
  bookings: Booking[];
}

/** Consecutive bookings of the same Bangkok month (the list is already sorted), for the history headings. */
export function groupByMonth(bookings: readonly Booking[], locale: Locale): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const booking of bookings) {
    const key = bangkokMonth(booking.showtime.startsAt);
    const last = groups.at(-1);
    if (last?.key === key) last.bookings.push(booking);
    else
      groups.push({
        key,
        label: formatMonthYear(booking.showtime.startsAt, locale),
        bookings: [booking],
      });
  }
  return groups;
}

/** One booking as a ticket stub: poster | details | tear line | time stub. The whole stub opens the ticket. */
export function TicketStub({ booking, now }: { booking: Booking; now: number }) {
  const t = useTranslations("bookings");
  const tt = useTranslations("ticket");
  const locale = toLocale(useLocale());
  const { showtime } = booking;
  const title = pickText(showtime.movie.title, locale);
  const state = ticketState(booking, now);
  const used = state !== "valid";
  const stamp =
    state === "cancelled"
      ? tt("stampCancelled")
      : state === "pending"
        ? tt("stampPending")
        : state === "screened"
          ? t("stampShown")
          : null;

  return (
    <li>
      <Link
        href={`/booking?id=${booking.id}`}
        className="group relative flex min-h-36 rounded-2xl border border-border bg-card text-card-foreground shadow-sm outline-none motion-safe:transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring"
      >
        <div
          className={cn(
            "w-20 shrink-0 overflow-hidden rounded-l-2xl sm:w-24",
            used && "opacity-70 grayscale",
          )}
        >
          <PosterImage url={showtime.movie.posterUrl} title={title} placeholderShowsTitle={false} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4">
          <p className="font-mono text-xs tracking-wider text-muted-foreground">
            {booking.bookingCode}
          </p>
          <h3 className="line-clamp-2 font-heading leading-snug font-semibold group-hover:text-primary">
            {title}
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {formatTicketDate(showtime.startsAt, locale)} · {pickText(showtime.cinema.name, locale)}{" "}
            · {tt("hall", { number: showtime.hallNumber })}
          </p>
          <SeatChips labels={booking.seats.map((seat) => seat.label)} className="mt-auto" />
          {state === "valid" ? <span className="sr-only">{t("statusConfirmed")}</span> : null}
        </div>

        <Perforation orientation="vertical" />

        <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 p-2 text-center sm:w-28 sm:p-3">
          <span
            className={cn(
              "font-mono text-xl font-bold tabular sm:text-2xl",
              used && "text-muted-foreground",
            )}
          >
            {formatShowtime(showtime.startsAt)}
          </span>
          <span className="rounded-md border border-border px-1.5 font-mono text-xs font-semibold">
            {FORMAT_LABEL[showtime.format]}
          </span>
          <span className="font-mono text-xs text-muted-foreground tabular">
            {formatBaht(booking.totalBaht, locale)}
          </span>
        </div>

        {stamp && state !== "valid" ? (
          // Phones: over the (greyed) poster so it never covers the title; wider screens: top right of the details.
          <TicketStamp
            state={state}
            className="absolute top-1/2 left-1 -translate-y-1/2 px-1.5 text-xs sm:top-3 sm:right-32 sm:left-auto sm:translate-y-0 sm:px-2.5 sm:text-sm"
          >
            {stamp}
          </TicketStamp>
        ) : null}
      </Link>
    </li>
  );
}

export const BOOKINGS_PAGE_SIZE = 10;

function BookingList({ scope }: { scope: "upcoming" | "past" }) {
  const t = useTranslations("bookings");
  const locale = toLocale(useLocale());
  const [now] = useState(() => Date.now());
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
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
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
    <div className="flex flex-col gap-6">
      {groupByMonth(items, locale).map((group) => (
        <section
          key={group.key}
          aria-labelledby={`month-${group.key}`}
          className="flex flex-col gap-3"
        >
          <h2
            id={`month-${group.key}`}
            className="font-heading text-sm font-semibold tracking-wide text-muted-foreground"
          >
            {group.label}
          </h2>
          <ul className="flex flex-col gap-3">
            {group.bookings.map((booking) => (
              <TicketStub key={booking.id} booking={booking} now={now} />
            ))}
          </ul>
        </section>
      ))}
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

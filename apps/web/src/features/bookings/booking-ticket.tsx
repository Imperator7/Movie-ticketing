"use client";

import { CalendarPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useState, type ReactNode } from "react";
import type { Booking } from "@/api/generated/model";
import { PosterImage } from "@/components/cinema/movie-poster-card";
import { RatingBadge } from "@/components/cinema/rating-badge";
import { Button } from "@/components/ui/button";
import { formatBaht, formatDuration, formatShowtime, formatTicketDate } from "@/lib/format";
import { pickText, toLocale } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { buildIcs, icsFileName } from "./ics";
import { FORMAT_LABEL, Perforation, SeatChips, TicketStamp, ticketState } from "./ticket-parts";

function downloadIcs(booking: Booking, locale: "th" | "en") {
  const blob = new Blob([buildIcs(booking, locale)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFileName(booking);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/**
 * The cinema ticket: a dark header with the poster, the show details, a perforated tear line, and the stub with
 * the QR (the entry pass) and the booking code. Cancelled, unpaid and already-screened tickets carry a stamp.
 */
export function BookingTicket({ booking }: { booking: Booking }) {
  const t = useTranslations("ticket");
  const tb = useTranslations("bookings");
  const locale = toLocale(useLocale());
  const [now] = useState(() => Date.now());
  const { showtime } = booking;
  const { movie } = showtime;
  const title = pickText(movie.title, locale);
  const state = ticketState(booking, now);
  const hasQr = (state === "valid" || state === "screened") && booking.ticketQr !== null;
  const stamp =
    state === "cancelled"
      ? t("stampCancelled")
      : state === "pending"
        ? t("stampPending")
        : state === "screened"
          ? tb("stampShown")
          : null;

  return (
    <article
      aria-label={t("title")}
      className="relative mx-auto flex w-full max-w-md flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-lg"
    >
      {/* Header: always dark (scrim), the poster blurred behind it like a cinema lobby light box. */}
      <header className="relative isolate overflow-hidden rounded-t-2xl bg-scrim text-scrim-foreground">
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10 scale-125 opacity-35 blur-2xl",
            state === "cancelled" && "grayscale",
          )}
        >
          <PosterImage url={movie.posterUrl} title="" placeholderShowsTitle={false} />
        </div>
        <div className="flex gap-4 p-5">
          <div
            className={cn(
              "aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg shadow-md ring-1 ring-scrim-foreground/20",
              state === "cancelled" && "grayscale",
            )}
          >
            <PosterImage
              url={movie.posterUrl}
              title={title}
              priority
              placeholderShowsTitle={false}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-gold uppercase">
              {t("title")} · {t("admit", { count: booking.seats.length })}
            </p>
            <h2 className="font-heading text-2xl leading-tight font-bold text-balance">{title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <RatingBadge rating={movie.rating} />
              <span className="rounded-md border border-scrim-foreground/30 px-1.5 py-0.5 font-mono font-semibold">
                {FORMAT_LABEL[showtime.format]}
              </span>
              <span className="opacity-80">{formatDuration(movie.durationMin, locale)}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-4 p-5">
          <Field label={t("date")} className="col-span-2">
            <span className="font-heading text-lg font-semibold">
              {formatTicketDate(showtime.startsAt, locale)}
            </span>
          </Field>
          <Field label={t("time")}>
            <span className="font-mono text-2xl font-bold tabular">
              {formatShowtime(showtime.startsAt)}
            </span>
          </Field>
          <Field label={t("cinema")} className="col-span-3">
            <span className="font-medium">{pickText(showtime.cinema.name, locale)}</span>
          </Field>
          <Field label={t("hallLabel")}>
            <span className="font-mono text-2xl font-bold tabular">{showtime.hallNumber}</span>
          </Field>
          <Field label={t("seats")}>
            <SeatChips labels={booking.seats.map((seat) => seat.label)} />
          </Field>
          <Field label={t("total")}>
            <span className="font-mono font-semibold tabular">
              {formatBaht(booking.totalBaht, locale)}
            </span>
          </Field>
        </dl>
        {stamp && state !== "valid" ? (
          <TicketStamp state={state} className="absolute right-4 bottom-16 text-base">
            {stamp}
          </TicketStamp>
        ) : null}
      </div>

      <Perforation />

      <div className="flex flex-col items-center gap-3 p-5">
        {hasQr && booking.ticketQr ? (
          <>
            <div
              className={cn(
                "rounded-xl bg-card p-3 text-card-foreground ring-1 ring-border dark:bg-foreground dark:text-background",
                state === "screened" && "opacity-50",
              )}
            >
              <QRCodeSVG
                value={booking.ticketQr}
                size={176}
                fgColor="currentColor"
                bgColor="transparent"
                role="img"
                title={t("qrAlt")}
              />
            </div>
            {state === "valid" ? (
              <p className="text-center text-xs text-muted-foreground">{t("showAtEntrance")}</p>
            ) : null}
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {state === "cancelled" ? t("cancelledNotice") : t("pendingNotice")}
          </p>
        )}
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-xs text-muted-foreground">{t("bookingCode")}</p>
          <p className="font-mono text-2xl font-bold tracking-wider">{booking.bookingCode}</p>
        </div>
        {state === "valid" && hasQr ? (
          <Button
            variant="outline"
            onClick={() => {
              downloadIcs(booking, locale);
            }}
          >
            <CalendarPlus aria-hidden data-icon="inline-start" />
            {t("addToCalendar")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

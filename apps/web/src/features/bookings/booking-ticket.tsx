"use client";

import { CalendarPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import type { Booking } from "@/api/generated/model";
import { Button } from "@/components/ui/button";
import { formatBaht, formatShowDateTime } from "@/lib/format";
import { pickText, toLocale } from "@/lib/localized";
import { buildIcs, icsFileName } from "./ics";

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

const FORMAT_LABEL = { TWO_D: "2D", THREE_D: "3D", IMAX: "IMAX" } as const;

/** The ticket card: real QR from `ticketQr`, booking code in mono, seats, showtime and an .ics download. */
export function BookingTicket({ booking }: { booking: Booking }) {
  const t = useTranslations("ticket");
  const locale = toLocale(useLocale());
  const { showtime } = booking;
  const valid = booking.status === "CONFIRMED" && booking.ticketQr !== null;

  return (
    <article
      aria-label={t("title")}
      className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lg"
    >
      <div className="flex flex-col gap-1 bg-primary p-5 text-primary-foreground">
        <p className="text-xs tracking-wide uppercase opacity-80">{t("title")}</p>
        <h2 className="text-2xl font-bold">{pickText(showtime.movie.title, locale)}</h2>
        <p className="text-sm opacity-90">
          {formatShowDateTime(showtime.startsAt, locale)} · {FORMAT_LABEL[showtime.format]}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("cinema")}</dt>
          <dd className="font-medium">
            {pickText(showtime.cinema.name, locale)} · {t("hall", { number: showtime.hallNumber })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("seats")}</dt>
          <dd className="font-mono font-medium">{booking.seats.map((s) => s.label).join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("total")}</dt>
          <dd className="font-mono font-medium tabular">{formatBaht(booking.totalBaht, locale)}</dd>
        </div>
      </dl>

      <div className="flex flex-col items-center gap-3 border-t border-dashed border-border p-5">
        {valid && booking.ticketQr ? (
          <div className="rounded-xl bg-card p-3 text-card-foreground ring-1 ring-border dark:bg-foreground dark:text-background">
            <QRCodeSVG
              value={booking.ticketQr}
              size={176}
              fgColor="currentColor"
              bgColor="transparent"
              role="img"
              title={t("qrAlt")}
            />
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {booking.status === "CANCELLED" ? t("cancelledNotice") : t("pendingNotice")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("bookingCode")}</p>
        <p className="font-mono text-2xl font-bold tracking-wider">{booking.bookingCode}</p>
        {valid ? (
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

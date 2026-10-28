import { cinemaSelect } from "../catalog/catalog.service.js";
import { toCinema, type CinemaRow } from "../catalog/catalog.mapper.js";
import type { Prisma } from "../generated/prisma/client.js";
import { labelOf } from "../showtimes/showtimes.service.js";
import type { BookingBody } from "./booking.dto.js";
import { signTicket } from "./booking-support.js";

/** Everything the `Booking` response needs, in one query (no N+1). */
export const bookingInclude = {
  showtime: {
    select: {
      id: true,
      startsAt: true,
      format: true,
      hall: { select: { number: true, cinema: { select: cinemaSelect } } },
      movie: {
        select: {
          slug: true,
          titleTh: true,
          titleEn: true,
          posterUrl: true,
          rating: true,
          durationMin: true,
        },
      },
    },
  },
  seats: {
    select: {
      priceBaht: true,
      seat: { select: { id: true, rowLabel: true, seatNumber: true, type: true } },
    },
    orderBy: [{ seat: { rowLabel: "asc" } }, { seat: { seatNumber: "asc" } }],
  },
  payments: {
    select: { method: true, status: true, cardBrand: true, cardLast4: true, paidAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} as const satisfies Prisma.BookingInclude;

export type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function toBookingBody(row: BookingRow, ticketSecret: string): BookingBody {
  const payment = row.payments[0];
  const cinema: CinemaRow = row.showtime.hall.cinema;
  return {
    id: row.id,
    bookingCode: row.bookingCode,
    status: row.status,
    cancelReason: row.cancelReason,
    showtime: {
      id: row.showtime.id,
      startsAt: row.showtime.startsAt.toISOString(),
      format: row.showtime.format,
      hallNumber: row.showtime.hall.number,
      movie: {
        slug: row.showtime.movie.slug,
        title: { th: row.showtime.movie.titleTh, en: row.showtime.movie.titleEn },
        posterUrl: row.showtime.movie.posterUrl,
        rating: row.showtime.movie.rating,
        durationMin: row.showtime.movie.durationMin,
      },
      cinema: toCinema(cinema),
    },
    seats: row.seats.map((entry) => ({
      seatId: entry.seat.id,
      label: labelOf(entry.seat.rowLabel, entry.seat.seatNumber),
      type: entry.seat.type,
      priceBaht: entry.priceBaht,
    })),
    totalBaht: row.totalBaht,
    currency: "THB",
    paymentExpiresAt: row.paymentExpiresAt.toISOString(),
    holdExpiresAt: row.holdExpiresAt.toISOString(),
    confirmedAt: iso(row.confirmedAt),
    cancelledAt: iso(row.cancelledAt),
    createdAt: row.createdAt.toISOString(),
    latestPayment: payment
      ? {
          method: payment.method,
          status: payment.status,
          cardBrand: payment.cardBrand,
          cardLast4: payment.cardLast4,
          paidAt: iso(payment.paidAt),
        }
      : null,
    ticketQr: row.status === "CONFIRMED" ? signTicket(row.bookingCode, ticketSecret) : null,
  };
}

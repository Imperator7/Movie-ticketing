import { HttpStatus, Injectable } from "@nestjs/common";
import { BOOKING_CONFIG } from "../booking/booking.config.js";
import { cinemaSelect, movieSummarySelect } from "../catalog/catalog.service.js";
import { toCinema, toMovieSummary } from "../catalog/catalog.mapper.js";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { SeatMapBody, ShowtimeDetailBody } from "./showtimes.dto.js";

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "Showtime not found");

type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED";

/** The instant after which a showtime can no longer be booked. */
export const bookingClosesAt = (startsAt: Date): Date =>
  new Date(startsAt.getTime() + BOOKING_CONFIG.CUTOFF_AFTER_START_MS);

export const labelOf = (rowLabel: string, seatNumber: number): string =>
  `${rowLabel}${String(seatNumber)}`;

@Injectable()
export class ShowtimesService {
  constructor(private readonly prisma: PrismaService) {}

  async getShowtime(id: string, now: Date = new Date()): Promise<ShowtimeDetailBody> {
    const row = await this.prisma.showtime.findUnique({
      where: { id },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        format: true,
        audioLanguage: true,
        subtitleLanguage: true,
        status: true,
        movie: { select: movieSummarySelect },
        hall: { select: { id: true, number: true, type: true, cinema: { select: cinemaSelect } } },
        prices: { select: { seatType: true, priceBaht: true }, orderBy: { priceBaht: "asc" } },
      },
    });
    if (!row) throw notFound();

    const closes = bookingClosesAt(row.startsAt);
    return {
      id: row.id,
      movie: toMovieSummary(row.movie),
      cinema: toCinema(row.hall.cinema),
      hall: { id: row.hall.id, number: row.hall.number, type: row.hall.type },
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      format: row.format,
      audioLanguage: row.audioLanguage,
      subtitleLanguage: row.subtitleLanguage,
      prices: row.prices,
      bookingClosesAt: closes.toISOString(),
      isBookable: row.status === "SCHEDULED" && now.getTime() < closes.getTime(),
      maxSeatsPerBooking: BOOKING_CONFIG.MAX_SEATS,
    };
  }

  /**
   * Live seat map. Status is derived at request time (database-design §2), never from the expiry job:
   * BOOKED = unreleased lock of a CONFIRMED booking, HELD = unreleased lock of a PENDING_PAYMENT booking still inside
   * its hold, otherwise AVAILABLE. Only active seats are returned.
   */
  async getSeatMap(id: string, now: Date = new Date()): Promise<SeatMapBody> {
    const showtime = await this.prisma.showtime.findUnique({
      where: { id },
      select: {
        id: true,
        hallId: true,
        hall: { select: { totalRows: true, totalCols: true } },
        prices: { select: { seatType: true, priceBaht: true }, orderBy: { priceBaht: "asc" } },
      },
    });
    if (!showtime) throw notFound();

    const [seats, locks] = await Promise.all([
      this.prisma.seat.findMany({
        where: { hallId: showtime.hallId, isActive: true },
        select: {
          id: true,
          rowLabel: true,
          seatNumber: true,
          gridRow: true,
          gridCol: true,
          type: true,
        },
        orderBy: [{ gridRow: "asc" }, { gridCol: "asc" }],
      }),
      this.prisma.bookingSeat.findMany({
        where: {
          showtimeId: id,
          releasedAt: null,
          booking: {
            OR: [
              { status: "CONFIRMED" },
              { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } },
            ],
          },
        },
        select: { seatId: true, booking: { select: { status: true } } },
      }),
    ]);

    const statusBySeat = new Map<string, SeatStatus>(
      locks.map((lock) => [lock.seatId, lock.booking.status === "CONFIRMED" ? "BOOKED" : "HELD"]),
    );
    return {
      showtimeId: showtime.id,
      totalRows: showtime.hall.totalRows,
      totalCols: showtime.hall.totalCols,
      seats: seats.map((seat) => ({
        id: seat.id,
        label: labelOf(seat.rowLabel, seat.seatNumber),
        row: seat.rowLabel,
        number: seat.seatNumber,
        gridRow: seat.gridRow,
        gridCol: seat.gridCol,
        type: seat.type,
        status: statusBySeat.get(seat.id) ?? "AVAILABLE",
      })),
      prices: showtime.prices,
      generatedAt: now.toISOString(),
    };
  }
}

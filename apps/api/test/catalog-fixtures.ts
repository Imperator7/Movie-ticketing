import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { testPrisma } from "./db.js";

type Prisma = PrismaClient;

export const token = (): string => randomUUID().replaceAll("-", "").slice(0, 12);

export async function createGenre(slug = `g-${token()}`): Promise<{ id: number; slug: string }> {
  return testPrisma().genre.create({
    data: { slug, nameTh: `หมวด ${slug}`, nameEn: `Genre ${slug}` },
    select: { id: true, slug: true },
  });
}

export interface MovieInput {
  slug?: string;
  titleTh?: string;
  titleEn?: string;
  status?: "COMING_SOON" | "NOW_SHOWING" | "ENDED";
  releaseDate?: string;
  posterUrl?: string | null;
  genreIds?: number[];
  durationMin?: number;
}

export async function createMovie(input: MovieInput = {}): Promise<{ id: string; slug: string }> {
  const slug = input.slug ?? `movie-${token()}`;
  return testPrisma().movie.create({
    data: {
      slug,
      titleTh: input.titleTh ?? `หนัง ${slug}`,
      titleEn: input.titleEn ?? `Movie ${slug}`,
      synopsisTh: "เรื่องย่อ",
      synopsisEn: "Synopsis",
      durationMin: input.durationMin ?? 100,
      rating: "AGE_13",
      originalLanguage: "en",
      releaseDate: new Date(`${input.releaseDate ?? "2026-01-01"}T00:00:00Z`),
      posterUrl:
        input.posterUrl === undefined ? "https://image.tmdb.org/t/p/w500/x.jpg" : input.posterUrl,
      status: input.status ?? "NOW_SHOWING",
      genres: input.genreIds
        ? { create: input.genreIds.map((genreId) => ({ genreId })) }
        : undefined,
    },
    select: { id: true, slug: true },
  });
}

export interface HallFixture {
  cinemaId: string;
  hallId: string;
  seatIds: string[];
}

/** A cinema with one hall of `seats` seats (the last one inactive when `inactive` is true). */
export async function createHall(
  options: {
    cinemaId?: string;
    number?: number;
    seats?: number;
    inactive?: boolean;
    type?: "STANDARD" | "IMAX";
  } = {},
): Promise<HallFixture> {
  const prisma: Prisma = testPrisma();
  const cinemaId =
    options.cinemaId ??
    (
      await prisma.cinema.create({
        data: {
          nameTh: `โรง ${token()}`,
          nameEn: `Cinema ${token()}`,
          addressTh: "ที่อยู่",
          addressEn: "Address",
          city: "Bangkok",
        },
        select: { id: true },
      })
    ).id;
  const seats = options.seats ?? 10;
  const hall = await prisma.hall.create({
    data: {
      cinemaId,
      number: options.number ?? 1,
      type: options.type ?? "STANDARD",
      totalRows: 1,
      totalCols: seats,
      seats: {
        create: Array.from({ length: seats }, (_, i) => ({
          rowLabel: "A",
          seatNumber: i + 1,
          gridRow: 0,
          gridCol: i,
          type: "STANDARD" as const,
          isActive: !(options.inactive === true && i === seats - 1),
        })),
      },
    },
    select: {
      id: true,
      seats: { select: { id: true, seatNumber: true }, orderBy: { seatNumber: "asc" } },
    },
  });
  return { cinemaId, hallId: hall.id, seatIds: hall.seats.map((seat) => seat.id) };
}

export async function createShowtime(input: {
  movieId: string;
  hallId: string;
  startsAt: Date;
  durationMin?: number;
  status?: "SCHEDULED" | "CANCELLED";
  prices?: { STANDARD: number; PREMIUM: number };
}): Promise<{ id: string }> {
  const endsAt = new Date(input.startsAt.getTime() + (input.durationMin ?? 120) * 60_000);
  const prices = input.prices ?? { STANDARD: 220, PREMIUM: 280 };
  return testPrisma().showtime.create({
    data: {
      movieId: input.movieId,
      hallId: input.hallId,
      startsAt: input.startsAt,
      endsAt,
      audioLanguage: "EN",
      subtitleLanguage: "TH",
      format: "TWO_D",
      status: input.status ?? "SCHEDULED",
      prices: {
        create: [
          { seatType: "STANDARD", priceBaht: prices.STANDARD },
          { seatType: "PREMIUM", priceBaht: prices.PREMIUM },
        ],
      },
    },
    select: { id: true },
  });
}

export async function createUser(): Promise<string> {
  const user = await testPrisma().user.create({
    data: { email: `fx-${token()}@example.com`, displayName: "Fixture", preferredLocale: "th" },
    select: { id: true },
  });
  return user.id;
}

/** Locks `seatIds` of a showtime with a booking in the given state (unreleased locks unless `released`). */
export async function lockSeats(input: {
  showtimeId: string;
  seatIds: string[];
  state: "CONFIRMED" | "PENDING_IN_HOLD" | "PENDING_HOLD_OVER";
  released?: boolean;
  /** Book it for this user instead of a throwaway one. */
  userId?: string;
}): Promise<string> {
  const userId = input.userId ?? (await createUser());
  const now = Date.now();
  const hold = input.state === "PENDING_HOLD_OVER" ? now - 60_000 : now + 6 * 60_000;
  const payment = input.state === "PENDING_HOLD_OVER" ? now - 120_000 : now + 5 * 60_000;
  const booking = await testPrisma().booking.create({
    select: { id: true },
    data: {
      bookingCode: `FX-${token()}`.toUpperCase(),
      userId,
      showtimeId: input.showtimeId,
      status: input.state === "CONFIRMED" ? "CONFIRMED" : "PENDING_PAYMENT",
      confirmedAt: input.state === "CONFIRMED" ? new Date() : null,
      totalBaht: 220 * input.seatIds.length,
      paymentExpiresAt: new Date(payment),
      holdExpiresAt: new Date(hold),
      seats: {
        create: input.seatIds.map((seatId) => ({
          showtimeId: input.showtimeId,
          seatId,
          priceBaht: 220,
          releasedAt: input.released === true ? new Date() : null,
        })),
      },
    },
  });
  return booking.id;
}

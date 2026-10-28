import { HttpStatus, Injectable } from "@nestjs/common";
import { BOOKING_CONFIG } from "../booking/booking.config.js";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { addDays, bangkokDateOf, bangkokDayRange } from "../common/time/bangkok.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CinemaBody,
  GenreBody,
  ListMoviesQueryDto,
  MovieDetailBody,
  MoviePageBody,
  MovieShowtimesBody,
  MovieShowtimesQueryDto,
} from "./catalog.dto.js";
import {
  distinctBangkokDates,
  escapeLike,
  normalizeSearch,
  pageWindow,
} from "./catalog.helpers.js";
import {
  toCinema,
  toGenre,
  toMovieDetail,
  toMovieSummary,
  toShowtimeSlot,
} from "./catalog.mapper.js";

/** Date picker horizon: today .. today + 30 days. */
const AVAILABLE_DAYS_AHEAD = 30;

const genreSelect = { id: true, slug: true, nameTh: true, nameEn: true } as const;
const cinemaSelect = {
  id: true,
  nameTh: true,
  nameEn: true,
  addressTh: true,
  addressEn: true,
  city: true,
} as const;
const movieSummarySelect = {
  id: true,
  slug: true,
  titleTh: true,
  titleEn: true,
  synopsisTh: true,
  synopsisEn: true,
  durationMin: true,
  rating: true,
  releaseDate: true,
  posterUrl: true,
  status: true,
  genres: { select: { genre: { select: genreSelect } }, orderBy: { genre: { slug: "asc" } } },
} as const satisfies Prisma.MovieSelect;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listGenres(): Promise<GenreBody[]> {
    const rows = await this.prisma.genre.findMany({
      select: genreSelect,
      orderBy: { slug: "asc" },
    });
    return rows.map(toGenre);
  }

  async listCinemas(): Promise<CinemaBody[]> {
    const rows = await this.prisma.cinema.findMany({
      select: cinemaSelect,
      orderBy: [{ nameEn: "asc" }, { id: "asc" }],
    });
    return rows.map(toCinema);
  }

  async listMovies(query: ListMoviesQueryDto): Promise<MoviePageBody> {
    const search = normalizeSearch(query.q);
    const where: Prisma.MovieWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.genre ? { genres: { some: { genre: { slug: query.genre } } } } : {}),
      ...(search
        ? {
            OR: [
              { titleTh: { contains: escapeLike(search), mode: "insensitive" } },
              { titleEn: { contains: escapeLike(search), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.movie.findMany({
        where,
        select: movieSummarySelect,
        // Newest first; slug breaks ties so pages never shuffle.
        orderBy: [{ releaseDate: "desc" }, { slug: "asc" }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.movie.count({ where }),
    ]);

    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows.map(toMovieSummary),
    };
  }

  async getMovie(slug: string): Promise<MovieDetailBody> {
    const row = await this.prisma.movie.findUnique({
      where: { slug },
      select: {
        ...movieSummarySelect,
        originalLanguage: true,
        backdropUrl: true,
        trailerUrl: true,
      },
    });
    if (!row) throw this.notFound("Movie not found");
    return toMovieDetail(row);
  }

  /**
   * Bookable showtimes of one movie on one Bangkok day, grouped by cinema. Constant number of queries:
   * movie, availability dates, the day's showtimes, and one aggregate for `seatsLeft`.
   */
  async listMovieShowtimes(
    slug: string,
    query: MovieShowtimesQueryDto,
    now: Date = new Date(),
  ): Promise<MovieShowtimesBody> {
    const movie = await this.prisma.movie.findUnique({ where: { slug }, select: { id: true } });
    if (!movie) throw this.notFound("Movie not found");

    // Bookable = still before starts_at + cut-off.
    const bookableFrom = new Date(now.getTime() - BOOKING_CONFIG.CUTOFF_AFTER_START_MS);
    const horizonEnd = bangkokDayRange(addDays(bangkokDateOf(now), AVAILABLE_DAYS_AHEAD)).end;
    const day = bangkokDayRange(query.date);
    const cinemaFilter: Prisma.ShowtimeWhereInput = query.cinemaId
      ? { hall: { cinemaId: query.cinemaId } }
      : {};

    const [upcoming, dayShowtimes] = await Promise.all([
      this.prisma.showtime.findMany({
        where: {
          movieId: movie.id,
          status: "SCHEDULED",
          startsAt: { gt: bookableFrom, lt: horizonEnd },
          ...cinemaFilter,
        },
        select: { startsAt: true },
      }),
      this.prisma.showtime.findMany({
        where: {
          movieId: movie.id,
          status: "SCHEDULED",
          startsAt: { gt: bookableFrom, gte: day.start, lt: day.end },
          ...cinemaFilter,
        },
        select: {
          id: true,
          startsAt: true,
          format: true,
          audioLanguage: true,
          subtitleLanguage: true,
          hall: {
            select: { id: true, number: true, type: true, cinema: { select: cinemaSelect } },
          },
          prices: { select: { priceBaht: true } },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      }),
    ]);

    const seatsLeft = await this.seatsLeft(
      dayShowtimes.map((showtime) => showtime.id),
      now,
    );

    const byCinema = new Map<string, MovieShowtimesBody["cinemas"][number]>();
    for (const showtime of dayShowtimes) {
      const cinema = showtime.hall.cinema;
      const group = byCinema.get(cinema.id) ?? { cinema: toCinema(cinema), showtimes: [] };
      group.showtimes.push(toShowtimeSlot(showtime, seatsLeft.get(showtime.id) ?? 0));
      byCinema.set(cinema.id, group);
    }
    const cinemas = [...byCinema.values()].sort((a, b) =>
      a.cinema.name.en.localeCompare(b.cinema.name.en),
    );

    return {
      movieId: movie.id,
      date: query.date,
      availableDates: distinctBangkokDates(upcoming.map((showtime) => showtime.startsAt)),
      cinemas,
    };
  }

  /**
   * Free seats per showtime in ONE query: active seats of the hall minus seats with an active lock
   * (database-design §2: unreleased row of a CONFIRMED booking, or of a PENDING_PAYMENT one still inside its hold).
   * Uses the partial unique index on booking_seats (showtime_id, seat_id) WHERE released_at IS NULL.
   */
  private async seatsLeft(showtimeIds: string[], now: Date): Promise<Map<string, number>> {
    if (showtimeIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ id: string; seatsLeft: number }[]>`
      SELECT st.id,
             ( (SELECT count(*) FROM seats s WHERE s.hall_id = st.hall_id AND s.is_active)
             - (SELECT count(*)
                  FROM booking_seats bs
                  JOIN bookings b ON b.id = bs.booking_id
                  JOIN seats s2 ON s2.id = bs.seat_id AND s2.is_active
                 WHERE bs.showtime_id = st.id
                   AND bs.released_at IS NULL
                   AND (b.status = 'CONFIRMED'
                        OR (b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > ${now}))) )::int AS "seatsLeft"
        FROM showtimes st
       WHERE st.id = ANY(${showtimeIds}::uuid[])`;
    return new Map(rows.map((row) => [row.id, row.seatsLeft]));
  }

  private notFound(message: string): AppException {
    return new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, message);
  }
}

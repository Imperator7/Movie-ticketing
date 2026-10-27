import { required } from "./required.js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { bangkokDateOf, bangkokDayRange } from "../../src/common/time/bangkok.js";
import { buildSeatLayout } from "./layout.js";
import { priceShowtime } from "./pricing.js";
import { addDays, generateDaySchedule, weekdayOf, type ScheduleMovie } from "./schedule.js";
import { moviesFileSchema, type SeedMovie } from "./schema.js";
import { CINEMAS } from "./venues.js";

/** Days of showtimes generated, counting today (today .. today + 30). */
export const SCHEDULE_DAYS = 31;

const SEED_DIR = fileURLToPath(new URL(".", import.meta.url));

export interface LoadedMovies {
  movies: SeedMovie[];
  source: "movies.json" | "movies.sample.json";
}

/** Uses movies.json when it exists (generated from TMDB), otherwise the committed fictional sample. */
export function loadMovies(dir: string = SEED_DIR): LoadedMovies {
  const real = `${dir}movies.json`;
  const source = existsSync(real) ? "movies.json" : "movies.sample.json";
  const raw: unknown = JSON.parse(readFileSync(`${dir}${source}`, "utf8"));
  return { movies: moviesFileSchema.parse(raw).movies, source };
}

export interface SeedSummary {
  moviesSource: string;
  today: string;
  showtimesAdded: number;
  counts: Record<string, number>;
}

export interface RunSeedOptions {
  /** Injected for tests; defaults to the current time. */
  now?: Date;
  movies?: LoadedMovies;
  log?: (message: string) => void;
}

function isScheduleMovie(movie: SeedMovie, date: string): boolean {
  if (movie.status === "NOW_SHOWING") return true;
  return movie.status === "COMING_SOON" && date >= movie.releaseDate;
}

/**
 * Idempotent seed. Everything is upserted on a natural key, and a hall-day that already has showtimes is left
 * untouched, so re-running never duplicates rows, never moves existing showtimes (bookings may reference them)
 * and never deletes anything. Running on a later day only adds the days that are new.
 */
export async function runSeed(
  prisma: PrismaClient,
  options: RunSeedOptions = {},
): Promise<SeedSummary> {
  const log = options.log ?? (() => undefined);
  const loaded = options.movies ?? loadMovies();
  const today = bangkokDateOf(options.now ?? new Date());
  log(`Movies: using ${loaded.source} (${String(loaded.movies.length)} movies)`);

  // ---- genres + movies
  const genres = new Map(
    loaded.movies.flatMap((movie) => movie.genres.map((genre) => [genre.slug, genre] as const)),
  );
  const genreIds = new Map<string, number>();
  for (const genre of genres.values()) {
    const row = await prisma.genre.upsert({
      where: { slug: genre.slug },
      create: {
        slug: genre.slug,
        tmdbId: genre.tmdbId,
        nameTh: genre.nameTh,
        nameEn: genre.nameEn,
      },
      update: { nameTh: genre.nameTh, nameEn: genre.nameEn },
    });
    genreIds.set(genre.slug, row.id);
  }

  const movieIds = new Map<string, string>();
  for (const movie of loaded.movies) {
    const data = {
      titleTh: movie.titleTh,
      titleEn: movie.titleEn,
      synopsisTh: movie.synopsisTh,
      synopsisEn: movie.synopsisEn,
      durationMin: movie.durationMin,
      rating: movie.rating,
      originalLanguage: movie.originalLanguage,
      releaseDate: new Date(`${movie.releaseDate}T00:00:00Z`),
      // null is fine: the web renders its own placeholder (no third-party image hosts, see WEB-2).
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      trailerUrl: movie.trailerUrl,
      status: movie.status,
    };
    const row = await prisma.movie.upsert({
      where: { slug: movie.slug },
      create: { slug: movie.slug, tmdbId: movie.tmdbId, ...data },
      update: data,
    });
    movieIds.set(movie.slug, row.id);
    await prisma.movieGenre.createMany({
      data: movie.genres.map((genre) => ({
        movieId: row.id,
        genreId: required(genreIds.get(genre.slug), "genre id"),
      })),
      skipDuplicates: true,
    });
  }

  // ---- cinemas, halls, seats
  const halls: { id: string; key: string; type: "STANDARD" | "IMAX" | "FOUR_DX" }[] = [];
  for (const cinema of CINEMAS) {
    const existing = await prisma.cinema.findFirst({ where: { nameEn: cinema.nameEn } });
    const cinemaData = {
      nameTh: cinema.nameTh,
      nameEn: cinema.nameEn,
      addressTh: cinema.addressTh,
      addressEn: cinema.addressEn,
      city: cinema.city,
    };
    const cinemaRow = existing
      ? await prisma.cinema.update({ where: { id: existing.id }, data: cinemaData })
      : await prisma.cinema.create({ data: cinemaData });

    for (const hall of cinema.halls) {
      const layout = buildSeatLayout(hall.layout);
      const hallRow = await prisma.hall.upsert({
        where: { cinemaId_number: { cinemaId: cinemaRow.id, number: hall.number } },
        create: {
          cinemaId: cinemaRow.id,
          number: hall.number,
          type: hall.type,
          totalRows: layout.totalRows,
          totalCols: layout.totalCols,
        },
        update: { type: hall.type, totalRows: layout.totalRows, totalCols: layout.totalCols },
      });
      await prisma.seat.createMany({
        data: layout.seats.map((seat) => ({ hallId: hallRow.id, ...seat })),
        skipDuplicates: true,
      });
      halls.push({
        id: hallRow.id,
        key: `${cinema.nameEn}#${String(hall.number)}`,
        type: hall.type,
      });
    }
  }

  // ---- showtimes (+ prices): today .. today + 30, one hall-day at a time
  const dates = Array.from({ length: SCHEDULE_DAYS }, (_, index) => addDays(today, index));
  const windowStart = bangkokDayRange(today).start;
  const windowEnd = bangkokDayRange(required(dates.at(-1), "last date")).end;
  const existing = await prisma.showtime.findMany({
    where: { startsAt: { gte: windowStart, lt: windowEnd } },
    select: { hallId: true, startsAt: true },
  });
  const occupied = new Set(
    existing.map((show) => `${show.hallId}|${bangkokDateOf(show.startsAt)}`),
  );

  let showtimesAdded = 0;
  for (const date of dates) {
    const eligible: (ScheduleMovie & { id: string })[] = loaded.movies
      .filter((movie) => isScheduleMovie(movie, date))
      .map((movie) => ({
        id: required(movieIds.get(movie.slug), "movie id"),
        slug: movie.slug,
        durationMin: movie.durationMin,
        originalLanguage: movie.originalLanguage,
      }));
    const idBySlug = new Map(eligible.map((movie) => [movie.slug, movie.id]));

    for (const hall of halls) {
      if (occupied.has(`${hall.id}|${date}`)) continue;
      const plan = generateDaySchedule({
        hallKey: hall.key,
        hallType: hall.type,
        date,
        movies: eligible,
      });
      if (plan.length === 0) continue;

      await prisma.$transaction(async (tx) => {
        const created = await tx.showtime.createManyAndReturn({
          data: plan.map((show) => ({
            movieId: required(idBySlug.get(show.movieSlug), "scheduled movie"),
            hallId: hall.id,
            startsAt: show.startsAt,
            endsAt: show.endsAt,
            audioLanguage: show.audioLanguage,
            subtitleLanguage: show.subtitleLanguage,
            format: show.format,
          })),
          select: { id: true, startsAt: true },
        });
        const startById = new Map(created.map((row) => [row.startsAt.getTime(), row.id]));
        await tx.showtimePrice.createMany({
          data: plan.flatMap((show) => {
            const showtimeId = required(startById.get(show.startsAt.getTime()), "created showtime");
            const prices = priceShowtime({
              hallType: hall.type,
              startMinute: show.startMinute,
              weekday: weekdayOf(date),
            });
            return [
              { showtimeId, seatType: "STANDARD" as const, priceBaht: prices.STANDARD },
              { showtimeId, seatType: "PREMIUM" as const, priceBaht: prices.PREMIUM },
            ];
          }),
        });
      });
      showtimesAdded += plan.length;
    }
  }

  const counts: Record<string, number> = {
    genres: await prisma.genre.count(),
    movies: await prisma.movie.count(),
    movie_genres: await prisma.movieGenre.count(),
    cinemas: await prisma.cinema.count(),
    halls: await prisma.hall.count(),
    seats: await prisma.seat.count(),
    showtimes: await prisma.showtime.count(),
    showtime_prices: await prisma.showtimePrice.count(),
  };
  return { moviesSource: loaded.source, today, showtimesAdded, counts };
}

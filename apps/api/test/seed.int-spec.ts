import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { bangkokDateOf } from "../src/common/time/bangkok.js";
import { loadMovies, runSeed } from "../prisma/seed/run-seed.js";

describe("seed (real database, as app_user)", () => {
  let prisma: PrismaClient;
  const now = new Date("2026-11-02T05:00:00Z"); // 12:00 Bangkok

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: inject("databaseUrl"), max: 3 }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates the catalog, venues, showtimes and prices", async () => {
    const summary = await runSeed(prisma, { now });

    const { movies } = loadMovies();
    const genres = new Set(movies.flatMap((movie) => movie.genres.map((genre) => genre.slug)));
    expect(summary.counts).toMatchObject({
      cinemas: 2,
      halls: 6,
      genres: genres.size,
      movies: movies.length,
    });
    expect(summary.counts.seats).toBe(992);
    expect(summary.counts.showtimes).toBeGreaterThan(6 * 31 * 3);
    expect(summary.counts.showtime_prices).toBe((summary.counts.showtimes ?? 0) * 2);
    expect(summary.showtimesAdded).toBe(summary.counts.showtimes);
  });

  it("is idempotent: running again changes nothing", async () => {
    const before = await runSeed(prisma, { now });
    const again = await runSeed(prisma, { now });

    expect(again.counts).toEqual(before.counts);
    expect(again.showtimesAdded).toBe(0);
  });

  it("only schedules eligible movies and matches formats to halls", async () => {
    const shows = await prisma.showtime.findMany({ include: { movie: true, hall: true } });
    const { movies } = loadMovies();
    const byId = new Map(movies.map((movie) => [movie.slug, movie]));

    for (const show of shows) {
      expect(show.movie.status).not.toBe("ENDED");
      const date = bangkokDateOf(show.startsAt);
      expect(
        date >= (byId.get(show.movie.slug)?.releaseDate ?? "") ||
          show.movie.status === "NOW_SHOWING",
      ).toBe(true);
      expect(show.hall.type === "IMAX").toBe(show.format === "IMAX");
      expect(show.endsAt.getTime()).toBeGreaterThan(show.startsAt.getTime());
    }
  });

  it("moves the window forward on a later day and leaves existing showtimes untouched", async () => {
    const earliestBefore = await prisma.showtime.findFirst({ orderBy: { startsAt: "asc" } });
    const countBefore = await prisma.showtime.count();

    const later = await runSeed(prisma, { now: new Date(now.getTime() + 3 * 86_400_000) });

    expect(later.showtimesAdded).toBeGreaterThan(0);
    expect(later.counts.showtimes).toBe(countBefore + later.showtimesAdded);
    const earliestAfter = await prisma.showtime.findFirst({ orderBy: { startsAt: "asc" } });
    expect(earliestAfter?.id).toBe(earliestBefore?.id);
  });
});

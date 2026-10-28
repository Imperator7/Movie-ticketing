import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import {
  createGenre,
  createHall,
  createMovie,
  createShowtime,
  lockSeats,
  token,
} from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";

interface MovieItem {
  slug: string;
  title: { th: string; en: string };
  genres: { slug: string }[];
}
interface Page {
  page: number;
  pageSize: number;
  total: number;
  items: MovieItem[];
}
interface Slot {
  id: string;
  startsAt: string;
  seatsLeft: number;
  fromPriceBaht: number;
  hallNumber: number;
}
interface Showtimes {
  movieId: string;
  date: string;
  availableDates: string[];
  cinemas: { cinema: { id: string }; showtimes: Slot[] }[];
}

describe("catalog (real database)", () => {
  let app: NestExpressApplication;
  const get = (path: string): ReturnType<ReturnType<typeof request>["get"]> =>
    request(app.getHttpServer()).get(`/api/v1${path}`);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("genres and cinemas", () => {
    it("lists genres with Thai and English names", async () => {
      const genre = await createGenre();

      const res = await get("/genres");

      expect(res.status).toBe(200);
      expect(res.body).toContainEqual({
        id: genre.id,
        slug: genre.slug,
        name: { th: `หมวด ${genre.slug}`, en: `Genre ${genre.slug}` },
      });
    });

    it("lists cinemas with localized name and address", async () => {
      const { cinemaId } = await createHall();

      const res = await get("/cinemas");

      expect(res.status).toBe(200);
      const cinema = (
        res.body as { id: string; name: object; address: object; city: string }[]
      ).find((item) => item.id === cinemaId);
      expect(cinema).toMatchObject({ city: "Bangkok", address: { th: "ที่อยู่", en: "Address" } });
      expect(Object.keys(cinema?.name ?? {})).toEqual(["th", "en"]);
    });
  });

  describe("GET /movies", () => {
    it("filters by status and genre, with nullable posters", async () => {
      const genre = await createGenre();
      const tag = token();
      const now = await createMovie({
        titleEn: `Now ${tag}`,
        status: "NOW_SHOWING",
        genreIds: [genre.id],
        posterUrl: null,
      });
      await createMovie({ titleEn: `Soon ${tag}`, status: "COMING_SOON", genreIds: [genre.id] });
      await createMovie({ titleEn: `Other ${tag}`, status: "NOW_SHOWING" });

      const byStatus = (await get(`/movies?genre=${genre.slug}&status=NOW_SHOWING`)).body as Page;
      const byGenre = (await get(`/movies?genre=${genre.slug}`)).body as Page;
      const unknownGenre = (await get(`/movies?genre=does-not-exist-${tag}`)).body as Page;

      expect(byStatus.items.map((item) => item.slug)).toEqual([now.slug]);
      expect(byGenre.total).toBe(2);
      expect(byGenre.items.every((item) => item.genres.some((g) => g.slug === genre.slug))).toBe(
        true,
      );
      expect(unknownGenre).toMatchObject({ total: 0, items: [] });
      expect((byStatus.items[0] as unknown as { posterUrl: unknown }).posterUrl).toBeNull();
    });

    it("searches Thai and English titles, case-insensitively and trimmed", async () => {
      const tag = token();
      const movie = await createMovie({
        titleTh: `ดูนภาคสอง${tag}`,
        titleEn: `Dune Part Two ${tag}`,
      });

      const thai = (await get(`/movies?q=${encodeURIComponent(`ภาคสอง${tag}`)}`)).body as Page;
      const english = (await get(`/movies?q=${encodeURIComponent(`  dUNE part two ${tag}  `)}`))
        .body as Page;
      const none = (await get(`/movies?q=${encodeURIComponent(`nothing-${tag}`)}`)).body as Page;
      const blank = (await get(`/movies?q=%20%20`)).body as Page;

      expect(thai.items.map((item) => item.slug)).toEqual([movie.slug]);
      expect(english.items.map((item) => item.slug)).toEqual([movie.slug]);
      expect(none.total).toBe(0);
      expect(blank.total).toBeGreaterThan(0); // blank search = no filter
    });

    it("treats % and _ in the search as literal characters", async () => {
      const tag = token();
      const movie = await createMovie({ titleEn: `Fifty% Off_Sale ${tag}` });

      const percent = (await get("/movies?q=%25&pageSize=50")).body as Page;
      const exact = (await get(`/movies?q=${encodeURIComponent(`Off_Sale ${tag}`)}`)).body as Page;
      const wildcardLookalike = (await get(`/movies?q=${encodeURIComponent(`Of_ Sale ${tag}`)}`))
        .body as Page;
      const underscoreWildcard = (await get(`/movies?q=${encodeURIComponent(`Fifty_ Off`)}`))
        .body as Page;
      const backslash = (await get(`/movies?q=${encodeURIComponent("\\")}`)).body as Page;

      expect(percent.items.map((item) => item.slug)).toContain(movie.slug);
      // Every hit really contains a literal "%" (a wildcard would match every movie).
      expect(percent.items.every((item) => `${item.title.th}${item.title.en}`.includes("%"))).toBe(
        true,
      );
      expect(exact.items.map((item) => item.slug)).toEqual([movie.slug]);
      expect(wildcardLookalike.total).toBe(0);
      expect(underscoreWildcard.total).toBe(0);
      expect(backslash.total).toBe(0);
    });

    it("paginates with a stable order and exact totals", async () => {
      const tag = token();
      for (let i = 0; i < 5; i++) {
        // Same release date for all: the slug tie-break must keep the order stable.
        await createMovie({
          slug: `page-${tag}-${String(i)}`,
          titleEn: `Pager ${tag}`,
          releaseDate: "2026-03-03",
        });
      }
      const query = (page: number): string =>
        `/movies?q=${encodeURIComponent(`Pager ${tag}`)}&pageSize=2&page=${String(page)}`;

      const pages = await Promise.all(
        [1, 2, 3, 4].map(async (page) => (await get(query(page))).body as Page),
      );

      expect(pages.map((p) => p.items.length)).toEqual([2, 2, 1, 0]);
      expect(pages.every((p) => p.total === 5 && p.pageSize === 2)).toBe(true);
      expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4]);
      const slugs = pages.flatMap((p) => p.items.map((item) => item.slug));
      expect(slugs).toEqual([0, 1, 2, 3, 4].map((i) => `page-${tag}-${String(i)}`));
    });

    it("orders by release date, newest first", async () => {
      const tag = token();
      await createMovie({ titleEn: `Old ${tag}`, releaseDate: "2020-01-01", slug: `old-${tag}` });
      await createMovie({ titleEn: `New ${tag}`, releaseDate: "2027-01-01", slug: `new-${tag}` });

      const page = (await get(`/movies?q=${tag}`)).body as Page;

      expect(page.items.map((item) => item.slug)).toEqual([`new-${tag}`, `old-${tag}`]);
    });

    it.each([
      ["page 0", "page=0"],
      ["pageSize 0", "pageSize=0"],
      ["pageSize 51", "pageSize=51"],
      ["non-numeric page", "page=abc"],
      ["bad status", "status=LIVE"],
      ["q too long", `q=${"x".repeat(101)}`],
      ["unknown parameter", "sort=title"],
    ])("rejects %s with 422 VALIDATION_FAILED", async (_name, qs) => {
      const res = await get(`/movies?${qs}`);

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ statusCode: 422, code: "VALIDATION_FAILED" });
    });

    it("accepts the bounds pageSize=1 and pageSize=50", async () => {
      expect((await get("/movies?pageSize=1")).status).toBe(200);
      expect((await get("/movies?pageSize=50")).status).toBe(200);
    });
  });

  describe("GET /movies/:slug", () => {
    it("returns the detail with synopsis, language and optional media", async () => {
      const movie = await createMovie({ posterUrl: null });

      const res = await get(`/movies/${movie.slug}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        slug: movie.slug,
        synopsis: { th: "เรื่องย่อ", en: "Synopsis" },
        originalLanguage: "en",
        rating: "AGE_13",
        posterUrl: null,
        backdropUrl: null,
        trailerUrl: null,
        releaseDate: "2026-01-01",
      });
    });

    it("also carries the synopsis in list items (MovieSummary)", async () => {
      const movie = await createMovie();

      const page = (await get(`/movies?q=${movie.slug}`)).body as { items: { synopsis: object }[] };

      expect(page.items[0]?.synopsis).toEqual({ th: "เรื่องย่อ", en: "Synopsis" });
    });

    it("answers 404 NOT_FOUND for an unknown slug", async () => {
      const res = await get("/movies/does-not-exist");

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });
  });

  describe("GET /movies/:slug/showtimes", () => {
    const HOUR = 3_600_000;
    const MINUTE = 60_000;
    const today = bangkokDateOf(new Date());
    const day1 = addDays(today, 1);
    const day2 = addDays(today, 2);

    it("groups by Bangkok day: 23:30 belongs to its own day and 00:30 to the next", async () => {
      const movie = await createMovie();
      const hall = await createHall();
      const lateD1 = new Date(bangkokDayRange(day1).start.getTime() + 23.5 * HOUR);
      const earlyD2 = new Date(bangkokDayRange(day2).start.getTime() + 0.5 * HOUR);
      // 23:30 Bangkok is 16:30 UTC the same date; 00:30 Bangkok is 17:30 UTC the day before.
      expect(lateD1.toISOString().slice(0, 10)).toBe(day1);
      expect(earlyD2.toISOString().slice(0, 10)).toBe(day1);
      const late = await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt: lateD1,
        durationMin: 60,
      });
      const early = await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt: earlyD2,
        durationMin: 60,
      });

      const forDay1 = (await get(`/movies/${movie.slug}/showtimes?date=${day1}`)).body as Showtimes;
      const forDay2 = (await get(`/movies/${movie.slug}/showtimes?date=${day2}`)).body as Showtimes;

      expect(forDay1.cinemas.flatMap((c) => c.showtimes.map((s) => s.id))).toEqual([late.id]);
      expect(forDay2.cinemas.flatMap((c) => c.showtimes.map((s) => s.id))).toEqual([early.id]);
      expect(forDay1.availableDates).toEqual([day1, day2]);
      expect(forDay1).toMatchObject({ movieId: movie.id, date: day1 });
    });

    it("returns slot fields: whole-baht cheapest price, hall number, ISO start", async () => {
      const movie = await createMovie();
      const hall = await createHall({ number: 7 });
      const startsAt = new Date(bangkokDayRange(day1).start.getTime() + 14 * HOUR);
      await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt,
        prices: { STANDARD: 240, PREMIUM: 300 },
      });

      const res = (await get(`/movies/${movie.slug}/showtimes?date=${day1}`)).body as Showtimes;

      expect(res.cinemas).toHaveLength(1);
      expect(res.cinemas[0]?.showtimes[0]).toMatchObject({
        startsAt: startsAt.toISOString(),
        fromPriceBaht: 240,
        hallNumber: 7,
        hallType: "STANDARD",
        format: "TWO_D",
        audioLanguage: "EN",
        subtitleLanguage: "TH",
        seatsLeft: 10,
      });
    });

    it("excludes cancelled and closed showtimes but keeps one that started less than 30 min ago", async () => {
      const movie = await createMovie();
      const closedOnly = await createMovie();
      const cinema = await createHall({ number: 1 });
      const hall2 = await createHall({ cinemaId: cinema.cinemaId, number: 2 });
      const hall3 = await createHall({ cinemaId: cinema.cinemaId, number: 3 });
      const now = Date.now();
      const justStarted = await createShowtime({
        movieId: movie.id,
        hallId: cinema.hallId,
        startsAt: new Date(now - 10 * MINUTE),
      });
      await createShowtime({
        movieId: closedOnly.id,
        hallId: hall2.hallId,
        startsAt: new Date(now - 45 * MINUTE),
      });
      await createShowtime({
        movieId: movie.id,
        hallId: hall3.hallId,
        startsAt: new Date(bangkokDayRange(day1).start.getTime() + 12 * HOUR),
        status: "CANCELLED",
      });
      const startedDate = bangkokDateOf(new Date(now - 10 * MINUTE));

      const open = (await get(`/movies/${movie.slug}/showtimes?date=${startedDate}`))
        .body as Showtimes;
      const closed = (
        await get(
          `/movies/${closedOnly.slug}/showtimes?date=${bangkokDateOf(new Date(now - 45 * MINUTE))}`,
        )
      ).body as Showtimes;
      const cancelledDay = (await get(`/movies/${movie.slug}/showtimes?date=${day1}`))
        .body as Showtimes;

      expect(open.cinemas.flatMap((c) => c.showtimes.map((s) => s.id))).toEqual([justStarted.id]);
      expect(closed.cinemas).toEqual([]);
      expect(closed.availableDates).toEqual([]);
      expect(cancelledDay.cinemas).toEqual([]);
      expect(cancelledDay.availableDates).toEqual([startedDate]);
    });

    it("computes seatsLeft from active locks: confirmed and held seats count, expired holds and released locks do not", async () => {
      const movie = await createMovie();
      const hall = await createHall({ seats: 10, inactive: true }); // 9 active seats
      const startsAt = new Date(bangkokDayRange(day1).start.getTime() + 15 * HOUR);
      const showtime = await createShowtime({ movieId: movie.id, hallId: hall.hallId, startsAt });
      const seatsLeft = async (): Promise<number | undefined> => {
        const res = (await get(`/movies/${movie.slug}/showtimes?date=${day1}`)).body as Showtimes;
        return res.cinemas[0]?.showtimes.find((s) => s.id === showtime.id)?.seatsLeft;
      };
      const [s0, s1, s2, s3, s4] = hall.seatIds as [string, string, string, string, string];

      expect(await seatsLeft()).toBe(9);

      await lockSeats({ showtimeId: showtime.id, seatIds: [s0], state: "CONFIRMED" });
      expect(await seatsLeft()).toBe(8);

      await lockSeats({ showtimeId: showtime.id, seatIds: [s1, s2], state: "PENDING_IN_HOLD" });
      expect(await seatsLeft()).toBe(6);

      // A pending booking whose hold is over frees its seat even before the expiry job runs.
      await lockSeats({ showtimeId: showtime.id, seatIds: [s3], state: "PENDING_HOLD_OVER" });
      expect(await seatsLeft()).toBe(6);

      // A released lock (history row) frees the seat.
      await lockSeats({
        showtimeId: showtime.id,
        seatIds: [s4],
        state: "CONFIRMED",
        released: true,
      });
      expect(await seatsLeft()).toBe(6);
    });

    it("filters by cinemaId (also for availableDates) and groups by cinema", async () => {
      const movie = await createMovie();
      const a = await createHall();
      const b = await createHall();
      const base = bangkokDayRange(day1).start.getTime();
      await createShowtime({
        movieId: movie.id,
        hallId: a.hallId,
        startsAt: new Date(base + 10 * HOUR),
      });
      await createShowtime({
        movieId: movie.id,
        hallId: a.hallId,
        startsAt: new Date(base + 14 * HOUR),
      });
      await createShowtime({
        movieId: movie.id,
        hallId: b.hallId,
        startsAt: new Date(bangkokDayRange(day2).start.getTime() + 11 * HOUR),
      });

      const all = (await get(`/movies/${movie.slug}/showtimes?date=${day1}`)).body as Showtimes;
      const onlyA = (
        await get(`/movies/${movie.slug}/showtimes?date=${day1}&cinemaId=${a.cinemaId}`)
      ).body as Showtimes;
      const onlyB = (
        await get(`/movies/${movie.slug}/showtimes?date=${day1}&cinemaId=${b.cinemaId}`)
      ).body as Showtimes;

      expect(all.cinemas).toHaveLength(1);
      expect(all.cinemas[0]?.showtimes).toHaveLength(2);
      expect(all.availableDates).toEqual([day1, day2]);
      expect(onlyA.cinemas[0]?.cinema.id).toBe(a.cinemaId);
      expect(onlyA.availableDates).toEqual([day1]);
      expect(onlyB.cinemas).toEqual([]);
      expect(onlyB.availableDates).toEqual([day2]);
    });

    it("answers 404 for an unknown movie and 422 for a missing or invalid date / cinemaId", async () => {
      const movie = await createMovie();

      expect((await get(`/movies/nope-${token()}/showtimes?date=${day1}`)).status).toBe(404);
      for (const qs of [
        "",
        "date=2026-13-40",
        "date=28-10-2026",
        `date=${day1}&cinemaId=abc`,
        `date=${day1}&x=1`,
      ]) {
        const res = await get(`/movies/${movie.slug}/showtimes?${qs}`);
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ code: "VALIDATION_FAILED" });
      }
    });
  });
});

import { describe, expect, it } from "vitest";
import { movieDetailSchema, movieShowtimesSchema, showtimeSlotSchema } from "./catalog.dto.js";
import {
  toCinema,
  toDateString,
  toGenre,
  toMovieDetail,
  toMovieSummary,
  toShowtimeSlot,
  type MovieDetailRow,
} from "./catalog.mapper.js";

const genre = { id: 28, slug: "action", nameTh: "บู๊", nameEn: "Action" };

const movieRow: MovieDetailRow = {
  id: "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10",
  slug: "dune-part-two",
  titleTh: "ดูน ภาคสอง",
  titleEn: "Dune: Part Two",
  durationMin: 166,
  rating: "AGE_13",
  releaseDate: new Date("2026-03-01T00:00:00Z"),
  posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
  status: "NOW_SHOWING",
  genres: [{ genre }],
  synopsisTh: "เรื่องย่อ",
  synopsisEn: "Synopsis",
  originalLanguage: "en",
  backdropUrl: null,
  trailerUrl: "https://www.youtube.com/watch?v=abc",
};

describe("catalog mapping", () => {
  it("maps a genre to localized text", () => {
    expect(toGenre(genre)).toEqual({ id: 28, slug: "action", name: { th: "บู๊", en: "Action" } });
  });

  it("maps a cinema with localized name and address", () => {
    expect(
      toCinema({
        id: "c1",
        nameTh: "ก",
        nameEn: "A",
        addressTh: "ที่อยู่",
        addressEn: "Address",
        city: "Bangkok",
      }),
    ).toEqual({
      id: "c1",
      name: { th: "ก", en: "A" },
      address: { th: "ที่อยู่", en: "Address" },
      city: "Bangkok",
    });
  });

  it("formats a date column as YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-03-01T00:00:00Z"))).toBe("2026-03-01");
  });

  it("maps a movie summary: bilingual title, Thai rating enum, date string, genres", () => {
    expect(toMovieSummary(movieRow)).toEqual({
      id: movieRow.id,
      slug: "dune-part-two",
      title: { th: "ดูน ภาคสอง", en: "Dune: Part Two" },
      synopsis: { th: "เรื่องย่อ", en: "Synopsis" },
      durationMin: 166,
      rating: "AGE_13",
      releaseDate: "2026-03-01",
      posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
      status: "NOW_SHOWING",
      genres: [{ id: 28, slug: "action", name: { th: "บู๊", en: "Action" } }],
    });
  });

  it("keeps a missing poster as null (never a placeholder URL)", () => {
    expect(toMovieSummary({ ...movieRow, posterUrl: null }).posterUrl).toBeNull();
  });

  it("maps the movie detail extras and satisfies the response schema", () => {
    const detail = toMovieDetail(movieRow);

    expect(detail).toMatchObject({
      synopsis: { th: "เรื่องย่อ", en: "Synopsis" },
      originalLanguage: "en",
      backdropUrl: null,
      trailerUrl: "https://www.youtube.com/watch?v=abc",
    });
    expect(movieDetailSchema.safeParse(detail).success).toBe(true);
  });

  describe("toShowtimeSlot", () => {
    const row = {
      id: "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10",
      startsAt: new Date("2026-11-02T03:30:00Z"),
      format: "IMAX" as const,
      audioLanguage: "EN",
      subtitleLanguage: null,
      hall: { number: 3, type: "IMAX" as const },
      prices: [{ priceBaht: 410 }, { priceBaht: 350 }],
    };

    it("uses the cheapest seat type as the from-price (whole baht) and passes seatsLeft through", () => {
      const slot = toShowtimeSlot(row, 42);

      expect(slot).toEqual({
        id: row.id,
        startsAt: "2026-11-02T03:30:00.000Z",
        format: "IMAX",
        audioLanguage: "EN",
        subtitleLanguage: null,
        hallNumber: 3,
        hallType: "IMAX",
        fromPriceBaht: 350,
        seatsLeft: 42,
      });
      expect(showtimeSlotSchema.safeParse(slot).success).toBe(true);
    });

    it("falls back to 0 when a showtime has no prices", () => {
      expect(toShowtimeSlot({ ...row, prices: [] }, 0).fromPriceBaht).toBe(0);
    });
  });

  it("the showtimes response schema accepts an empty day", () => {
    expect(
      movieShowtimesSchema.safeParse({
        movieId: movieRow.id,
        date: "2026-11-02",
        availableDates: [],
        cinemas: [],
      }).success,
    ).toBe(true);
  });
});

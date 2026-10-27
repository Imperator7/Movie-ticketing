import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMovies } from "./run-seed.js";
import { moviesFileSchema, seedMovieSchema } from "./schema.js";

const movie = {
  tmdbId: 123,
  slug: "some-movie",
  titleTh: "หนัง",
  titleEn: "Some Movie",
  synopsisTh: "เรื่องย่อ",
  synopsisEn: "Synopsis",
  durationMin: 100,
  rating: "AGE_13",
  originalLanguage: "en",
  releaseDate: "2026-10-01",
  posterUrl: "https://image.tmdb.org/t/p/w500/x.jpg",
  backdropUrl: null,
  trailerUrl: null,
  status: "NOW_SHOWING",
  genres: [{ tmdbId: 28, slug: "action", nameTh: "แอ็กชัน", nameEn: "Action" }],
};

describe("movies file schema", () => {
  it("accepts a valid movie, with a null poster too", () => {
    expect(seedMovieSchema.safeParse(movie).success).toBe(true);
    expect(seedMovieSchema.safeParse({ ...movie, posterUrl: null, tmdbId: null }).success).toBe(
      true,
    );
  });

  it.each([
    ["unknown key", { ...movie, extra: 1 }],
    ["old rating value", { ...movie, rating: "PG13" }],
    ["bad status", { ...movie, status: "LIVE" }],
    ["bad slug", { ...movie, slug: "Not A Slug" }],
    ["bad date", { ...movie, releaseDate: "01/10/2026" }],
    ["relative poster", { ...movie, posterUrl: "/poster.jpg" }],
    ["zero duration", { ...movie, durationMin: 0 }],
    ["empty Thai title", { ...movie, titleTh: "" }],
  ])("rejects %s", (_name, value) => {
    expect(seedMovieSchema.safeParse(value).success).toBe(false);
  });

  it("rejects an empty list and duplicate slugs", () => {
    expect(moviesFileSchema.safeParse({ movies: [] }).success).toBe(false);
    expect(moviesFileSchema.safeParse({ movies: [movie, movie] }).success).toBe(false);
  });
});

describe("committed seed files", () => {
  it("movies.sample.json is valid, fictional-looking, sorted by slug and covers every rating and status", () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("./movies.sample.json", import.meta.url), "utf8"),
    );
    const { movies } = moviesFileSchema.parse(raw);

    expect(movies.length).toBeGreaterThanOrEqual(8);
    expect(movies.map((m) => m.slug)).toEqual(movies.map((m) => m.slug).toSorted());
    expect(movies.every((m) => m.tmdbId === null && m.posterUrl === null)).toBe(true);
    expect(new Set(movies.map((m) => m.rating)).size).toBe(6);
    expect(new Set(movies.map((m) => m.status))).toEqual(
      new Set(["NOW_SHOWING", "COMING_SOON", "ENDED"]),
    );
  });

  it("loadMovies falls back to the sample when movies.json is absent", () => {
    const loaded = loadMovies();

    expect(["movies.json", "movies.sample.json"]).toContain(loaded.source);
    expect(loaded.movies.length).toBeGreaterThan(0);
  });
});

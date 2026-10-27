import { describe, expect, it } from "vitest";
import { mapMovies } from "./map-movies";

const genre = (slug: string, en: string) => ({
  tmdbId: null,
  slug,
  nameTh: `${en}-th`,
  nameEn: en,
});

const seed = (slug: string, overrides: Record<string, unknown> = {}) => ({
  tmdbId: null,
  slug,
  titleTh: `${slug}-th`,
  titleEn: `${slug}-en`,
  synopsisTh: "เรื่องย่อ",
  synopsisEn: "Synopsis",
  durationMin: 118,
  rating: "AGE_15",
  originalLanguage: "th",
  releaseDate: "2026-10-09",
  posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
  backdropUrl: null,
  trailerUrl: null,
  status: "NOW_SHOWING",
  genres: [genre("drama", "Drama"), genre("thriller", "Thriller")],
  ...overrides,
});

describe("mapMovies", () => {
  it("maps TH/EN titles and synopses, rating, status, urls and duration", () => {
    const { movies } = mapMovies({
      movies: [seed("one", { backdropUrl: "https://x.test/b.jpg" })],
    });
    expect(movies[0]).toMatchObject({
      slug: "one",
      title: { th: "one-th", en: "one-en" },
      synopsis: { th: "เรื่องย่อ", en: "Synopsis" },
      durationMin: 118,
      rating: "AGE_15",
      status: "NOW_SHOWING",
      posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
      backdropUrl: "https://x.test/b.jpg",
      trailerUrl: null,
    });
  });

  it("gives movies stable uuid-shaped ids by position", () => {
    const { movies } = mapMovies({ movies: [seed("a"), seed("b")] });
    expect(movies.map((m) => m.id)).toEqual([
      "5a7f6a1e-0c1d-4b8e-9a31-000000000000",
      "5a7f6a1e-0c1d-4b8e-9a31-000000000001",
    ]);
  });

  it("de-duplicates genres by slug and numbers them in order of appearance", () => {
    const { genres, movies } = mapMovies({
      movies: [
        seed("a"),
        seed("b", { genres: [genre("thriller", "Thriller"), genre("comedy", "Comedy")] }),
      ],
    });
    expect(genres.map((g) => [g.id, g.slug])).toEqual([
      [1, "drama"],
      [2, "thriller"],
      [3, "comedy"],
    ]);
    expect(movies[1]?.genres.map((g) => g.id)).toEqual([2, 3]);
    expect(genres[0]?.name).toEqual({ th: "Drama-th", en: "Drama" });
  });

  it("keeps null poster, backdrop and trailer", () => {
    const { movies } = mapMovies({ movies: [seed("a", { posterUrl: null })] });
    expect(movies[0]?.posterUrl).toBeNull();
  });

  it.each([
    ["no movies", { movies: [] }],
    ["not an object", 42],
    ["duplicate slug", { movies: [seed("a"), seed("a")] }],
    ["bad slug", { movies: [seed("Not A Slug")] }],
    ["bad rating", { movies: [seed("a", { rating: "R" })] }],
    ["bad status", { movies: [seed("a", { status: "SOON" })] }],
    ["bad date", { movies: [seed("a", { releaseDate: "09/10/2026" })] }],
    ["bad duration", { movies: [seed("a", { durationMin: 0 })] }],
    ["bad poster url", { movies: [seed("a", { posterUrl: "not a url" })] }],
    ["missing title", { movies: [seed("a", { titleTh: "" })] }],
  ])("rejects %s", (_name, input) => {
    expect(() => mapMovies(input)).toThrow();
  });
});

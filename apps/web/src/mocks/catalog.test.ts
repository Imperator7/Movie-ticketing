import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  getShowtime,
  movies as defaultMovies,
  rotationMovieIndex,
  showtimesOnDay,
} from "./catalog";
import type { FixtureMovie, MoviesFixture } from "./map-movies";

function fixtureWith(count: number, comingSoon = 0): MoviesFixture {
  const genres = [{ id: 1, slug: "drama", name: { th: "ดราม่า", en: "Drama" } }];
  const movies: FixtureMovie[] = Array.from({ length: count + comingSoon }, (_, i) => ({
    id: `5a7f6a1e-0c1d-4b8e-9a31-${i.toString().padStart(12, "0")}`,
    slug: `movie-${i.toString()}`,
    title: { th: `หนัง ${i.toString()}`, en: `Movie ${i.toString()}` },
    synopsis: { th: "ย่อ", en: "Synopsis" },
    durationMin: 100 + i,
    rating: "GENERAL",
    originalLanguage: "th",
    releaseDate: "2026-10-01",
    posterUrl: i === 0 ? "https://image.tmdb.org/t/p/w500/p.jpg" : null,
    backdropUrl: null,
    trailerUrl: null,
    status: i < count ? "NOW_SHOWING" : "COMING_SOON",
    genres,
  }));
  return { genres, movies };
}

describe("buildCatalog", () => {
  it("builds movies, genres and the now-showing list from a fixture", () => {
    const catalog = buildCatalog(fixtureWith(3, 2));
    expect(catalog.movies).toHaveLength(5);
    expect(catalog.nowShowing.map((m) => m.slug)).toEqual(["movie-0", "movie-1", "movie-2"]);
    expect(catalog.genres[0]?.name.en).toBe("Drama");
    expect(catalog.movies[0]?.posterUrl).toContain("image.tmdb.org");
    expect(catalog.movies[1]?.posterUrl).toBeNull();
  });

  it.each([1, 3, 6, 11])("rotates over any number of now-showing movies (%i)", (count) => {
    const catalog = buildCatalog(fixtureWith(count, 2));
    const seen = new Set<number>();
    for (let day = 0; day < 40; day++) {
      for (let hall = 0; hall < 3; hall++) {
        for (let slot = 0; slot < 5; slot++) {
          const index = rotationMovieIndex(catalog, hall, slot, day);
          expect(catalog.movies[index]?.status).toBe("NOW_SHOWING");
          seen.add(index);
        }
      }
    }
    // Every now-showing movie gets screenings, coming-soon ones never do.
    expect(seen.size).toBe(count);
  });

  it("has no screenings when nothing is showing", () => {
    expect(rotationMovieIndex(buildCatalog(fixtureWith(0, 2)), 0, 0, 0)).toBe(-1);
  });
});

describe("the default catalog (from movies.fixture.json)", () => {
  it("has movies with unique slugs and showtimes in the schedule", () => {
    expect(defaultMovies.length).toBeGreaterThan(0);
    expect(new Set(defaultMovies.map((m) => m.slug)).size).toBe(defaultMovies.length);
    const day = Math.floor((Date.now() + 7 * 3_600_000) / 86_400_000) - 18262;
    const showtimes = showtimesOnDay(day);
    expect(showtimes.length).toBeGreaterThan(0);
    expect(getShowtime(showtimes[0]?.id ?? "")?.id).toBe(showtimes[0]?.id);
  });
});

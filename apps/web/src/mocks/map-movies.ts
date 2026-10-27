/**
 * Pure mapping from the API seed's movies file (apps/api/prisma/seed/movies*.json) to the web mock
 * fixture. Used by scripts/sync-mock-movies.mjs (Node type stripping) and unit-tested.
 * No imports from apps/api and no runtime dependencies: the seed shape is checked by hand here.
 */

export interface SeedGenreInput {
  tmdbId: number | null;
  slug: string;
  nameTh: string;
  nameEn: string;
}

export interface SeedMovieInput {
  tmdbId: number | null;
  slug: string;
  titleTh: string;
  titleEn: string;
  synopsisTh: string;
  synopsisEn: string;
  durationMin: number;
  rating: string;
  originalLanguage: string;
  releaseDate: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerUrl: string | null;
  status: string;
  genres: SeedGenreInput[];
}

export interface FixtureGenre {
  id: number;
  slug: string;
  name: { th: string; en: string };
}

export interface FixtureMovie {
  id: string;
  slug: string;
  title: { th: string; en: string };
  synopsis: { th: string; en: string };
  durationMin: number;
  rating: "PROMOTED" | "GENERAL" | "AGE_13" | "AGE_15" | "AGE_18" | "AGE_20";
  originalLanguage: string;
  releaseDate: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerUrl: string | null;
  status: "COMING_SOON" | "NOW_SHOWING" | "ENDED";
  genres: FixtureGenre[];
}

export interface MoviesFixture {
  genres: FixtureGenre[];
  movies: FixtureMovie[];
}

const RATINGS = ["PROMOTED", "GENERAL", "AGE_13", "AGE_15", "AGE_18", "AGE_20"] as const;
const STATUSES = ["COMING_SOON", "NOW_SHOWING", "ENDED"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`${path}: expected a string`);
  return value;
}

function nullableUrl(value: unknown, path: string): string | null {
  if (value === null) return null;
  const text = str(value, path);
  try {
    new URL(text);
  } catch {
    throw new Error(`${path}: expected a URL or null`);
  }
  return text;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const found = allowed.find((a) => a === value);
  if (!found) throw new Error(`${path}: expected one of ${allowed.join(", ")}`);
  return found;
}

/** Validates the parts of the seed file the mocks rely on and builds the fixture. */
export function mapMovies(file: unknown): MoviesFixture {
  if (!isRecord(file) || !Array.isArray(file.movies) || file.movies.length === 0) {
    throw new Error("movies file: expected { movies: [ ... ] } with at least one movie");
  }
  const genres: FixtureGenre[] = [];
  const genreBySlug = new Map<string, FixtureGenre>();
  const slugs = new Set<string>();

  const movies = (file.movies as unknown[]).map((raw, index): FixtureMovie => {
    const at = `movies[${index.toString()}]`;
    if (!isRecord(raw)) throw new Error(`${at}: expected an object`);
    const slug = str(raw.slug, `${at}.slug`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`${at}.slug: invalid slug`);
    if (slugs.has(slug)) throw new Error(`${at}.slug: duplicate slug ${slug}`);
    slugs.add(slug);
    const durationMin = raw.durationMin;
    if (typeof durationMin !== "number" || !Number.isInteger(durationMin) || durationMin < 1) {
      throw new Error(`${at}.durationMin: expected a positive integer`);
    }
    const releaseDate = str(raw.releaseDate, `${at}.releaseDate`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
      throw new Error(`${at}.releaseDate: expected YYYY-MM-DD`);
    }
    if (!Array.isArray(raw.genres)) throw new Error(`${at}.genres: expected an array`);

    const movieGenres = (raw.genres as unknown[]).map((g, gi) => {
      const gat = `${at}.genres[${gi.toString()}]`;
      if (!isRecord(g)) throw new Error(`${gat}: expected an object`);
      const gslug = str(g.slug, `${gat}.slug`);
      let genre = genreBySlug.get(gslug);
      if (!genre) {
        genre = {
          id: genres.length + 1,
          slug: gslug,
          name: { th: str(g.nameTh, `${gat}.nameTh`), en: str(g.nameEn, `${gat}.nameEn`) },
        };
        genres.push(genre);
        genreBySlug.set(gslug, genre);
      }
      return genre;
    });

    return {
      id: `5a7f6a1e-0c1d-4b8e-9a31-${index.toString().padStart(12, "0")}`,
      slug,
      title: { th: str(raw.titleTh, `${at}.titleTh`), en: str(raw.titleEn, `${at}.titleEn`) },
      synopsis: {
        th: str(raw.synopsisTh, `${at}.synopsisTh`),
        en: str(raw.synopsisEn, `${at}.synopsisEn`),
      },
      durationMin,
      rating: oneOf(raw.rating, RATINGS, `${at}.rating`),
      originalLanguage: str(raw.originalLanguage, `${at}.originalLanguage`),
      releaseDate,
      posterUrl: nullableUrl(raw.posterUrl, `${at}.posterUrl`),
      backdropUrl: nullableUrl(raw.backdropUrl, `${at}.backdropUrl`),
      trailerUrl: nullableUrl(raw.trailerUrl, `${at}.trailerUrl`),
      status: oneOf(raw.status, STATUSES, `${at}.status`),
      genres: movieGenres,
    };
  });

  return { genres, movies };
}

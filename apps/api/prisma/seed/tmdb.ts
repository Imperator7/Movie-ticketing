import { z } from "zod";
import type { SeedGenre, SeedMovie } from "./schema.js";

export const TMDB_API_BASE = "https://api.themoviedb.org/3";
export const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
export const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/w1280";

// ---------------------------------------------------------------- response shapes (only what we read)

const listSchema = z.object({
  results: z.array(z.object({ id: z.number().int() })),
});

const detailsSchema = z.object({
  id: z.number().int(),
  title: z.string().nullish(),
  overview: z.string().nullish(),
  runtime: z.number().nullish(),
  release_date: z.string().nullish(),
  original_language: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  adult: z.boolean().nullish(),
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })).default([]),
  release_dates: z
    .object({
      results: z.array(
        z.object({
          iso_3166_1: z.string(),
          release_dates: z.array(z.object({ certification: z.string().nullish() })),
        }),
      ),
    })
    .nullish(),
  videos: z
    .object({
      results: z.array(
        z.object({
          key: z.string(),
          site: z.string(),
          type: z.string(),
          official: z.boolean().nullish(),
        }),
      ),
    })
    .nullish(),
});

export type TmdbDetails = z.infer<typeof detailsSchema>;
export type SeedMovieStatus = SeedMovie["status"];

// ---------------------------------------------------------------- pure mapping

type MovieRating = SeedMovie["rating"];

const THAI_CERTIFICATIONS: Record<string, MovieRating> = {
  ส: "PROMOTED",
  ท: "GENERAL",
  "น13+": "AGE_13",
  "13+": "AGE_13",
  "13": "AGE_13",
  "น15+": "AGE_15",
  "15+": "AGE_15",
  "15": "AGE_15",
  "น18+": "AGE_18",
  "18+": "AGE_18",
  "18": "AGE_18",
  "ฉ20-": "AGE_20",
  ฉ20: "AGE_20",
  "20": "AGE_20",
};

/** US MPAA fallback when TMDB has no Thai certification. */
const US_CERTIFICATIONS: Record<string, MovieRating> = {
  G: "GENERAL",
  PG: "AGE_13",
  "PG-13": "AGE_13",
  R: "AGE_18",
  "NC-17": "AGE_20",
};

const DEFAULT_RATING: MovieRating = "AGE_13";

function certificationFor(details: TmdbDetails, country: string): string | undefined {
  const entry = details.release_dates?.results.find((item) => item.iso_3166_1 === country);
  return entry?.release_dates.map((date) => date.certification?.trim()).find((value) => value);
}

/** Thai certification -> our Thai rating. Falls back to the US rating, then `adult`, then a conservative default. */
export function mapRating(details: TmdbDetails): MovieRating {
  const thai = certificationFor(details, "TH");
  const fromThai = thai ? THAI_CERTIFICATIONS[thai.replace(/\s+/g, "")] : undefined;
  if (fromThai) return fromThai;

  const us = certificationFor(details, "US");
  const fromUs = us ? US_CERTIFICATIONS[us.toUpperCase()] : undefined;
  if (fromUs) return fromUs;

  return details.adult === true ? "AGE_18" : DEFAULT_RATING;
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function posterUrl(path: string | null | undefined): string | null {
  return path ? `${POSTER_BASE_URL}${path}` : null;
}

export function backdropUrl(path: string | null | undefined): string | null {
  return path ? `${BACKDROP_BASE_URL}${path}` : null;
}

/** First YouTube trailer, preferring official ones only if listed first; otherwise list order. */
export function trailerUrl(details: TmdbDetails): string | null {
  const video = details.videos?.results.find(
    (item) => item.site === "YouTube" && item.type === "Trailer",
  );
  return video ? `https://www.youtube.com/watch?v=${video.key}` : null;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return undefined;
  return trimmed;
}

/**
 * Combines the th-TH and en-US details of one movie. Thai text falls back to English when TMDB has no
 * Thai translation (and vice versa), so every movie always has both languages filled in.
 * Returns null when the movie lacks data we cannot invent (runtime, release date, English title).
 */
export function mapTmdbMovie(
  th: TmdbDetails,
  en: TmdbDetails,
  status: SeedMovieStatus,
): SeedMovie | null {
  const titleEn = nonEmpty(en.title) ?? nonEmpty(th.title);
  const runtime = en.runtime ?? th.runtime ?? 0;
  const releaseDate = nonEmpty(en.release_date) ?? nonEmpty(th.release_date);
  if (!titleEn || runtime <= 0 || !releaseDate) return null;

  const titleTh = nonEmpty(th.title) ?? titleEn;
  const synopsisEn = nonEmpty(en.overview) ?? nonEmpty(th.overview) ?? titleEn;
  const synopsisTh = nonEmpty(th.overview) ?? synopsisEn;

  const thaiNames = new Map(th.genres.map((genre) => [genre.id, genre.name]));
  const genres: SeedGenre[] = en.genres
    .map((genre) => ({
      tmdbId: genre.id,
      slug: slugify(genre.name),
      nameTh: nonEmpty(thaiNames.get(genre.id)) ?? genre.name,
      nameEn: genre.name,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    tmdbId: en.id,
    slug: slugify(titleEn) || "movie",
    titleTh,
    titleEn,
    synopsisTh,
    synopsisEn,
    durationMin: Math.round(runtime),
    rating: mapRating(en.release_dates ? en : th),
    originalLanguage: nonEmpty(en.original_language) ?? "en",
    releaseDate,
    posterUrl: posterUrl(en.poster_path ?? th.poster_path),
    backdropUrl: backdropUrl(en.backdrop_path ?? th.backdrop_path),
    trailerUrl: trailerUrl(en) ?? trailerUrl(th),
    status,
    genres,
  };
}

/** Makes slugs unique (a rare title clash gets its TMDB id appended) and sorts the list for a stable file. */
export function finalizeMovies(movies: SeedMovie[]): SeedMovie[] {
  const used = new Set<string>();
  const unique = movies
    .toSorted((a, b) => (a.tmdbId ?? 0) - (b.tmdbId ?? 0))
    .map((movie) => {
      let slug = movie.slug;
      if (used.has(slug)) slug = `${slug}-${String(movie.tmdbId ?? "x")}`;
      used.add(slug);
      return { ...movie, slug };
    });
  return unique.toSorted((a, b) => a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------- HTTP client

export interface TmdbClientOptions {
  /** v4 read access token (a JWT) or v3 API key (32 hex characters). */
  apiKey: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function isV4Token(apiKey: string): boolean {
  return apiKey.startsWith("eyJ") || apiKey.length > 40;
}

export class TmdbClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TmdbClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** GET with auth, retrying on 429 (honouring Retry-After) and transient 5xx errors. */
  async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${TMDB_API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const headers: Record<string, string> = { accept: "application/json" };
    if (isV4Token(this.options.apiKey)) headers.authorization = `Bearer ${this.options.apiKey}`;
    else url.searchParams.set("api_key", this.options.apiKey);

    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(url, { headers });
      if (response.ok) return await response.json();

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        throw new Error(`TMDB ${path} failed with HTTP ${String(response.status)}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await this.sleep(waitMs);
    }
  }

  async listIds(kind: "now_playing" | "upcoming", limit: number): Promise<number[]> {
    const body = listSchema.parse(
      await this.get(`/movie/${kind}`, { region: "TH", language: "en-US", page: "1" }),
    );
    return body.results.slice(0, limit).map((item) => item.id);
  }

  async details(id: number, language: "th-TH" | "en-US"): Promise<TmdbDetails> {
    return detailsSchema.parse(
      await this.get(`/movie/${String(id)}`, {
        language,
        append_to_response: "release_dates,videos",
        include_video_language: "en,th,null",
      }),
    );
  }
}

/** Runs `worker` over `items` with at most `limit` in flight, keeping result order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

export interface FetchMoviesOptions {
  nowPlaying?: number;
  upcoming?: number;
  concurrency?: number;
}

/** Fetches now playing + upcoming Thai releases in both languages and maps them to seed movies. */
export async function fetchSeedMovies(
  client: TmdbClient,
  options: FetchMoviesOptions = {},
): Promise<SeedMovie[]> {
  const nowIds = await client.listIds("now_playing", options.nowPlaying ?? 12);
  const upcomingIds = (await client.listIds("upcoming", options.upcoming ?? 6)).filter(
    (id) => !nowIds.includes(id),
  );

  const targets: { id: number; status: SeedMovieStatus }[] = [
    ...nowIds.map((id) => ({ id, status: "NOW_SHOWING" as const })),
    ...upcomingIds.map((id) => ({ id, status: "COMING_SOON" as const })),
  ];

  const mapped = await mapWithConcurrency(
    targets,
    options.concurrency ?? 4,
    async ({ id, status }) => {
      const [th, en] = await Promise.all([
        client.details(id, "th-TH"),
        client.details(id, "en-US"),
      ]);
      return mapTmdbMovie(th, en, status);
    },
  );
  return finalizeMovies(mapped.filter((movie): movie is SeedMovie => movie !== null));
}

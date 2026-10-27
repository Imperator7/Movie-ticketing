import { z } from "zod";

/** Mirrors the Prisma enums (kept literal so this file has no dependency on the generated client). */
export const MOVIE_RATINGS = [
  "PROMOTED",
  "GENERAL",
  "AGE_13",
  "AGE_15",
  "AGE_18",
  "AGE_20",
] as const;
export const MOVIE_STATUSES = ["COMING_SOON", "NOW_SHOWING", "ENDED"] as const;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const seedGenreSchema = z.strictObject({
  tmdbId: z.number().int().positive().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  nameTh: z.string().min(1),
  nameEn: z.string().min(1),
});

export const seedMovieSchema = z.strictObject({
  tmdbId: z.number().int().positive().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  titleTh: z.string().min(1),
  titleEn: z.string().min(1),
  synopsisTh: z.string().min(1),
  synopsisEn: z.string().min(1),
  durationMin: z.number().int().min(30).max(400),
  rating: z.enum(MOVIE_RATINGS),
  originalLanguage: z.string().min(2).max(3),
  releaseDate: dateOnly,
  /** Full TMDB image URL (w500), or null when there is no poster (the seed substitutes a placeholder). */
  posterUrl: z.url().nullable(),
  backdropUrl: z.url().nullable(),
  trailerUrl: z.url().nullable(),
  status: z.enum(MOVIE_STATUSES),
  genres: z.array(seedGenreSchema),
});

export const moviesFileSchema = z
  .strictObject({ movies: z.array(seedMovieSchema).min(1) })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.movies.forEach((movie, index) => {
      if (seen.has(movie.slug)) {
        ctx.addIssue({
          code: "custom",
          path: ["movies", index, "slug"],
          message: `duplicate slug ${movie.slug}`,
        });
      }
      seen.add(movie.slug);
    });
  });

export type SeedGenre = z.infer<typeof seedGenreSchema>;
export type SeedMovie = z.infer<typeof seedMovieSchema>;
export type MoviesFile = z.infer<typeof moviesFileSchema>;

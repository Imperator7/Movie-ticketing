import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { createStrictDto } from "../common/validation/strict-dto.js";

// ---------------------------------------------------------------- query / path DTOs (strict)

const MOVIE_STATUSES = ["COMING_SOON", "NOW_SHOWING", "ENDED"] as const;

/** A real calendar day, `YYYY-MM-DD`. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "invalid calendar date");

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export class ListMoviesQueryDto extends createStrictDto({
  status: z.enum(MOVIE_STATUSES).optional(),
  genre: z.string().trim().min(1).max(100).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
}) {}

export class MovieShowtimesQueryDto extends createStrictDto({
  date: calendarDate,
  cinemaId: z.uuid().optional(),
}) {}

// ---------------------------------------------------------------- response schemas (the contract's shapes)

const localizedText = z.object({ th: z.string(), en: z.string() });
const movieStatus = z.enum(MOVIE_STATUSES);
const movieRating = z.enum(["PROMOTED", "GENERAL", "AGE_13", "AGE_15", "AGE_18", "AGE_20"]);

export const genreSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: localizedText,
});

export const cinemaSchema = z.object({
  id: z.uuid(),
  name: localizedText,
  address: localizedText,
  city: z.string(),
});

export const movieSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: localizedText,
  synopsis: localizedText,
  durationMin: z.number().int(),
  rating: movieRating,
  releaseDate: z.iso.date(),
  posterUrl: z.url().nullable(),
  status: movieStatus,
  genres: z.array(genreSchema),
});

export const movieDetailSchema = movieSummarySchema.extend({
  originalLanguage: z.string(),
  backdropUrl: z.url().nullable().optional(),
  trailerUrl: z.url().nullable().optional(),
});

export const moviePageSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  items: z.array(movieSummarySchema),
});

export const showtimeSlotSchema = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  format: z.enum(["TWO_D", "THREE_D", "IMAX"]),
  audioLanguage: z.string(),
  subtitleLanguage: z.string().nullable().optional(),
  hallNumber: z.number().int(),
  hallType: z.enum(["STANDARD", "IMAX", "FOUR_DX"]),
  fromPriceBaht: z.number().int(),
  seatsLeft: z.number().int(),
});

export const movieShowtimesSchema = z.object({
  movieId: z.uuid(),
  date: z.iso.date(),
  availableDates: z.array(z.iso.date()),
  cinemas: z.array(z.object({ cinema: cinemaSchema, showtimes: z.array(showtimeSlotSchema) })),
});

export class GenreDto extends createZodDto(genreSchema) {}
export class CinemaDto extends createZodDto(cinemaSchema) {}
export class MovieSummaryDto extends createZodDto(movieSummarySchema) {}
export class MovieDetailDto extends createZodDto(movieDetailSchema) {}
export class MoviePageDto extends createZodDto(moviePageSchema) {}
export class MovieShowtimesDto extends createZodDto(movieShowtimesSchema) {}

export type GenreBody = z.infer<typeof genreSchema>;
export type CinemaBody = z.infer<typeof cinemaSchema>;
export type MovieSummaryBody = z.infer<typeof movieSummarySchema>;
export type MovieDetailBody = z.infer<typeof movieDetailSchema>;
export type MoviePageBody = z.infer<typeof moviePageSchema>;
export type ShowtimeSlotBody = z.infer<typeof showtimeSlotSchema>;
export type MovieShowtimesBody = z.infer<typeof movieShowtimesSchema>;

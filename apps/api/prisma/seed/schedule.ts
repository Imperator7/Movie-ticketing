import { bangkokDayRange } from "../../src/common/time/bangkok.js";
import type { HallKind } from "./pricing.js";

export const OPENING_MINUTE = 10 * 60 + 30; // first show may start at 10:30 Bangkok
export const LAST_START_MINUTE = 23 * 60 + 30; // last show may start at 23:30 Bangkok
export const CLEANING_BUFFER_MIN = 20;
export const MIN_SHOWS_PER_DAY = 4;
export const MAX_SHOWS_PER_DAY = 6;

export interface ScheduleMovie {
  slug: string;
  durationMin: number;
  /** ISO 639-1, e.g. "th", "en". */
  originalLanguage: string;
}

export type ShowFormat = "TWO_D" | "THREE_D" | "IMAX";

export interface PlannedShow {
  movieSlug: string;
  /** Minutes after 00:00 Bangkok of the day. */
  startMinute: number;
  endMinute: number;
  startsAt: Date;
  endsAt: Date;
  format: ShowFormat;
  audioLanguage: string;
  subtitleLanguage: string | null;
}

// ---------------------------------------------------------------- deterministic randomness

/** FNV-1a 32-bit hash of a string. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- date helpers

/** `YYYY-MM-DD` + n days, calendar arithmetic only (no timezone involved). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday for a calendar date. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// ---------------------------------------------------------------- generator

export interface DayScheduleInput {
  /** Stable key of the hall (e.g. "<cinema name>#<number>"), so each hall gets its own schedule. */
  hallKey: string;
  hallType: HallKind;
  /** Bangkok calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Movies that may be shown this day (already filtered by status / release date). */
  movies: readonly ScheduleMovie[];
}

const roundUpTo5 = (minutes: number): number => Math.ceil(minutes / 5) * 5;

/**
 * Plans one hall's day: 4-6 shows between 10:30 and 23:30 (start times), each `duration + 20 min` long, back to
 * back with a short random gap, never overlapping. Deterministic: same input, same output.
 */
export function generateDaySchedule(input: DayScheduleInput): PlannedShow[] {
  if (input.movies.length === 0) return [];
  const random = seededRandom(hashString(`${input.hallKey}|${input.date}`));
  const dayStart = bangkokDayRange(input.date).start.getTime();
  const wanted =
    MIN_SHOWS_PER_DAY + Math.floor(random() * (MAX_SHOWS_PER_DAY - MIN_SHOWS_PER_DAY + 1));

  // Stable order so the pick does not depend on the caller's array order.
  const movies = input.movies.toSorted((a, b) => a.slug.localeCompare(b.slug));
  const shortest = movies.reduce((best, movie) =>
    movie.durationMin < best.durationMin ? movie : best,
  );

  const shows: PlannedShow[] = [];
  let cursor = OPENING_MINUTE;
  let lastSlug = "";

  while (shows.length < wanted) {
    const start = roundUpTo5(cursor);
    if (start > LAST_START_MINUTE) break;

    // Avoid showing the same movie twice in a row when there is a choice.
    const pool = movies.length > 1 ? movies.filter((movie) => movie.slug !== lastSlug) : movies;
    const movie = pool[Math.floor(random() * pool.length)] ?? shortest;
    const end = start + movie.durationMin + CLEANING_BUFFER_MIN;

    const format: ShowFormat =
      input.hallType === "IMAX"
        ? "IMAX"
        : movie.originalLanguage !== "th" && random() < 0.25
          ? "THREE_D"
          : "TWO_D";
    const dubbed = movie.originalLanguage !== "th" && random() < 0.3;
    const audioLanguage = dubbed || movie.originalLanguage === "th" ? "TH" : "EN";
    const subtitleLanguage =
      audioLanguage === "EN" ? "TH" : movie.originalLanguage === "th" ? "EN" : null;

    shows.push({
      movieSlug: movie.slug,
      startMinute: start,
      endMinute: end,
      startsAt: new Date(dayStart + start * 60_000),
      endsAt: new Date(dayStart + end * 60_000),
      format,
      audioLanguage,
      subtitleLanguage,
    });

    lastSlug = movie.slug;
    cursor = end + Math.floor(random() * 3) * 5; // 0, 5 or 10 minutes of slack after cleaning
  }
  return shows;
}

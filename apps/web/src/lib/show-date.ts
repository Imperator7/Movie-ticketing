const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string | null | undefined): value is string {
  return typeof value === "string" && DATE_ONLY.test(value) && !Number.isNaN(Date.parse(value));
}

export interface ResolvedShowDate {
  /** The day to show (and to ask `listMovieShowtimes` for). */
  date: string;
  /** The URL should be updated to `date` (the requested day has no showtimes, so we jumped). */
  jumped: boolean;
}

/**
 * Which day the movie page shows. `listMovieShowtimes` needs a `date`, so we ask for the URL's
 * day (or today, Bangkok) first; once `availableDates` is known, a day without showtimes
 * jumps to the first day that has some. While it is still unknown, or when there are no
 * showtimes at all, the requested day stays.
 */
export function resolveShowDate(
  requested: string | null | undefined,
  today: string,
  availableDates: readonly string[] | undefined,
): ResolvedShowDate {
  const wanted = isDateOnly(requested) ? requested : today;
  const first = availableDates?.[0];
  if (first === undefined || availableDates?.includes(wanted)) {
    return { date: wanted, jumped: false };
  }
  return { date: first, jumped: true };
}

/**
 * The only place that knows the cinemas' timezone (Asia/Bangkok, UTC+7, no DST).
 * "A day" in the API is always a Bangkok calendar day.
 */
export const BANGKOK_TIME_ZONE = "Asia/Bangkok";

const BANGKOK_UTC_OFFSET_MINUTES = 7 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `start` is inclusive, `end` is exclusive (the start of the next Bangkok day). Both are UTC instants. */
export interface DayRange {
  start: Date;
  end: Date;
}

/** Bangkok calendar day `YYYY-MM-DD` -> `[00:00, next 00:00)` Bangkok time as UTC Dates. Throws on invalid input. */
export function bangkokDayRange(date: string): DayRange {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const utcMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(utcMidnight);
  // Rejects 2026-02-30 and similar that Date would silently roll over.
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date "${date}"`);
  }

  const startMs = utcMidnight - BANGKOK_UTC_OFFSET_MINUTES * MS_PER_MINUTE;
  return { start: new Date(startMs), end: new Date(startMs + MS_PER_DAY) };
}

/** The Bangkok calendar day (`YYYY-MM-DD`) an instant falls on. */
export function bangkokDateOf(instant: Date): string {
  const shifted = new Date(instant.getTime() + BANGKOK_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
  return shifted.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` plus n calendar days (pure calendar arithmetic, no timezone involved). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

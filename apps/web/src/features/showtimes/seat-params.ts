import { MAX_SEATS_PER_BOOKING } from "@/lib/seat";

const SEAT_LABEL = /^[A-Z]{1,2}\d{1,2}$/;

/** Parses `?seats=A5,A6` into seat labels: trimmed, upper-cased, valid, unique, at most 4. */
export function parseSeatsParam(value: string | null | undefined): string[] {
  if (!value) return [];
  const labels: string[] = [];
  for (const part of value.split(",")) {
    const label = part.trim().toUpperCase();
    if (SEAT_LABEL.test(label) && !labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, MAX_SEATS_PER_BOOKING);
}

/** Inverse of `parseSeatsParam`. */
export function serializeSeatsParam(labels: readonly string[]): string {
  return labels.join(",");
}

/** Locale-less path to the seat selection screen (the locale-aware router adds the prefix). */
export function showtimePath(showtimeId: string, labels: readonly string[]): string {
  const query = new URLSearchParams({ id: showtimeId });
  if (labels.length > 0) query.set("seats", serializeSeatsParam(labels));
  return `/showtime?${query.toString().replace(/%2C/g, ",")}`;
}

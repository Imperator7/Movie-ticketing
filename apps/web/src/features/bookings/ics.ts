import type { Booking } from "@/api/generated/model";
import type { Locale } from "@/lib/format";
import { pickText } from "@/lib/localized";

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "20261028T123000Z" */
export function icsDate(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** RFC 5545 content lines are folded at 75 octets: continuation lines start with a space. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** An iCalendar (.ics) file with one event for the booking's showtime. */
export function buildIcs(booking: Booking, locale: Locale, now: number = Date.now()): string {
  const start = Date.parse(booking.showtime.startsAt);
  const end = start + booking.showtime.movie.durationMin * 60_000;
  const title = pickText(booking.showtime.movie.title, locale);
  const cinema = pickText(booking.showtime.cinema.name, locale);
  const seats = booking.seats.map((s) => s.label).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Movie Ticketing//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.bookingCode}@movie-ticketing`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(`${cinema} - ${String(booking.showtime.hallNumber)}`)}`,
    `DESCRIPTION:${escapeText(`${booking.bookingCode}\n${seats}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function icsFileName(booking: Booking): string {
  return `${booking.bookingCode}.ics`;
}

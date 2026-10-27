import { describe, expect, it } from "vitest";
import type { Booking } from "@/api/generated/model";
import { buildIcs, foldLine, icsDate, icsFileName } from "./ics";

const booking: Booking = {
  id: "b1",
  bookingCode: "MT-7KQ2XP",
  status: "CONFIRMED",
  cancelReason: null,
  showtime: {
    id: "s1",
    startsAt: "2026-10-28T19:30:00+07:00",
    format: "IMAX",
    hallNumber: 2,
    movie: {
      slug: "last-orbit",
      title: { th: "วงโคจรสุดท้าย", en: "The Last Orbit, Part 1; Remastered" },
      posterUrl: null,
      rating: "AGE_13",
      durationMin: 148,
    },
    cinema: {
      id: "c1",
      name: { th: "โรงภาพยนตร์ สยาม", en: "Siam Cinema" },
      address: { th: "x", en: "x" },
      city: "Bangkok",
    },
  },
  seats: [
    { seatId: "1", label: "A5", type: "STANDARD", priceBaht: 220 },
    { seatId: "2", label: "A6", type: "STANDARD", priceBaht: 220 },
  ],
  totalBaht: 440,
  currency: "THB",
  paymentExpiresAt: "2026-10-28T10:00:00Z",
  holdExpiresAt: "2026-10-28T10:00:00Z",
  createdAt: "2026-10-28T09:55:00Z",
  ticketQr: "MT-7KQ2XP.ABC",
};

describe("buildIcs", () => {
  const ics = buildIcs(booking, "en", Date.parse("2026-10-28T09:00:00Z"));

  it("is a CRLF terminated VCALENDAR with one VEVENT", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("converts the Bangkok start to UTC and adds the duration for the end", () => {
    expect(ics).toContain("DTSTART:20261028T123000Z");
    expect(ics).toContain("DTEND:20261028T145800Z");
    expect(ics).toContain("DTSTAMP:20261028T090000Z");
  });

  it("uses the booking code as a stable UID and lists the seats", () => {
    expect(ics).toContain("UID:MT-7KQ2XP@movie-ticketing");
    expect(ics).toContain("DESCRIPTION:MT-7KQ2XP\\nA5\\, A6");
  });

  it("escapes commas and semicolons in text", () => {
    expect(ics).toContain("SUMMARY:The Last Orbit\\, Part 1\\; Remastered");
  });

  it("uses the Thai title for the Thai locale", () => {
    expect(buildIcs(booking, "th")).toContain("SUMMARY:วงโคจรสุดท้าย");
  });

  it("never exceeds 75 octets per line", () => {
    const encoder = new TextEncoder();
    for (const line of buildIcs(booking, "th").split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("helpers", () => {
  it("icsDate formats UTC without separators", () => {
    expect(icsDate(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe("20260102T030405Z");
  });

  it("foldLine folds long lines with a leading space on continuations", () => {
    const folded = foldLine(`X:${"a".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`X:${"a".repeat(200)}`);
  });

  it("names the file after the booking code", () => {
    expect(icsFileName(booking)).toBe("MT-7KQ2XP.ics");
  });
});

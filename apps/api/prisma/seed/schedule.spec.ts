import { required } from "./required.js";
import { describe, expect, it } from "vitest";
import { bangkokDayRange } from "../../src/common/time/bangkok.js";
import {
  CLEANING_BUFFER_MIN,
  LAST_START_MINUTE,
  MAX_SHOWS_PER_DAY,
  MIN_SHOWS_PER_DAY,
  OPENING_MINUTE,
  addDays,
  generateDaySchedule,
  hashString,
  seededRandom,
  weekdayOf,
  type ScheduleMovie,
} from "./schedule.js";

const MOVIES: ScheduleMovie[] = [
  { slug: "a", durationMin: 92, originalLanguage: "th" },
  { slug: "b", durationMin: 118, originalLanguage: "en" },
  { slug: "c", durationMin: 148, originalLanguage: "en" },
  { slug: "d", durationMin: 165, originalLanguage: "ja" },
  { slug: "e", durationMin: 105, originalLanguage: "th" },
];

function dates(count: number, from = "2026-10-28"): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

describe("generateDaySchedule", () => {
  it("is deterministic and independent of the movie array order", () => {
    const input = {
      hallKey: "Cinema#1",
      hallType: "STANDARD" as const,
      date: "2026-11-02",
      movies: MOVIES,
    };

    const first = generateDaySchedule(input);
    const again = generateDaySchedule(input);
    const shuffled = generateDaySchedule({ ...input, movies: MOVIES.toReversed() });

    expect(again).toEqual(first);
    expect(shuffled).toEqual(first);
  });

  it("differs between halls and between days", () => {
    const base = { hallType: "STANDARD" as const, movies: MOVIES };
    const a = generateDaySchedule({ ...base, hallKey: "Cinema#1", date: "2026-11-02" });
    const b = generateDaySchedule({ ...base, hallKey: "Cinema#2", date: "2026-11-02" });
    const c = generateDaySchedule({ ...base, hallKey: "Cinema#1", date: "2026-11-03" });

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("plans 4-6 non-overlapping shows inside opening hours across many halls and days", () => {
    for (const hallKey of ["A#1", "A#2", "A#3", "B#1", "B#2", "B#3"]) {
      for (const date of dates(31)) {
        const shows = generateDaySchedule({ hallKey, hallType: "STANDARD", date, movies: MOVIES });

        expect(shows.length).toBeGreaterThanOrEqual(MIN_SHOWS_PER_DAY);
        expect(shows.length).toBeLessThanOrEqual(MAX_SHOWS_PER_DAY);
        shows.forEach((show, index) => {
          expect(show.startMinute).toBeGreaterThanOrEqual(OPENING_MINUTE);
          expect(show.startMinute).toBeLessThanOrEqual(LAST_START_MINUTE);
          expect(show.startMinute % 5).toBe(0);
          const next = shows[index + 1];
          // Strictly after the previous show ended (no overlap), by at least the cleaning buffer.
          if (next) expect(next.startMinute).toBeGreaterThanOrEqual(show.endMinute);
        });
      }
    }
  });

  it("ends each show at start + duration + 20 min and converts Bangkok minutes to UTC instants", () => {
    const shows = generateDaySchedule({
      hallKey: "A#1",
      hallType: "STANDARD",
      date: "2026-11-02",
      movies: MOVIES,
    });
    const dayStart = bangkokDayRange("2026-11-02").start.getTime();

    for (const show of shows) {
      const movie = required(
        MOVIES.find((item) => item.slug === show.movieSlug),
        "movie",
      );
      expect(show.endMinute - show.startMinute).toBe(movie.durationMin + CLEANING_BUFFER_MIN);
      expect(show.startsAt.getTime()).toBe(dayStart + show.startMinute * 60_000);
      expect(show.endsAt.getTime() - show.startsAt.getTime()).toBe(
        (movie.durationMin + CLEANING_BUFFER_MIN) * 60_000,
      );
    }
    // 10:30 Bangkok is 03:30 UTC.
    expect(shows[0]?.startsAt.toISOString()).toBe("2026-11-02T03:30:00.000Z");
  });

  it("uses the IMAX format in IMAX halls and only 2D/3D elsewhere", () => {
    for (const date of dates(10)) {
      const imax = generateDaySchedule({ hallKey: "A#3", hallType: "IMAX", date, movies: MOVIES });
      const standard = generateDaySchedule({
        hallKey: "A#1",
        hallType: "STANDARD",
        date,
        movies: MOVIES,
      });

      expect(imax.every((show) => show.format === "IMAX")).toBe(true);
      expect(standard.every((show) => show.format === "TWO_D" || show.format === "THREE_D")).toBe(
        true,
      );
    }
  });

  it("never shows the same movie twice in a row when there is a choice", () => {
    for (const date of dates(20)) {
      const shows = generateDaySchedule({
        hallKey: "A#1",
        hallType: "STANDARD",
        date,
        movies: MOVIES,
      });
      shows.slice(1).forEach((show, i) => {
        expect(show.movieSlug).not.toBe(shows[i]?.movieSlug);
      });
    }
  });

  it("sets Thai audio for Thai films and Thai subtitles for English audio", () => {
    for (const date of dates(20)) {
      for (const show of generateDaySchedule({
        hallKey: "A#1",
        hallType: "STANDARD",
        date,
        movies: MOVIES,
      })) {
        const movie = required(
          MOVIES.find((item) => item.slug === show.movieSlug),
          "movie",
        );
        if (movie.originalLanguage === "th") expect(show.audioLanguage).toBe("TH");
        if (show.audioLanguage === "EN") expect(show.subtitleLanguage).toBe("TH");
      }
    }
  });

  it("works with a single movie and returns nothing when there are none", () => {
    const one = generateDaySchedule({
      hallKey: "A#1",
      hallType: "STANDARD",
      date: "2026-11-02",
      movies: [required(MOVIES[0], "movie")],
    });

    expect(one.length).toBeGreaterThanOrEqual(MIN_SHOWS_PER_DAY);
    expect(
      generateDaySchedule({ hallKey: "A#1", hallType: "STANDARD", date: "2026-11-02", movies: [] }),
    ).toEqual([]);
  });

  it("stops early instead of overlapping when films are very long", () => {
    const long: ScheduleMovie[] = [{ slug: "epic", durationMin: 240, originalLanguage: "en" }];
    const shows = generateDaySchedule({
      hallKey: "A#1",
      hallType: "STANDARD",
      date: "2026-11-02",
      movies: long,
    });

    shows.slice(1).forEach((show, i) => {
      expect(show.startMinute).toBeGreaterThanOrEqual(shows[i]?.endMinute ?? 0);
    });
    expect(shows.every((show) => show.startMinute <= LAST_START_MINUTE)).toBe(true);
  });
});

describe("helpers", () => {
  it("hashString and seededRandom are stable", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = [a(), a(), a()];
    expect(values).toEqual([b(), b(), b()]);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("addDays handles month, year and leap boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("weekdayOf returns 0 for Sunday", () => {
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(weekdayOf("2026-11-07")).toBe(6);
  });
});

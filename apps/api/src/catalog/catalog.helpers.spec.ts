import { describe, expect, it } from "vitest";
import { addDays } from "../common/time/bangkok.js";
import { ListMoviesQueryDto, MovieShowtimesQueryDto } from "./catalog.dto.js";
import {
  distinctBangkokDates,
  escapeLike,
  normalizeSearch,
  pageWindow,
} from "./catalog.helpers.js";

describe("escapeLike", () => {
  it.each([
    ["100%", "100\\%"],
    ["a_b", "a\\_b"],
    ["back\\slash", "back\\\\slash"],
    ["%_\\", "\\%\\_\\\\"],
    ["plain ดูน", "plain ดูน"],
  ])("%j -> %j", (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe("normalizeSearch", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearch("  dune   part\ttwo ")).toBe("dune part two");
  });

  it("treats blank or missing input as no filter", () => {
    expect(normalizeSearch(undefined)).toBeUndefined();
    expect(normalizeSearch("")).toBeUndefined();
    expect(normalizeSearch(" \n\t ")).toBeUndefined();
  });
});

describe("pageWindow", () => {
  it.each([
    [1, 20, 0, 20],
    [2, 20, 20, 20],
    [3, 5, 10, 5],
    [1, 50, 0, 50],
    [10, 1, 9, 1],
  ])("page %i size %i -> skip %i take %i", (page, size, skip, take) => {
    expect(pageWindow(page, size)).toEqual({ skip, take });
  });
});

describe("distinctBangkokDates", () => {
  it("groups instants by Bangkok calendar day, not UTC day", () => {
    const dates = distinctBangkokDates([
      new Date("2026-11-01T16:30:00Z"), // 23:30 Bangkok on the 1st (still the 1st in UTC too)
      new Date("2026-11-01T17:30:00Z"), // 00:30 Bangkok on the 2nd (UTC still the 1st)
      new Date("2026-11-01T03:30:00Z"), // 10:30 Bangkok on the 1st
      new Date("2026-11-02T16:59:59Z"), // 23:59:59 Bangkok on the 2nd
    ]);

    expect(dates).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("returns an empty list for no showtimes and sorts ascending", () => {
    expect(distinctBangkokDates([])).toEqual([]);
    expect(
      distinctBangkokDates([new Date("2026-12-05T05:00:00Z"), new Date("2026-12-03T05:00:00Z")]),
    ).toEqual(["2026-12-03", "2026-12-05"]);
  });
});

describe("addDays", () => {
  it("handles month, year and leap boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-28", 30)).toBe("2026-11-27");
  });
});

describe("query DTO schemas", () => {
  it("coerces and defaults page and pageSize", () => {
    expect(ListMoviesQueryDto.schema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(ListMoviesQueryDto.schema.parse({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([
    { page: "0" },
    { page: "1.5" },
    { page: "abc" },
    { pageSize: "0" },
    { pageSize: "51" },
    { status: "LIVE" },
    { q: "x".repeat(101) },
    { unknown: "1" },
    { genre: "" },
  ])("list query rejects %j", (query) => {
    expect(ListMoviesQueryDto.schema.safeParse(query).success).toBe(false);
  });

  it("showtimes query requires a real calendar date and an optional uuid", () => {
    const ok = MovieShowtimesQueryDto.schema.safeParse({
      date: "2028-02-29",
      cinemaId: "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10",
    });

    expect(ok.success).toBe(true);
    for (const bad of [
      {},
      { date: "2026-02-29" },
      { date: "2026-13-01" },
      { date: "29-02-2028" },
      { date: "2026-10-28", cinemaId: "nope" },
      { date: "2026-10-28", extra: 1 },
    ]) {
      expect(MovieShowtimesQueryDto.schema.safeParse(bad).success).toBe(false);
    }
  });
});

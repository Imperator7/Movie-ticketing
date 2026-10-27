import { describe, expect, it } from "vitest";
import { bangkokDateOf, bangkokDayRange } from "./bangkok.js";

describe("bangkokDayRange", () => {
  it("starts at 00:00 Bangkok (17:00 UTC the day before) and ends 24 h later, exclusive", () => {
    const { start, end } = bangkokDayRange("2026-03-15");

    expect(start.toISOString()).toBe("2026-03-14T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-15T17:00:00.000Z");
  });

  it("includes 00:00 Bangkok and 23:59:59.999 Bangkok, excludes the next midnight", () => {
    const { start, end } = bangkokDayRange("2026-03-15");
    const midnight = new Date("2026-03-15T00:00:00+07:00");
    const lastMs = new Date("2026-03-15T23:59:59.999+07:00");
    const nextMidnight = new Date("2026-03-16T00:00:00+07:00");
    const justBefore = new Date("2026-03-14T23:59:59.999+07:00");

    expect(midnight.getTime()).toBe(start.getTime());
    expect(lastMs.getTime()).toBeLessThan(end.getTime());
    expect(lastMs.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(nextMidnight.getTime()).toBe(end.getTime());
    expect(justBefore.getTime()).toBeLessThan(start.getTime());
  });

  it("puts a 23:30 Bangkok show on its own day, not the next UTC day", () => {
    const lateShow = new Date("2026-03-15T23:30:00+07:00"); // 16:30 UTC, same UTC date
    const { start, end } = bangkokDayRange("2026-03-15");

    expect(lateShow >= start && lateShow < end).toBe(true);
  });

  it("puts a 00:30 Bangkok show in the new day even though UTC is still the day before", () => {
    const earlyShow = new Date("2026-03-16T00:30:00+07:00"); // 17:30 UTC on the 15th
    const day15 = bangkokDayRange("2026-03-15");
    const day16 = bangkokDayRange("2026-03-16");

    expect(earlyShow >= day15.start && earlyShow < day15.end).toBe(false);
    expect(earlyShow >= day16.start && earlyShow < day16.end).toBe(true);
  });

  it("makes consecutive days contiguous across month and year ends", () => {
    expect(bangkokDayRange("2026-01-31").end.getTime()).toBe(
      bangkokDayRange("2026-02-01").start.getTime(),
    );
    expect(bangkokDayRange("2026-12-31").end.getTime()).toBe(
      bangkokDayRange("2027-01-01").start.getTime(),
    );
  });

  it("handles leap days", () => {
    expect(bangkokDayRange("2028-02-29").start.toISOString()).toBe("2028-02-28T17:00:00.000Z");
    expect(bangkokDayRange("2028-02-29").end.getTime()).toBe(
      bangkokDayRange("2028-03-01").start.getTime(),
    );
  });

  it.each([
    "",
    "2026-3-5",
    "26-03-05",
    "2026-02-30",
    "2026-13-01",
    "2025-02-29",
    "2026-03-15T00:00:00Z",
    "abcd-ef-gh",
  ])("rejects %j", (value) => {
    expect(() => bangkokDayRange(value)).toThrow(RangeError);
  });
});

describe("bangkokDateOf", () => {
  it("returns the Bangkok calendar day of an instant", () => {
    expect(bangkokDateOf(new Date("2026-03-14T16:59:59.999Z"))).toBe("2026-03-14");
    expect(bangkokDateOf(new Date("2026-03-14T17:00:00.000Z"))).toBe("2026-03-15");
  });

  it("round-trips with bangkokDayRange", () => {
    const { start, end } = bangkokDayRange("2026-07-04");

    expect(bangkokDateOf(start)).toBe("2026-07-04");
    expect(bangkokDateOf(new Date(end.getTime() - 1))).toBe("2026-07-04");
    expect(bangkokDateOf(end)).toBe("2026-07-05");
  });
});

import { describe, expect, it } from "vitest";
import { isDateOnly, resolveShowDate } from "./show-date";

const TODAY = "2026-10-28";

describe("isDateOnly", () => {
  it("accepts real calendar dates only", () => {
    expect(isDateOnly("2026-10-28")).toBe(true);
    for (const bad of [null, undefined, "", "2026-13-40", "28/10/2026", "2026-10-28T10:00", "x"]) {
      expect(isDateOnly(bad)).toBe(false);
    }
  });
});

describe("resolveShowDate", () => {
  it("asks for today when the URL has no date, before availableDates is known", () => {
    expect(resolveShowDate(null, TODAY, undefined)).toEqual({ date: TODAY, jumped: false });
  });

  it("keeps today when it has showtimes", () => {
    expect(resolveShowDate(null, TODAY, ["2026-10-28", "2026-10-29"])).toEqual({
      date: TODAY,
      jumped: false,
    });
  });

  it("jumps to availableDates[0] when today has nothing", () => {
    expect(resolveShowDate(null, TODAY, ["2026-10-30", "2026-10-31"])).toEqual({
      date: "2026-10-30",
      jumped: true,
    });
  });

  it("keeps a chosen day that has showtimes", () => {
    expect(resolveShowDate("2026-10-31", TODAY, ["2026-10-30", "2026-10-31"])).toEqual({
      date: "2026-10-31",
      jumped: false,
    });
  });

  it("jumps from a stale or unavailable day in the URL", () => {
    expect(resolveShowDate("2026-09-01", TODAY, ["2026-10-30"])).toEqual({
      date: "2026-10-30",
      jumped: true,
    });
  });

  it("ignores a malformed URL date and uses today", () => {
    expect(resolveShowDate("nonsense", TODAY, undefined)).toEqual({ date: TODAY, jumped: false });
  });

  it("stays on the requested day when there are no showtimes at all", () => {
    expect(resolveShowDate(null, TODAY, [])).toEqual({ date: TODAY, jumped: false });
    expect(resolveShowDate("2026-11-02", TODAY, [])).toEqual({ date: "2026-11-02", jumped: false });
  });
});

import { describe, expect, it } from "vitest";
import { parseSeatsParam, serializeSeatsParam, showtimePath } from "./seat-params";

describe("parseSeatsParam", () => {
  it("parses a comma separated list", () => {
    expect(parseSeatsParam("A5,A6,B10")).toEqual(["A5", "A6", "B10"]);
  });

  it("normalises case and whitespace, drops duplicates", () => {
    expect(parseSeatsParam(" a5, A5 ,b2")).toEqual(["A5", "B2"]);
  });

  it("drops anything that is not a seat label", () => {
    expect(parseSeatsParam("A5,<script>,5A,,AAA1,A")).toEqual(["A5"]);
  });

  it("keeps at most 4 seats", () => {
    expect(parseSeatsParam("A1,A2,A3,A4,A5,A6")).toEqual(["A1", "A2", "A3", "A4"]);
  });

  it("handles missing values", () => {
    expect(parseSeatsParam(null)).toEqual([]);
    expect(parseSeatsParam(undefined)).toEqual([]);
    expect(parseSeatsParam("")).toEqual([]);
  });
});

describe("serializeSeatsParam / showtimePath", () => {
  it("round-trips", () => {
    expect(parseSeatsParam(serializeSeatsParam(["C3", "C4"]))).toEqual(["C3", "C4"]);
  });

  it("builds the seat selection path, with readable commas", () => {
    expect(showtimePath("abc", ["A5", "A6"])).toBe("/showtime?id=abc&seats=A5,A6");
    expect(showtimePath("abc", [])).toBe("/showtime?id=abc");
  });
});

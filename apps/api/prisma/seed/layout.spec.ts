import { required } from "./required.js";
import { describe, expect, it } from "vitest";
import { CINEMAS } from "./venues.js";
import { buildSeatLayout, rowLabelFor } from "./layout.js";

describe("rowLabelFor", () => {
  it("counts A..Z then AA, AB", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(rowLabelFor)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
    ]);
  });
});

describe("buildSeatLayout", () => {
  const spec = { rows: 10, cols: 16, aisleAfter: [4, 12], premiumRows: 2, inactive: ["A1", "J16"] };

  it("creates rows x cols seats with unique labels", () => {
    const layout = buildSeatLayout(spec);

    expect(layout.seats).toHaveLength(160);
    expect(new Set(layout.seats.map((s) => `${s.rowLabel}${String(s.seatNumber)}`)).size).toBe(160);
    expect(layout.totalRows).toBe(10);
  });

  it("leaves a grid gap after each aisle seat and counts it in totalCols", () => {
    const layout = buildSeatLayout(spec);
    const rowA = layout.seats.filter((s) => s.rowLabel === "A");
    const col = (n: number): number => rowA.find((s) => s.seatNumber === n)?.gridCol ?? -1;

    expect(layout.totalCols).toBe(18);
    expect(col(1)).toBe(0);
    expect(col(4)).toBe(3);
    expect(col(5)).toBe(5); // gap at grid column 4
    expect(col(12)).toBe(12);
    expect(col(13)).toBe(14); // gap at grid column 13
    expect(col(16)).toBe(17);
  });

  it("makes the back 2 rows PREMIUM and the rest STANDARD", () => {
    const layout = buildSeatLayout(spec);
    const premiumRows = new Set(
      layout.seats.filter((s) => s.type === "PREMIUM").map((s) => s.rowLabel),
    );

    expect([...premiumRows].sort()).toEqual(["I", "J"]);
    expect(layout.seats.filter((s) => s.type === "PREMIUM")).toHaveLength(32);
  });

  it("marks only the listed seats inactive", () => {
    const layout = buildSeatLayout(spec);
    const inactive = layout.seats
      .filter((s) => !s.isActive)
      .map((s) => `${s.rowLabel}${String(s.seatNumber)}`);

    expect(inactive.sort()).toEqual(["A1", "J16"]);
  });

  it("ignores aisles outside the row and duplicates", () => {
    const layout = buildSeatLayout({
      rows: 1,
      cols: 5,
      aisleAfter: [0, 2, 2, 5, 9],
      premiumRows: 0,
    });

    expect(layout.totalCols).toBe(6);
  });

  it("rejects impossible specs", () => {
    expect(() => buildSeatLayout({ rows: 0, cols: 5, aisleAfter: [], premiumRows: 0 })).toThrow(
      RangeError,
    );
    expect(() => buildSeatLayout({ rows: 3, cols: 5, aisleAfter: [], premiumRows: 4 })).toThrow(
      RangeError,
    );
  });
});

describe("venue definitions", () => {
  it("has 2 cinemas with 3 halls each: two standard (one smaller) and one IMAX, with the back 2 rows premium", () => {
    expect(CINEMAS).toHaveLength(2);
    for (const cinema of CINEMAS) {
      expect(cinema.halls.map((h) => h.type)).toEqual(["STANDARD", "STANDARD", "IMAX"]);
      const sizes = cinema.halls.map((h) => h.layout.rows * h.layout.cols);
      expect(sizes[1]).toBeLessThan(required(sizes[0], "size"));
      for (const hall of cinema.halls) {
        expect(hall.layout.premiumRows).toBe(2);
        const built = buildSeatLayout(hall.layout);
        // Inactive labels must exist in the layout.
        expect(built.seats.filter((s) => !s.isActive)).toHaveLength(
          hall.layout.inactive?.length ?? 0,
        );
      }
    }
  });
});

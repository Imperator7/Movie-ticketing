import { describe, expect, it } from "vitest";
import { priceShowtime } from "./pricing.js";

describe("priceShowtime", () => {
  it("prices a weekday matinee in a standard hall at 200, premium +60", () => {
    expect(priceShowtime({ hallType: "STANDARD", startMinute: 11 * 60, weekday: 2 })).toEqual({
      STANDARD: 200,
      PREMIUM: 260,
    });
  });

  it("adds 30 for evening shows (from 17:00)", () => {
    expect(
      priceShowtime({ hallType: "STANDARD", startMinute: 16 * 60 + 55, weekday: 2 }).STANDARD,
    ).toBe(200);
    expect(priceShowtime({ hallType: "STANDARD", startMinute: 17 * 60, weekday: 2 }).STANDARD).toBe(
      230,
    );
  });

  it("adds 20 on Saturday and Sunday", () => {
    expect(priceShowtime({ hallType: "STANDARD", startMinute: 12 * 60, weekday: 6 }).STANDARD).toBe(
      220,
    );
    expect(priceShowtime({ hallType: "STANDARD", startMinute: 12 * 60, weekday: 0 }).STANDARD).toBe(
      220,
    );
    expect(priceShowtime({ hallType: "STANDARD", startMinute: 12 * 60, weekday: 5 }).STANDARD).toBe(
      200,
    );
  });

  it("adds 150 in IMAX halls", () => {
    expect(priceShowtime({ hallType: "IMAX", startMinute: 12 * 60, weekday: 3 })).toEqual({
      STANDARD: 350,
      PREMIUM: 410,
    });
  });

  it("keeps standard-hall STANDARD prices within 200-250 and always returns whole positive baht", () => {
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      for (let startMinute = 630; startMinute <= 1410; startMinute += 5) {
        const { STANDARD, PREMIUM } = priceShowtime({ hallType: "STANDARD", startMinute, weekday });
        expect(STANDARD).toBeGreaterThanOrEqual(200);
        expect(STANDARD).toBeLessThanOrEqual(250);
        expect(PREMIUM).toBe(STANDARD + 60);
        expect(Number.isInteger(STANDARD) && Number.isInteger(PREMIUM)).toBe(true);
      }
    }
  });
});

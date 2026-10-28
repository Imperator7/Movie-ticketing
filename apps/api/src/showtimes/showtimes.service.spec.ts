import { describe, expect, it } from "vitest";
import { seatMapSchema, showtimeDetailSchema } from "./showtimes.dto.js";
import { bookingClosesAt, labelOf } from "./showtimes.service.js";

describe("showtimes helpers", () => {
  it("booking closes 30 minutes after the start", () => {
    expect(bookingClosesAt(new Date("2026-11-02T10:00:00Z")).toISOString()).toBe(
      "2026-11-02T10:30:00.000Z",
    );
  });

  it("builds seat labels from row and number", () => {
    expect(labelOf("A", 5)).toBe("A5");
    expect(labelOf("AB", 12)).toBe("AB12");
  });

  it("response schemas accept the documented shapes", () => {
    const uuid = "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10";
    expect(
      seatMapSchema.safeParse({
        showtimeId: uuid,
        totalRows: 1,
        totalCols: 1,
        seats: [
          {
            id: uuid,
            label: "A1",
            row: "A",
            number: 1,
            gridRow: 0,
            gridCol: 0,
            type: "STANDARD",
            status: "HELD",
          },
        ],
        prices: [{ seatType: "STANDARD", priceBaht: 200 }],
        generatedAt: "2026-11-02T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(showtimeDetailSchema.shape.maxSeatsPerBooking.safeParse(5).success).toBe(false);
  });
});

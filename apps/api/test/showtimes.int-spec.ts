import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import { createHall, createMovie, createShowtime, lockSeats } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";

interface SeatBody {
  id: string;
  label: string;
  status: string;
  gridCol: number;
}
interface SeatMapBody {
  showtimeId: string;
  totalRows: number;
  totalCols: number;
  seats: SeatBody[];
  prices: { seatType: string; priceBaht: number }[];
  generatedAt: string;
}

describe("showtimes (real database)", () => {
  let app: NestExpressApplication;
  const get = (path: string): ReturnType<ReturnType<typeof request>["get"]> =>
    request(app.getHttpServer()).get(`/api/v1${path}`);
  const HOUR = 3_600_000;
  const tomorrow = addDays(bangkokDateOf(new Date()), 1);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /showtimes/:id", () => {
    it("returns movie, cinema, hall, prices and the booking window", async () => {
      const movie = await createMovie();
      const hall = await createHall({ number: 4 });
      const startsAt = new Date(bangkokDayRange(tomorrow).start.getTime() + 18 * HOUR);
      const showtime = await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt,
        prices: { STANDARD: 250, PREMIUM: 310 },
      });

      const res = await get(`/showtimes/${showtime.id}`);

      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toMatchObject({
        id: showtime.id,
        movie: { slug: movie.slug, synopsis: { en: "Synopsis" } },
        cinema: { id: hall.cinemaId },
        hall: { id: hall.hallId, number: 4, type: "STANDARD" },
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 2 * HOUR).toISOString(),
        format: "TWO_D",
        audioLanguage: "EN",
        subtitleLanguage: "TH",
        prices: [
          { seatType: "STANDARD", priceBaht: 250 },
          { seatType: "PREMIUM", priceBaht: 310 },
        ],
        bookingClosesAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
        isBookable: true,
        maxSeatsPerBooking: 4,
      });
    });

    it("is not bookable once cancelled or past the cut-off", async () => {
      const movie = await createMovie();
      const hall = await createHall();
      const hall2 = await createHall();
      const cancelled = await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt: new Date(bangkokDayRange(tomorrow).start.getTime() + 12 * HOUR),
        status: "CANCELLED",
      });
      const closed = await createShowtime({
        movieId: movie.id,
        hallId: hall2.hallId,
        startsAt: new Date(Date.now() - 45 * 60_000),
      });

      expect(
        ((await get(`/showtimes/${cancelled.id}`)).body as { isBookable: boolean }).isBookable,
      ).toBe(false);
      expect(
        ((await get(`/showtimes/${closed.id}`)).body as { isBookable: boolean }).isBookable,
      ).toBe(false);
    });

    it.each(["not-a-uuid", "12345", "00000000-0000-0000-0000-000000000000"])(
      "answers 404 NOT_FOUND for %s",
      async (id) => {
        const detail = await get(`/showtimes/${id}`);
        const seats = await get(`/showtimes/${id}/seats`);

        for (const res of [detail, seats]) {
          expect(res.status).toBe(404);
          expect(res.body).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
          expect(res.headers["cache-control"]).toBe("no-store");
        }
      },
    );

    it("answers 404 for a well-formed unknown id", async () => {
      expect((await get(`/showtimes/${randomUUID()}`)).status).toBe(404);
    });
  });

  describe("GET /showtimes/:id/seats", () => {
    it("lists active seats only, with grid positions, prices and statuses from the locks", async () => {
      const movie = await createMovie();
      const hall = await createHall({ seats: 10, inactive: true }); // the 10th seat is out of service
      const showtime = await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt: new Date(bangkokDayRange(tomorrow).start.getTime() + 15 * HOUR),
      });
      const [s0, s1, s2, s3, s4] = hall.seatIds as [string, string, string, string, string];
      await lockSeats({ showtimeId: showtime.id, seatIds: [s0], state: "CONFIRMED" });
      await lockSeats({ showtimeId: showtime.id, seatIds: [s1], state: "PENDING_IN_HOLD" });
      await lockSeats({ showtimeId: showtime.id, seatIds: [s2], state: "PENDING_HOLD_OVER" });
      await lockSeats({
        showtimeId: showtime.id,
        seatIds: [s3],
        state: "CONFIRMED",
        released: true,
      });

      const res = await get(`/showtimes/${showtime.id}/seats`);
      const body = res.body as SeatMapBody;
      const status = (id: string): string | undefined =>
        body.seats.find((s) => s.id === id)?.status;

      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(body).toMatchObject({ showtimeId: showtime.id, totalRows: 1, totalCols: 10 });
      expect(body.seats).toHaveLength(9);
      expect(body.seats.map((s) => s.label)).toEqual([
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "A9",
      ]);
      expect(body.seats.map((s) => s.gridCol)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(status(s0)).toBe("BOOKED");
      expect(status(s1)).toBe("HELD");
      expect(status(s2)).toBe("AVAILABLE"); // hold is over: free even though the expiry job has not run
      expect(status(s3)).toBe("AVAILABLE"); // released lock = history only
      expect(status(s4)).toBe("AVAILABLE");
      expect(body.prices).toEqual([
        { seatType: "STANDARD", priceBaht: 220 },
        { seatType: "PREMIUM", priceBaht: 280 },
      ]);
      expect(Date.now() - new Date(body.generatedAt).getTime()).toBeLessThan(10_000);
    });

    it("reflects a new lock immediately on the next request", async () => {
      const movie = await createMovie();
      const hall = await createHall({ seats: 3 });
      const showtime = await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt: new Date(bangkokDayRange(tomorrow).start.getTime() + 20 * HOUR),
      });
      const first = (await get(`/showtimes/${showtime.id}/seats`)).body as SeatMapBody;
      expect(first.seats.every((seat) => seat.status === "AVAILABLE")).toBe(true);

      await lockSeats({
        showtimeId: showtime.id,
        seatIds: hall.seatIds.slice(1, 2),
        state: "PENDING_IN_HOLD",
      });

      const second = (await get(`/showtimes/${showtime.id}/seats`)).body as SeatMapBody;
      expect(second.seats.map((seat) => seat.status)).toEqual(["AVAILABLE", "HELD", "AVAILABLE"]);
    });
  });

  describe("catalog hardening", () => {
    it("answers 404 for a malformed slug without touching the database", async () => {
      for (const slug of ["Has%20Capitals", "under_score", "x".repeat(121), "dots.not.allowed"]) {
        const movie = await get(`/movies/${slug}`);
        const showtimes = await get(`/movies/${slug}/showtimes?date=${tomorrow}`);
        expect(movie.status).toBe(404);
        expect(showtimes.status).toBe(404);
      }
    });

    it("rejects a date outside yesterday .. today+31 with 422 VALIDATION_FAILED", async () => {
      const movie = await createMovie();
      const today = bangkokDateOf(new Date());
      const ok = [addDays(today, -1), today, addDays(today, 31)];
      const bad = [addDays(today, -2), addDays(today, 32), "1999-01-01", "2999-12-31"];

      for (const date of ok) {
        expect((await get(`/movies/${movie.slug}/showtimes?date=${date}`)).status).toBe(200);
      }
      for (const date of bad) {
        const res = await get(`/movies/${movie.slug}/showtimes?date=${date}`);
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({
          code: "VALIDATION_FAILED",
          details: { fields: { date: ["out_of_range"] } },
        });
        expect(res.headers["cache-control"]).toBe("no-store");
      }
    });
  });
});

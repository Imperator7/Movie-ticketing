import { describe, expect, it } from "vitest";
import { AppException } from "../common/errors/app.exception.js";
import { CreateBookingDto, ListMyBookingsQueryDto } from "./booking.dto.js";
import { parseIdempotencyKey } from "./booking.controller.js";
import { toBookingBody, type BookingRow } from "./booking.mapper.js";
import { BOOKING_CONFIG } from "./booking.config.js";
import { generateBookingCode, hashCreateBookingRequest, signTicket } from "./booking-support.js";
import { NoopPaymentGateway } from "./payment-gateway.js";

const uuid = (n: number): string =>
  `6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a${String(n).padStart(2, "0")}`;

describe("booking code", () => {
  it("looks like MT-XXXXXX from an unambiguous alphabet and varies", () => {
    const codes = new Set(Array.from({ length: 200 }, generateBookingCode));
    for (const code of codes) expect(code).toMatch(/^MT-[A-HJKMNP-Z2-9]{6}$/);
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe("signTicket", () => {
  it("is <code>.<hmac>, deterministic per secret and different across secrets", () => {
    const a = signTicket("MT-ABC234", "secret-one");

    expect(a).toMatch(/^MT-ABC234\.[A-Za-z0-9_-]{43}$/);
    expect(signTicket("MT-ABC234", "secret-one")).toBe(a);
    expect(signTicket("MT-ABC234", "secret-two")).not.toBe(a);
    expect(signTicket("MT-ABC235", "secret-one")).not.toBe(a);
  });
});

describe("hashCreateBookingRequest", () => {
  const showtimeId = uuid(1);

  it("ignores seat order but not content", () => {
    const base = hashCreateBookingRequest({ showtimeId, seatIds: [uuid(2), uuid(3)] });

    expect(hashCreateBookingRequest({ showtimeId, seatIds: [uuid(3), uuid(2)] })).toBe(base);
    expect(hashCreateBookingRequest({ showtimeId, seatIds: [uuid(2)] })).not.toBe(base);
    expect(hashCreateBookingRequest({ showtimeId: uuid(9), seatIds: [uuid(2), uuid(3)] })).not.toBe(
      base,
    );
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseIdempotencyKey", () => {
  it("accepts a UUID", () => {
    expect(parseIdempotencyKey(` ${uuid(5)} `)).toBe(uuid(5));
  });

  it("maps a missing header to IDEMPOTENCY_KEY_MISSING (422) and a bad one to VALIDATION_FAILED (422)", () => {
    for (const [value, code] of [
      [undefined, "IDEMPOTENCY_KEY_MISSING"],
      ["", "IDEMPOTENCY_KEY_MISSING"],
      ["abc", "VALIDATION_FAILED"],
    ] as const) {
      try {
        parseIdempotencyKey(value);
        expect.unreachable("should throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(422);
        expect(error).toMatchObject({ code });
      }
    }
  });
});

describe("request DTOs", () => {
  it("createBooking: 1+ unique uuid seats, strict keys; the 4-seat limit is a service rule (TOO_MANY_SEATS)", () => {
    const ok = (seatIds: string[]): boolean =>
      CreateBookingDto.schema.safeParse({ showtimeId: uuid(1), seatIds }).success;

    expect(ok([uuid(2)])).toBe(true);
    expect(ok([uuid(2), uuid(3), uuid(4), uuid(5), uuid(6)])).toBe(true);
    expect(ok([])).toBe(false);
    expect(ok([uuid(2), uuid(2)])).toBe(false);
    expect(ok(["A5"])).toBe(false);
    expect(
      CreateBookingDto.schema.safeParse({ showtimeId: uuid(1), seatIds: [uuid(2)], price: 1 })
        .success,
    ).toBe(false);
    expect(BOOKING_CONFIG.MAX_SEATS).toBe(4);
  });

  it("listMyBookings: scope defaults to upcoming, paging like listMovies", () => {
    expect(ListMyBookingsQueryDto.schema.parse({})).toEqual({
      scope: "upcoming",
      page: 1,
      pageSize: 20,
    });
    expect(ListMyBookingsQueryDto.schema.safeParse({ scope: "future" }).success).toBe(false);
    expect(ListMyBookingsQueryDto.schema.safeParse({ pageSize: "51" }).success).toBe(false);
  });
});

describe("toBookingBody", () => {
  const row = {
    id: uuid(1),
    bookingCode: "MT-ABC234",
    status: "PENDING_PAYMENT",
    cancelReason: null,
    totalBaht: 500,
    paymentExpiresAt: new Date("2026-11-02T10:05:00Z"),
    holdExpiresAt: new Date("2026-11-02T10:06:00Z"),
    confirmedAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-11-02T10:00:00Z"),
    showtime: {
      id: uuid(2),
      startsAt: new Date("2026-11-03T08:00:00Z"),
      format: "TWO_D",
      hall: {
        number: 3,
        cinema: {
          id: uuid(3),
          nameTh: "ก",
          nameEn: "A",
          addressTh: "ที่อยู่",
          addressEn: "Addr",
          city: "Bangkok",
        },
      },
      movie: {
        slug: "m",
        titleTh: "ม",
        titleEn: "M",
        posterUrl: null,
        rating: "AGE_13",
        durationMin: 100,
      },
    },
    seats: [
      { priceBaht: 220, seat: { id: uuid(4), rowLabel: "A", seatNumber: 1, type: "STANDARD" } },
      { priceBaht: 280, seat: { id: uuid(5), rowLabel: "A", seatNumber: 2, type: "PREMIUM" } },
    ],
    payments: [],
  } as unknown as BookingRow;

  it("maps the contract shape: ISO dates, labels, whole-baht prices, THB, no ticket while pending", () => {
    const body = toBookingBody(row, "secret");

    expect(body).toMatchObject({
      id: uuid(1),
      bookingCode: "MT-ABC234",
      status: "PENDING_PAYMENT",
      currency: "THB",
      totalBaht: 500,
      paymentExpiresAt: "2026-11-02T10:05:00.000Z",
      holdExpiresAt: "2026-11-02T10:06:00.000Z",
      latestPayment: null,
      ticketQr: null,
      showtime: { hallNumber: 3, movie: { title: { th: "ม", en: "M" }, posterUrl: null } },
    });
    expect(body.seats.map((s) => [s.label, s.priceBaht])).toEqual([
      ["A1", 220],
      ["A2", 280],
    ]);
  });

  it("signs the ticket only once CONFIRMED", () => {
    const body = toBookingBody({ ...row, status: "CONFIRMED", confirmedAt: new Date() }, "secret");

    expect(body.ticketQr).toBe(signTicket("MT-ABC234", "secret"));
  });
});

describe("NoopPaymentGateway", () => {
  it("has nothing to cancel", async () => {
    expect(await new NoopPaymentGateway().cancelPaymentIntent(uuid(1))).toBe("nothing_to_cancel");
  });
});

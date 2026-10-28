import { describe, expect, it } from "vitest";
import type { Booking, SeatMap } from "@/api/generated/model";
import {
  cinemas,
  movies,
  nowShowing,
  bangkokDayIndex,
  seatLayout,
  seededStatus,
  showtimesOnDay,
} from "./catalog";
import { createDb, DEMO_EMAIL, DEMO_PASSWORD, type MockDb, type MockUser } from "./db";
import * as service from "./service";

// 09:00 in Bangkok on a fixed day, so every showtime of that day is still ahead.
const T0 = Date.UTC(2026, 9, 28, 2, 0, 0);
const showtime = showtimesOnDay(bangkokDayIndex(T0))[0];
if (!showtime) throw new Error("no showtime in the schedule");

const freeSeatIds = (count: number, skip = 0): string[] =>
  seatLayout(showtime)
    .filter((s) => seededStatus(s.id) === "AVAILABLE")
    .slice(skip, skip + count)
    .map((s) => s.id);

function setup() {
  const db = createDb();
  const [demo] = db.users;
  if (!demo) throw new Error("no demo user");
  const other = service.register(
    db,
    { email: "other@example.com", password: "other-password-1", displayName: "Other" },
    T0,
  );
  expect(other.status).toBe(201);
  const otherUser = db.users[1];
  if (!otherUser) throw new Error("no second user");
  return { db, demo, otherUser };
}

const book = (db: MockDb, user: MockUser, seatIds: string[], key = crypto.randomUUID(), now = T0) =>
  service.createBooking(db, user, key, { showtimeId: showtime.id, seatIds }, now);

const bookingOf = (result: service.MockResult) => result.body as Booking;
const errorOf = (result: service.MockResult) =>
  result.body as { code: string; details?: Record<string, unknown> };

const statusOf = (db: MockDb, seatId: string, now: number) => {
  const body = service.getSeatMap(db, showtime.id, now).body as SeatMap;
  return body.seats.find((s) => s.id === seatId)?.status;
};

describe("mock server: auth", () => {
  it("logs the demo user in and authenticates the access token", () => {
    const db = createDb();
    const res = service.login(db, { email: DEMO_EMAIL, password: DEMO_PASSWORD }, T0);
    const { accessToken } = res.body as { accessToken: string };
    expect(res.status).toBe(200);
    expect(service.authenticate(db, `Bearer ${accessToken}`, T0 + 1000)?.email).toBe(DEMO_EMAIL);
    expect(service.authenticate(db, `Bearer ${accessToken}`, T0 + 16 * 60_000)).toBeNull();
    expect(service.authenticate(db, null, T0)).toBeNull();
  });

  it("rejects bad credentials and duplicate emails", () => {
    const db = createDb();
    expect(service.login(db, { email: DEMO_EMAIL, password: "nope" }, T0).status).toBe(401);
    const dup = service.register(
      db,
      { email: DEMO_EMAIL, password: "whatever-123", displayName: "x" },
      T0,
    );
    expect(dup.status).toBe(409);
    expect(errorOf(dup).code).toBe("EMAIL_ALREADY_USED");
  });

  it("refresh works only while the cookie exists", () => {
    const db = createDb();
    expect(service.refresh(db, T0).status).toBe(401);
    service.login(db, { email: DEMO_EMAIL, password: DEMO_PASSWORD }, T0);
    expect(service.refresh(db, T0).status).toBe(200);
    service.logout(db);
    expect(service.refresh(db, T0).status).toBe(401);
  });
});

describe("mock server: booking rules", () => {
  it("creates a PENDING_PAYMENT booking with a 5 min window, 6 min hold and server-side total", () => {
    const { db, demo } = setup();
    const ids = freeSeatIds(2);
    const res = book(db, demo, ids);
    const booking = bookingOf(res);
    expect(res.status).toBe(201);
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(Date.parse(booking.paymentExpiresAt) - T0).toBe(5 * 60_000);
    expect(Date.parse(booking.holdExpiresAt) - T0).toBe(6 * 60_000);
    expect(booking.totalBaht).toBe(booking.seats.reduce((s, x) => s + x.priceBaht, 0));
    expect(booking.currency).toBe("THB");
    expect(booking.ticketQr).toBeNull();
    expect(statusOf(db, ids[0] ?? "", T0)).toBe("HELD");
  });

  it("rejects more than 4 seats with TOO_MANY_SEATS", () => {
    const { db, demo } = setup();
    const res = book(db, demo, freeSeatIds(5));
    expect(res.status).toBe(422);
    expect(errorOf(res).code).toBe("TOO_MANY_SEATS");
  });

  it("rejects a missing Idempotency-Key and a malformed body", () => {
    const { db, demo } = setup();
    expect(errorOf(service.createBooking(db, demo, null, {}, T0)).code).toBe(
      "IDEMPOTENCY_KEY_MISSING",
    );
    const bad = service.createBooking(
      db,
      demo,
      crypto.randomUUID(),
      { showtimeId: "x", seatIds: [] },
      T0,
    );
    expect(errorOf(bad).code).toBe("VALIDATION_FAILED");
    expect(errorOf(bad).details).toHaveProperty("fields");
    const extra = service.createBooking(
      db,
      demo,
      crypto.randomUUID(),
      { showtimeId: showtime.id, seatIds: freeSeatIds(1), hacker: true },
      T0,
    );
    expect(errorOf(extra).details).toEqual({ fields: { hacker: ["unrecognized_key"] } });
  });

  it("allows one active booking: the second gets ACTIVE_BOOKING_EXISTS with its id", () => {
    const { db, demo } = setup();
    const first = bookingOf(book(db, demo, freeSeatIds(1)));
    const second = book(db, demo, freeSeatIds(1, 5));
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe("ACTIVE_BOOKING_EXISTS");
    expect(errorOf(second).details).toEqual({ bookingId: first.id });
  });

  it("returns SEAT_TAKEN with details.seatIds when another user holds a seat", () => {
    const { db, demo, otherUser } = setup();
    const [a, b, c] = freeSeatIds(3);
    book(db, otherUser, [a ?? ""]);
    const res = book(db, demo, [a ?? "", b ?? "", c ?? ""]);
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe("SEAT_TAKEN");
    expect(errorOf(res).details).toEqual({ seatIds: [a] });
  });

  it("replays the stored response for the same Idempotency-Key and body", () => {
    const { db, demo } = setup();
    const ids = freeSeatIds(2);
    const key = crypto.randomUUID();
    const first = book(db, demo, ids, key);
    const replay = book(db, demo, ids, key);
    expect(replay.status).toBe(201);
    expect(replay.headers?.["Idempotent-Replayed"]).toBe("true");
    expect(bookingOf(replay).id).toBe(bookingOf(first).id);
    expect(db.bookings).toHaveLength(1);
  });

  it("rejects the same key with a different body (IDEMPOTENCY_KEY_REUSED)", () => {
    const { db, demo } = setup();
    const key = crypto.randomUUID();
    book(db, demo, freeSeatIds(1), key);
    const res = book(db, demo, freeSeatIds(1, 3), key);
    expect(res.status).toBe(422);
    expect(errorOf(res).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("closes booking 30 minutes after the start", () => {
    const { db, demo } = setup();
    const late = showtime.startMs + 31 * 60_000;
    const res = book(db, demo, freeSeatIds(1), crypto.randomUUID(), late);
    expect(errorOf(res).code).toBe("BOOKING_CLOSED");
  });

  it("does not show another user's booking (404)", () => {
    const { db, demo, otherUser } = setup();
    const mine = bookingOf(book(db, demo, freeSeatIds(1)));
    expect(service.getBooking(db, otherUser, mine.id).status).toBe(404);
    expect(service.getBooking(db, demo, mine.id).status).toBe(200);
  });
});

describe("mock server: expiry, cancel and payment", () => {
  it("cancels with PAYMENT_TIMEOUT after the window, frees the seats and allows a new booking", () => {
    const { db, demo } = setup();
    const ids = freeSeatIds(2);
    const booking = bookingOf(book(db, demo, ids));
    const later = T0 + 5 * 60_000;
    service.sweep(db, later);
    const after = bookingOf(service.getBooking(db, demo, booking.id));
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toBe("PAYMENT_TIMEOUT");
    expect(statusOf(db, ids[0] ?? "", later)).toBe("AVAILABLE");
    expect(service.getActiveBooking(db, demo).status).toBe(204);
    expect(book(db, demo, ids, crypto.randomUUID(), later).status).toBe(201);
  });

  it("cancels a pending booking and refuses to cancel twice", () => {
    const { db, demo } = setup();
    const ids = freeSeatIds(1);
    const booking = bookingOf(book(db, demo, ids));
    const res = service.cancelBooking(db, demo, booking.id, T0 + 1000);
    expect(bookingOf(res).cancelReason).toBe("USER_CANCELLED");
    expect(statusOf(db, ids[0] ?? "", T0 + 1000)).toBe("AVAILABLE");
    const again = service.cancelBooking(db, demo, booking.id, T0 + 2000);
    expect(errorOf(again).code).toBe("BOOKING_NOT_PENDING");
  });

  it("confirms after a successful payment: BOOKED seats, ticketQr, no cancel afterwards", () => {
    const { db, demo } = setup();
    const ids = freeSeatIds(1);
    const booking = bookingOf(book(db, demo, ids));
    const pay = service.demoPay(db, demo, { bookingId: booking.id, method: "CARD" }, T0 + 1000);
    expect(pay.body).toEqual({ result: "processing" });
    service.sweep(db, T0 + 1000 + 500);
    expect(bookingOf(service.getBooking(db, demo, booking.id)).status).toBe("PENDING_PAYMENT");
    expect(errorOf(service.cancelBooking(db, demo, booking.id, T0 + 1600)).code).toBe(
      "PAYMENT_IN_PROGRESS",
    );
    const settled = T0 + 1000 + service.SETTLE_DELAY_MS;
    service.sweep(db, settled);
    const confirmed = bookingOf(service.getBooking(db, demo, booking.id));
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.ticketQr).toMatch(/^MT-/);
    expect(confirmed.latestPayment?.status).toBe("SUCCEEDED");
    expect(statusOf(db, ids[0] ?? "", settled)).toBe("BOOKED");
    expect(errorOf(service.cancelBooking(db, demo, booking.id, settled)).code).toBe(
      "BOOKING_NOT_PENDING",
    );
  });

  it("keeps the booking pending on a declined payment", () => {
    const { db, demo } = setup();
    service.setOutcome(db, "decline");
    const booking = bookingOf(book(db, demo, freeSeatIds(1)));
    const pay = service.demoPay(db, demo, { bookingId: booking.id, method: "CARD" }, T0 + 1000);
    expect(pay.body).toEqual({ result: "declined" });
    expect(bookingOf(service.getBooking(db, demo, booking.id)).status).toBe("PENDING_PAYMENT");
  });

  it("refunds a late payment: CANCELLED (LATE_PAYMENT_REFUNDED)", () => {
    const { db, demo } = setup();
    service.setOutcome(db, "late");
    const booking = bookingOf(book(db, demo, freeSeatIds(1)));
    service.demoPay(db, demo, { bookingId: booking.id, method: "PROMPTPAY" }, T0 + 1000);
    service.sweep(db, T0 + 1000 + service.SETTLE_DELAY_MS);
    const after = bookingOf(service.getBooking(db, demo, booking.id));
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toBe("LATE_PAYMENT_REFUNDED");
    expect(after.latestPayment?.status).toBe("REFUNDED");
  });

  it("refuses payment once the window has closed", () => {
    const { db, demo } = setup();
    const booking = bookingOf(book(db, demo, freeSeatIds(1)));
    const res = service.createPaymentIntent(db, demo, booking.id, T0 + 5 * 60_000);
    expect(errorOf(res).code).toBe("PAYMENT_WINDOW_CLOSED");
  });

  it("fastForwardPayment moves the deadline of the active booking", () => {
    const { db, demo } = setup();
    expect(service.fastForwardPayment(db, demo.id, T0, 10_000)).toBe(false);
    const booking = bookingOf(book(db, demo, freeSeatIds(1)));
    expect(service.fastForwardPayment(db, demo.id, T0 + 1000, 10_000)).toBe(true);
    const after = bookingOf(service.getBooking(db, demo, booking.id));
    expect(Date.parse(after.paymentExpiresAt)).toBe(T0 + 11_000);
  });

  it("lists confirmed bookings under upcoming and past", () => {
    const { db, demo } = setup();
    const booking = bookingOf(book(db, demo, freeSeatIds(1)));
    service.demoPay(db, demo, { bookingId: booking.id, method: "CARD" }, T0 + 1000);
    service.sweep(db, T0 + 10_000);
    const upcoming = service.listMyBookings(db, demo, "upcoming", 1, 20, T0 + 10_000).body as {
      total: number;
    };
    const past = service.listMyBookings(db, demo, "past", 1, 20, T0 + 10_000).body as {
      total: number;
    };
    expect(upcoming.total).toBe(1);
    expect(past.total).toBe(0);
    const later = showtime.endMs + 1;
    expect(
      (service.listMyBookings(db, demo, "past", 1, 20, later).body as { total: number }).total,
    ).toBe(1);
  });

  it("showtimes are bookable for the next 7 days and have seat maps with an aisle", () => {
    const { db } = setup();
    const res = service.getMovieShowtimes(db, nowShowing[0]?.slug ?? "", "2026-10-28", null, T0);
    const body = res.body as { availableDates: string[] };
    expect(body.availableDates.length).toBeGreaterThan(3);
    const map = service.getSeatMap(db, showtime.id, T0).body as SeatMap;
    const rowA = map.seats.filter((s) => s.row === "A").map((s) => s.gridCol);
    expect(Math.min(...rowA)).toBe(0);
    expect(new Set(rowA).size).toBe(rowA.length);
    expect(rowA).not.toContain(showtime.hallDef.aisleAfter);
  });

  it("covers today to +30 days in availableDates", () => {
    const { db } = setup();
    const movie = nowShowing[0];
    const body = service.getMovieShowtimes(db, movie?.slug ?? "", "2026-10-28", null, T0).body as {
      availableDates: string[];
    };
    expect(body.availableDates.length).toBeLessThanOrEqual(31);
    expect(body.availableDates.every((d) => d >= "2026-10-28" && d <= "2026-11-27")).toBe(true);
    expect(body.availableDates).toEqual([...body.availableDates].sort());
  });

  it("cinemaId also narrows availableDates to days that cinema shows the movie", () => {
    const { db } = setup();
    const movie = nowShowing[0];
    const all = service.getMovieShowtimes(db, movie?.slug ?? "", "2026-10-28", null, T0).body as {
      availableDates: string[];
    };
    const only = cinemas[1];
    const narrowed = service.getMovieShowtimes(
      db,
      movie?.slug ?? "",
      "2026-10-28",
      only?.id ?? null,
      T0,
    ).body as { availableDates: string[]; cinemas: { cinema: { id: string } }[] };
    expect(narrowed.availableDates.length).toBeLessThanOrEqual(all.availableDates.length);
    expect(narrowed.cinemas.every((c) => c.cinema.id === only?.id)).toBe(true);
    for (const d of narrowed.availableDates) expect(all.availableDates).toContain(d);
  });

  it("a coming-soon movie has showtimes from its release day on, none before", () => {
    const { db } = setup();
    const soon = movies.find((m) => m.status === "COMING_SOON");
    expect(soon).toBeDefined();
    const body = service.getMovieShowtimes(db, soon?.slug ?? "", "2026-10-28", null, T0).body as {
      availableDates: string[];
      cinemas: unknown[];
    };
    expect(body.cinemas).toEqual([]); // nothing on a day before release
    for (const d of body.availableDates) expect(d >= (soon?.releaseDate ?? "")).toBe(true);
  });
});

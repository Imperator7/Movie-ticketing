import { CreateBookingBody } from "@/api/generated/zod/bookings/bookings.zod";
import type {
  AuthResponse,
  Booking,
  BookingStatus,
  CancelReason,
  ErrorCode as ErrorCodeType,
  MovieShowtimes,
  SeatMap,
  SeatStatus,
  ShowtimeDetail,
  User,
} from "@/api/generated/model";
import {
  bangkokDayIndex,
  cinemas,
  dayIndexToDate,
  dateToDayIndex,
  getShowtime,
  isBookable,
  movies,
  pricesOf,
  SCHEDULE_DAYS,
  seatLayout,
  seededStatus,
  showtimeIdOfSeat,
  showtimesOnDay,
  type ShowtimeInfo,
} from "./catalog";
import type { MockBooking, MockDb, MockUser, PayOutcome } from "./db";

/** Contract rules of the API (docs/openapi.yaml, docs/database-design.md) as pure functions over a MockDb. */

export const PAYMENT_WINDOW_MS = 5 * 60_000;
export const HOLD_MS = 6 * 60_000;
export const ACCESS_TOKEN_MS = 15 * 60_000;
export const MAX_SEATS = 4;

export interface MockResult {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export function fail(
  status: number,
  code: ErrorCodeType,
  message: string,
  details?: Record<string, unknown>,
): MockResult {
  return { status, body: { statusCode: status, code, message, ...(details && { details }) } };
}

const ok = (body: unknown, status = 200, headers?: Record<string, string>): MockResult => ({
  status,
  body,
  headers,
});

// ---------------------------------------------------------------- validation

/** Maps a Zod error onto the contract's `details.fields` shape: `{ "<path>": ["<zod issue code>"] }`. */
export function validationFailed(
  issues: readonly { path: PropertyKey[]; code: string }[],
): MockResult {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_root";
    (fields[key] ??= []).push(issue.code);
  }
  return fail(422, "VALIDATION_FAILED", "Validation failed", { fields });
}

/** Strict DTOs: unknown keys are reported under their own name as `unrecognized_key`. */
export function unknownKeyIssues(
  body: unknown,
  allowed: readonly string[],
): { path: PropertyKey[]; code: string }[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return [];
  return Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ path: [key], code: "unrecognized_key" }));
}

// ---------------------------------------------------------------- time-driven state

/**
 * Applies everything that happens "by itself": settles in-flight payments and cancels bookings whose
 * payment window ended (PAYMENT_TIMEOUT). Called at the start of every request.
 */
export function sweep(db: MockDb, now: number): void {
  const due = db.settlements.filter((s) => s.at <= now);
  db.settlements = db.settlements.filter((s) => s.at > now);
  for (const settlement of due) {
    const booking = db.bookings.find((b) => b.id === settlement.bookingId);
    if (booking?.status !== "PENDING_PAYMENT") continue;
    if (settlement.result === "confirm") {
      booking.status = "CONFIRMED";
      booking.confirmedAt = now;
      booking.payment = {
        method: settlement.method,
        status: "SUCCEEDED",
        cardBrand: settlement.method === "CARD" ? "mastercard" : null,
        cardLast4: settlement.method === "CARD" ? "4444" : null,
        paidAt: new Date(now).toISOString(),
      };
    } else {
      // The payment arrived after the booking could no longer be honoured: refund it.
      booking.status = "CANCELLED";
      booking.cancelReason = "LATE_PAYMENT_REFUNDED";
      booking.cancelledAt = now;
      booking.payment = {
        method: settlement.method,
        status: "REFUNDED",
        cardBrand: settlement.method === "CARD" ? "mastercard" : null,
        cardLast4: settlement.method === "CARD" ? "4444" : null,
        paidAt: new Date(now).toISOString(),
      };
    }
  }
  for (const booking of db.bookings) {
    const inFlight = db.settlements.some((s) => s.bookingId === booking.id);
    if (booking.status === "PENDING_PAYMENT" && now >= booking.paymentExpiresAt && !inFlight) {
      booking.status = "CANCELLED";
      booking.cancelReason = "PAYMENT_TIMEOUT";
      booking.cancelledAt = now;
    }
  }
}

// ---------------------------------------------------------------- auth

export function accessTokenFor(user: MockUser, now: number): string {
  return `mock-at.${user.id}.${(now + ACCESS_TOKEN_MS).toString()}`;
}

export function authenticate(
  db: MockDb,
  authorization: string | null,
  now: number,
): MockUser | null {
  const match = /^Bearer mock-at\.([^.]+)\.(\d+)$/.exec(authorization ?? "");
  if (!match) return null;
  if (now >= Number(match[2])) return null;
  return db.users.find((u) => u.id === match[1]) ?? null;
}

export function toUser(user: MockUser): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: null,
    phone: user.phone,
    preferredLocale: user.preferredLocale,
    loginMethods: ["PASSWORD"],
  };
}

function session(db: MockDb, user: MockUser, now: number, status = 200): MockResult {
  db.refreshUserId = user.id;
  const body: AuthResponse = {
    accessToken: accessTokenFor(user, now),
    expiresIn: ACCESS_TOKEN_MS / 1000,
    user: toUser(user),
  };
  return ok(body, status);
}

export function login(db: MockDb, input: { email: string; password: string }, now: number) {
  const user = db.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
  if (user?.password !== input.password) {
    return fail(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  return session(db, user, now);
}

export function register(
  db: MockDb,
  input: {
    email: string;
    password: string;
    displayName: string;
    phone?: string;
    preferredLocale?: "th" | "en";
  },
  now: number,
) {
  if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    return fail(409, "EMAIL_ALREADY_USED", "Email already registered");
  }
  const user: MockUser = {
    id: `u0000000-0000-4000-8000-${(db.users.length + 1).toString().padStart(12, "0")}`,
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    phone: input.phone ?? null,
    preferredLocale: input.preferredLocale ?? "th",
  };
  db.users.push(user);
  return session(db, user, now, 201);
}

export function refresh(db: MockDb, now: number): MockResult {
  const user = db.users.find((u) => u.id === db.refreshUserId);
  if (!user) return fail(401, "REFRESH_TOKEN_INVALID", "Refresh token is missing or invalid");
  return session(db, user, now);
}

export function logout(db: MockDb): MockResult {
  db.refreshUserId = null;
  return { status: 204 };
}

// ---------------------------------------------------------------- seats

/** HELD / BOOKED / AVAILABLE for every seat of a showtime, computed from the db at request time. */
export function seatStatuses(db: MockDb, showtime: ShowtimeInfo, now: number) {
  const status = new Map<string, SeatStatus>();
  for (const seat of seatLayout(showtime)) status.set(seat.id, seededStatus(seat.id));
  for (const id of db.externalSeatIds) if (status.has(id)) status.set(id, "BOOKED");
  for (const booking of db.bookings) {
    if (booking.showtimeId !== showtime.id) continue;
    const held = booking.status === "PENDING_PAYMENT" && now < booking.holdExpiresAt;
    const next: SeatStatus | null =
      booking.status === "CONFIRMED" ? "BOOKED" : held ? "HELD" : null;
    if (next) for (const id of booking.seatIds) status.set(id, next);
  }
  return status;
}

export function getSeatMap(db: MockDb, showtimeId: string, now: number): MockResult {
  const showtime = getShowtime(showtimeId);
  if (!showtime) return fail(404, "SHOWTIME_NOT_FOUND", "Showtime not found");
  const statuses = seatStatuses(db, showtime, now);
  const layout = seatLayout(showtime);
  const body: SeatMap = {
    showtimeId,
    totalRows: showtime.hallDef.rows,
    totalCols: showtime.hallDef.cols + 1,
    seats: layout.map(({ priceBaht: _price, ...seat }) => ({
      ...seat,
      status: statuses.get(seat.id) ?? "AVAILABLE",
    })),
    prices: pricesOf(showtime.hallDef),
    generatedAt: new Date(now).toISOString(),
  };
  return ok(body);
}

// ---------------------------------------------------------------- catalog

function seatsLeft(db: MockDb, showtime: ShowtimeInfo, now: number): number {
  return [...seatStatuses(db, showtime, now).values()].filter((s) => s === "AVAILABLE").length;
}

export function getShowtimeDetail(showtimeId: string, now: number): MockResult {
  const showtime = getShowtime(showtimeId);
  const movie = showtime ? movies[showtime.movie] : undefined;
  const cinema = showtime ? cinemas[showtime.hallDef.cinemaIndex] : undefined;
  if (!showtime || !movie || !cinema) return fail(404, "SHOWTIME_NOT_FOUND", "Showtime not found");
  const body: ShowtimeDetail = {
    id: showtime.id,
    movie,
    cinema,
    hall: { id: showtime.hallDef.id, number: showtime.hallDef.number, type: showtime.hallDef.type },
    startsAt: showtime.startsAt,
    endsAt: new Date(showtime.endMs).toISOString(),
    format: showtime.format,
    audioLanguage: movie.originalLanguage.toUpperCase(),
    subtitleLanguage: movie.originalLanguage === "th" ? null : "TH",
    prices: pricesOf(showtime.hallDef),
    bookingClosesAt: new Date(showtime.startMs + 30 * 60_000).toISOString(),
    isBookable: isBookable(showtime, now),
    maxSeatsPerBooking: 4,
  };
  return ok(body);
}

export function getMovieShowtimes(
  db: MockDb,
  slug: string,
  date: string,
  cinemaId: string | null,
  now: number,
): MockResult {
  const movieIndex = movies.findIndex((m) => m.slug === slug);
  const movie = movies[movieIndex];
  if (!movie) return fail(404, "NOT_FOUND", "Movie not found");
  const today = bangkokDayIndex(now);
  const availableDates: string[] = [];
  for (let d = today; d < today + SCHEDULE_DAYS; d++) {
    const shown = showtimesOnDay(d, movieIndex).some(
      (s) => isBookable(s, now) && (!cinemaId || cinemas[s.hallDef.cinemaIndex]?.id === cinemaId),
    );
    // `cinemaId` also narrows `availableDates` to days this cinema shows the movie.
    if (shown) {
      availableDates.push(dayIndexToDate(d));
    }
  }
  const bookable = showtimesOnDay(dateToDayIndex(date), movieIndex).filter((s) =>
    isBookable(s, now),
  );
  const body: MovieShowtimes = {
    movieId: movie.id,
    date,
    availableDates,
    cinemas: cinemas.flatMap((cinema, cinemaIndex) => {
      if (cinemaId && cinema.id !== cinemaId) return [];
      const slots = bookable.filter((s) => s.hallDef.cinemaIndex === cinemaIndex);
      if (slots.length === 0) return [];
      return [
        {
          cinema,
          showtimes: slots.map((s) => ({
            id: s.id,
            startsAt: s.startsAt,
            format: s.format,
            audioLanguage: movie.originalLanguage.toUpperCase(),
            subtitleLanguage: movie.originalLanguage === "th" ? null : "TH",
            hallNumber: s.hallDef.number,
            hallType: s.hallDef.type,
            fromPriceBaht: s.hallDef.prices.STANDARD,
            seatsLeft: seatsLeft(db, s, now),
          })),
        },
      ];
    }),
  };
  return ok(body);
}

// ---------------------------------------------------------------- bookings

export function toBooking(booking: MockBooking): Booking {
  const showtime = getShowtime(booking.showtimeId);
  const movie = showtime ? movies[showtime.movie] : undefined;
  const cinema = showtime ? cinemas[showtime.hallDef.cinemaIndex] : undefined;
  if (!showtime || !movie || !cinema) throw new Error("booking points at an unknown showtime");
  const layout = new Map(seatLayout(showtime).map((s) => [s.id, s]));
  return {
    id: booking.id,
    bookingCode: booking.code,
    status: booking.status,
    cancelReason: booking.cancelReason,
    showtime: {
      id: showtime.id,
      startsAt: showtime.startsAt,
      format: showtime.format,
      hallNumber: showtime.hallDef.number,
      movie: {
        slug: movie.slug,
        title: movie.title,
        posterUrl: movie.posterUrl,
        rating: movie.rating,
        durationMin: movie.durationMin,
      },
      cinema,
    },
    seats: booking.seatIds.flatMap((id) => {
      const seat = layout.get(id);
      return seat
        ? [{ seatId: id, label: seat.label, type: seat.type, priceBaht: seat.priceBaht }]
        : [];
    }),
    totalBaht: booking.totalBaht,
    currency: "THB",
    paymentExpiresAt: new Date(booking.paymentExpiresAt).toISOString(),
    holdExpiresAt: new Date(booking.holdExpiresAt).toISOString(),
    confirmedAt: booking.confirmedAt ? new Date(booking.confirmedAt).toISOString() : null,
    cancelledAt: booking.cancelledAt ? new Date(booking.cancelledAt).toISOString() : null,
    createdAt: new Date(booking.createdAt).toISOString(),
    latestPayment: booking.payment,
    ticketQr: booking.status === "CONFIRMED" ? `${booking.code}.${signature(booking)}` : null,
  };
}

function signature(booking: MockBooking): string {
  // Demo only: the real API signs `<bookingCode>` with an HMAC.
  let h = 0;
  for (const ch of `${booking.id}:${booking.code}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().padStart(8, "0");
}

function bookingCode(n: number): string {
  const alphabet = "7KQ2XPMTNHWRC4ZB";
  let value = n * 2654435761;
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(Math.abs(value) % alphabet.length);
    value = Math.floor(value / alphabet.length) + n * 7;
  }
  return `MT-${code}`;
}

function activeBookingOf(db: MockDb, userId: string): MockBooking | undefined {
  return db.bookings.find((b) => b.userId === userId && b.status === "PENDING_PAYMENT");
}

export function createBooking(
  db: MockDb,
  user: MockUser,
  idempotencyKey: string | null,
  body: unknown,
  now: number,
): MockResult {
  if (!idempotencyKey) {
    return fail(422, "IDEMPOTENCY_KEY_MISSING", "Idempotency-Key header is required");
  }
  const rawIds =
    typeof body === "object" && body !== null && "seatIds" in body ? body.seatIds : undefined;
  if (Array.isArray(rawIds) && rawIds.length > MAX_SEATS) {
    return fail(422, "TOO_MANY_SEATS", `At most ${MAX_SEATS.toString()} seats per booking`);
  }
  const parsed = CreateBookingBody.safeParse(body);
  const issues = [
    ...(parsed.success ? [] : parsed.error.issues),
    ...unknownKeyIssues(body, ["showtimeId", "seatIds"]),
  ];
  if (!parsed.success || issues.length > 0) return validationFailed(issues);
  const { showtimeId, seatIds } = parsed.data;

  const fingerprint = `${showtimeId}|${[...seatIds].sort().join(",")}`;
  const key = `${user.id}:${idempotencyKey}`;
  const previous = db.idempotency[key];
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      return fail(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency key reused with a different request");
    }
    const replayed = db.bookings.find((b) => b.id === previous.bookingId);
    if (replayed) return ok(toBooking(replayed), 201, { "Idempotent-Replayed": "true" });
  }

  const showtime = getShowtime(showtimeId);
  if (!showtime) return fail(404, "SHOWTIME_NOT_FOUND", "Showtime not found");
  if (!isBookable(showtime, now)) return fail(422, "BOOKING_CLOSED", "Booking is closed");
  const layout = new Map(seatLayout(showtime).map((s) => [s.id, s]));
  if (seatIds.some((id) => !layout.has(id))) {
    return fail(404, "SEAT_NOT_FOUND", "Seat not found in this hall");
  }

  const active = activeBookingOf(db, user.id);
  if (active) {
    return fail(409, "ACTIVE_BOOKING_EXISTS", "You already have a booking in progress", {
      bookingId: active.id,
    });
  }

  const statuses = seatStatuses(db, showtime, now);
  const taken = seatIds.filter((id) => statuses.get(id) !== "AVAILABLE");
  if (taken.length > 0) {
    return fail(409, "SEAT_TAKEN", "One or more seats are no longer available", {
      seatIds: taken,
    });
  }

  const created: MockBooking = {
    id: `b0000000-0000-4000-8000-${db.nextCode.toString().padStart(12, "0")}`,
    code: bookingCode(db.nextCode),
    userId: user.id,
    showtimeId,
    seatIds: [...seatIds],
    totalBaht: seatIds.reduce((sum, id) => sum + (layout.get(id)?.priceBaht ?? 0), 0),
    status: "PENDING_PAYMENT",
    cancelReason: null,
    createdAt: now,
    paymentExpiresAt: now + PAYMENT_WINDOW_MS,
    holdExpiresAt: now + HOLD_MS,
    confirmedAt: null,
    cancelledAt: null,
    payment: null,
  };
  db.nextCode += 1;
  db.bookings.push(created);
  db.idempotency[key] = { fingerprint, bookingId: created.id };
  return ok(toBooking(created), 201);
}

function findOwn(db: MockDb, user: MockUser, id: string): MockBooking | undefined {
  return db.bookings.find((b) => b.id === id && b.userId === user.id);
}

export function getActiveBooking(db: MockDb, user: MockUser): MockResult {
  const active = activeBookingOf(db, user.id);
  return active ? ok(toBooking(active)) : { status: 204 };
}

export function getBooking(db: MockDb, user: MockUser, id: string): MockResult {
  const booking = findOwn(db, user, id);
  return booking ? ok(toBooking(booking)) : fail(404, "NOT_FOUND", "Booking not found");
}

export function listMyBookings(
  db: MockDb,
  user: MockUser,
  scope: "upcoming" | "past",
  page: number,
  pageSize: number,
  now: number,
): MockResult {
  const mine = db.bookings
    .filter((b) => b.userId === user.id && b.status !== "PENDING_PAYMENT")
    .filter((b) => {
      const showtime = getShowtime(b.showtimeId);
      const ended = showtime ? showtime.endMs <= now : true;
      return scope === "past" ? ended : !ended;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  return ok({
    page,
    pageSize,
    total: mine.length,
    items: mine.slice((page - 1) * pageSize, page * pageSize).map(toBooking),
  });
}

export function cancelBooking(db: MockDb, user: MockUser, id: string, now: number): MockResult {
  const booking = findOwn(db, user, id);
  if (!booking) return fail(404, "NOT_FOUND", "Booking not found");
  if (db.settlements.some((s) => s.bookingId === id)) {
    return fail(409, "PAYMENT_IN_PROGRESS", "Payment is being processed");
  }
  if (booking.status !== "PENDING_PAYMENT") {
    return fail(409, "BOOKING_NOT_PENDING", "Booking is no longer pending");
  }
  booking.status = "CANCELLED";
  booking.cancelReason = "USER_CANCELLED";
  booking.cancelledAt = now;
  return ok(toBooking(booking));
}

export function createPaymentIntent(
  db: MockDb,
  user: MockUser,
  id: string,
  now: number,
): MockResult {
  const booking = findOwn(db, user, id);
  if (!booking) return fail(404, "NOT_FOUND", "Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    return fail(409, "BOOKING_NOT_PENDING", "Booking is no longer pending");
  }
  if (now >= booking.paymentExpiresAt) {
    return fail(422, "PAYMENT_WINDOW_CLOSED", "The payment window has closed");
  }
  return ok({
    clientSecret: `pi_demo_${booking.id}_secret_demo`,
    publishableKey: "pk_test_demo",
    amountBaht: booking.totalBaht,
    paymentExpiresAt: new Date(booking.paymentExpiresAt).toISOString(),
  });
}

// ---------------------------------------------------------------- demo-only: stands in for Stripe + webhook

export const SETTLE_DELAY_MS = 2_000;

export type DemoPayResult = "processing" | "declined";

/** Stand-in for confirming a payment with Stripe. The outcome comes from the demo controls. */
export function demoPay(
  db: MockDb,
  user: MockUser,
  input: { bookingId: string; method: "CARD" | "PROMPTPAY" },
  now: number,
): MockResult {
  const booking = findOwn(db, user, input.bookingId);
  if (!booking) return fail(404, "NOT_FOUND", "Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    return fail(409, "BOOKING_NOT_PENDING", "Booking is no longer pending");
  }
  if (now >= booking.paymentExpiresAt) {
    return fail(422, "PAYMENT_WINDOW_CLOSED", "The payment window has closed");
  }
  if (db.outcome === "decline") {
    booking.payment = {
      method: input.method,
      status: "FAILED",
      cardBrand: input.method === "CARD" ? "mastercard" : null,
      cardLast4: input.method === "CARD" ? "4444" : null,
      paidAt: null,
    };
    return ok({ result: "declined" satisfies DemoPayResult });
  }
  db.settlements.push({
    bookingId: booking.id,
    at: now + SETTLE_DELAY_MS,
    result: db.outcome === "late" ? "late" : "confirm",
    method: input.method,
  });
  return ok({ result: "processing" satisfies DemoPayResult });
}

// ---------------------------------------------------------------- demo controls (operate on the db directly)

/** "Someone else buys this seat": marks it booked by another user. */
export function takeSeatsAsSomeoneElse(db: MockDb, seatIds: string[]): string[] {
  const valid = seatIds.filter((id) => showtimeIdOfSeat(id) !== undefined);
  for (const id of valid) if (!db.externalSeatIds.includes(id)) db.externalSeatIds.push(id);
  return valid;
}

/** Moves the active booking's payment deadline to `now + ms`. Returns false when there is none. */
export function fastForwardPayment(db: MockDb, userId: string, now: number, ms: number): boolean {
  const active = activeBookingOf(db, userId);
  if (!active) return false;
  active.paymentExpiresAt = now + ms;
  active.holdExpiresAt = now + ms + (HOLD_MS - PAYMENT_WINDOW_MS);
  return true;
}

export function setOutcome(db: MockDb, outcome: PayOutcome): void {
  db.outcome = outcome;
}

export type { BookingStatus, CancelReason };

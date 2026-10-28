import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { ConfigService } from "../config/config.service.js";
import { Prisma, type IdempotencyKey } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { bookingClosesAt } from "../showtimes/showtimes.service.js";
import { BOOKING_CONFIG } from "./booking.config.js";
import type {
  BookingBody,
  BookingPageBody,
  CreateBookingDto,
  ListMyBookingsQueryDto,
} from "./booking.dto.js";
import { bookingInclude, toBookingBody } from "./booking.mapper.js";
import {
  cancelPendingBooking,
  generateBookingCode,
  hashCreateBookingRequest,
} from "./booking-support.js";
import { PaymentGateway } from "./payment-gateway.js";

/** Idempotency rows live 24 hours (database-design §16). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CREATE_ATTEMPTS = 3;

export interface CreateResult {
  booking: BookingBody;
  /** True when the stored response of an earlier request with the same Idempotency-Key was returned. */
  replayed: boolean;
}

type CreateOutcome =
  { kind: "created"; booking: BookingBody } | { kind: "existing"; row: IdempotencyKey };

const notFound = (message = "Booking not found"): AppException =>
  new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, message);

const unprocessable = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): AppException => new AppException(code, HttpStatus.UNPROCESSABLE_ENTITY, message, details);

@Injectable()
export class BookingService {
  private readonly ticketSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    config: ConfigService,
  ) {
    this.ticketSecret = config.get("TICKET_QR_SECRET");
  }

  // ------------------------------------------------------------------ create

  /**
   * Locks seats and creates a PENDING_PAYMENT booking (docs/openapi.yaml `createBooking`), in ONE transaction:
   * 1. cancel the caller's own stale pending booking, or refuse if it is still active,
   * 2. cancel stale holds on the requested seats,
   * 3. insert the booking and its seat locks. The partial unique index decides races: a conflicting seat is skipped
   *    by `ON CONFLICT DO NOTHING`, so the loser learns exactly which seats were taken.
   * The Idempotency-Key row is inserted first in the same transaction, so concurrent requests with one key are
   * serialised on its primary key: one creates the booking, the others replay its stored response.
   */
  async create(
    userId: string,
    dto: CreateBookingDto,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<CreateResult> {
    const requestHash = hashCreateBookingRequest(dto);

    // A repeated key replays before anything is validated: the stored answer is the answer.
    const stored = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key: idempotencyKey } },
    });
    if (stored && stored.expiresAt.getTime() > now.getTime())
      return this.replay(stored, requestHash);

    if (dto.seatIds.length > BOOKING_CONFIG.MAX_SEATS) {
      throw unprocessable(
        ErrorCode.TOO_MANY_SEATS,
        `At most ${String(BOOKING_CONFIG.MAX_SEATS)} seats per booking`,
      );
    }

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: dto.showtimeId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        hallId: true,
        prices: { select: { seatType: true, priceBaht: true } },
      },
    });
    if (!showtime) {
      throw new AppException(
        ErrorCode.SHOWTIME_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Showtime not found",
      );
    }
    if (
      showtime.status !== "SCHEDULED" ||
      now.getTime() >= bookingClosesAt(showtime.startsAt).getTime()
    ) {
      throw unprocessable(ErrorCode.BOOKING_CLOSED, "Booking for this showtime is closed");
    }

    const seats = await this.prisma.seat.findMany({
      where: { id: { in: dto.seatIds }, hallId: showtime.hallId, isActive: true },
      select: { id: true, type: true },
    });
    if (seats.length !== dto.seatIds.length) {
      const found = new Set(seats.map((seat) => seat.id));
      throw new AppException(ErrorCode.SEAT_NOT_FOUND, HttpStatus.NOT_FOUND, "Seat not found", {
        seatIds: dto.seatIds.filter((id) => !found.has(id)),
      });
    }

    // Server-side prices from the showtime, whole baht. The client only ever sends ids.
    const priceByType = new Map(showtime.prices.map((price) => [price.seatType, price.priceBaht]));
    const lines = dto.seatIds.map((seatId) => {
      const seat = seats.find((candidate) => candidate.id === seatId);
      const priceBaht = seat ? priceByType.get(seat.type) : undefined;
      if (!seat || priceBaht === undefined) {
        throw new AppException(ErrorCode.SEAT_NOT_FOUND, HttpStatus.NOT_FOUND, "Seat not found", {
          seatIds: [seatId],
        });
      }
      return { seatId, priceBaht };
    });

    for (let attempt = 1; ; attempt++) {
      try {
        const outcome = await this.createInTransaction({
          userId,
          idempotencyKey,
          requestHash,
          showtimeId: showtime.id,
          lines,
          now,
        });
        return outcome.kind === "created"
          ? { booking: outcome.booking, replayed: false }
          : this.replay(outcome.row, requestHash);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
          throw error;
        // Unique violation while inserting the booking: either the one-pending-booking-per-user index (a parallel
        // request of this user won) or a booking-code collision (vanishingly rare, retry with a new code).
        const isCodeCollision = `${error.message} ${JSON.stringify(error.meta ?? {})}`.includes(
          "booking_code",
        );
        if (!isCodeCollision) {
          const active = await this.findActive(userId, now);
          if (active) {
            throw new AppException(
              ErrorCode.ACTIVE_BOOKING_EXISTS,
              HttpStatus.CONFLICT,
              "You already have a booking in progress",
              { bookingId: active.id },
            );
          }
        }
        if (attempt >= MAX_CREATE_ATTEMPTS) throw error;
      }
    }
  }

  private async createInTransaction(input: {
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    showtimeId: string;
    lines: { seatId: string; priceBaht: number }[];
    now: Date;
  }): Promise<CreateOutcome> {
    const { userId, idempotencyKey, requestHash, showtimeId, now } = input;
    // Lock seats (and stale bookings) in one global order: two requests for overlapping seats sent in different
    // orders would otherwise each lock one seat and wait for the other, and Postgres would kill one as a deadlock.
    const lines = [...input.lines].sort((a, b) =>
      a.seatId < b.seatId ? -1 : a.seatId > b.seatId ? 1 : 0,
    );
    const seatIds = lines.map((line) => line.seatId);

    return this.prisma.$transaction(async (tx): Promise<CreateOutcome> => {
      // 0. Claim the idempotency key. A concurrent request with the same key blocks here until we commit or roll back.
      await tx.idempotencyKey.deleteMany({
        where: { userId, key: idempotencyKey, expiresAt: { lte: now } },
      });
      const claimed = await tx.$executeRaw`
        INSERT INTO idempotency_keys (user_id, key, request_hash, created_at, expires_at)
        VALUES (${userId}::uuid, ${idempotencyKey}, ${requestHash}, ${now},
                ${new Date(now.getTime() + IDEMPOTENCY_TTL_MS)})
        ON CONFLICT (user_id, key) DO NOTHING`;
      if (claimed === 0) {
        const row = await tx.idempotencyKey.findUniqueOrThrow({
          where: { userId_key: { userId, key: idempotencyKey } },
        });
        return { kind: "existing", row };
      }

      // 1. The caller's own pending booking: stale -> cancel it, still active -> refuse.
      const pending = await tx.$queryRaw<{ id: string; holdExpiresAt: Date }[]>`
        SELECT id, hold_expires_at AS "holdExpiresAt"
          FROM bookings
         WHERE user_id = ${userId}::uuid AND status = 'PENDING_PAYMENT'
         FOR UPDATE`;
      const own = pending[0];
      if (own) {
        if (own.holdExpiresAt.getTime() > now.getTime()) {
          throw new AppException(
            ErrorCode.ACTIVE_BOOKING_EXISTS,
            HttpStatus.CONFLICT,
            "You already have a booking in progress",
            { bookingId: own.id },
          );
        }
        await this.cancelStale(tx, own.id, now);
      }

      // 2. Stale holds (hold over, expiry job not yet run) on the requested seats are unlocked, whoever owns them.
      const stale = await tx.$queryRaw<{ id: string }[]>`
        SELECT b.id
          FROM bookings b
          JOIN booking_seats bs ON bs.booking_id = b.id
         WHERE bs.showtime_id = ${showtimeId}::uuid
           AND bs.seat_id = ANY(${seatIds}::uuid[])
           AND bs.released_at IS NULL
           AND b.status = 'PENDING_PAYMENT'
           AND b.hold_expires_at <= ${now}
         ORDER BY b.id
         FOR UPDATE OF b`;
      for (const id of new Set(stale.map((booking) => booking.id))) {
        await this.cancelStale(tx, id, now);
      }

      // 3. The booking, then its seat locks.
      const totalBaht = lines.reduce((sum, line) => sum + line.priceBaht, 0);
      const booking = await tx.booking.create({
        data: {
          bookingCode: generateBookingCode(),
          userId,
          showtimeId,
          status: "PENDING_PAYMENT",
          totalBaht,
          paymentExpiresAt: new Date(now.getTime() + BOOKING_CONFIG.PAYMENT_WINDOW_MS),
          holdExpiresAt: new Date(now.getTime() + BOOKING_CONFIG.SEAT_HOLD_MS),
          createdAt: now,
        },
        select: { id: true },
      });

      const locked = await tx.$queryRaw<{ seatId: string }[]>`
        INSERT INTO booking_seats (id, booking_id, showtime_id, seat_id, price_baht)
        SELECT gen_random_uuid(), ${booking.id}::uuid, ${showtimeId}::uuid, line.seat_id, line.price
          FROM unnest(${seatIds}::uuid[], ${lines.map((line) => line.priceBaht)}::int[]) AS line(seat_id, price)
        ON CONFLICT (showtime_id, seat_id) WHERE released_at IS NULL DO NOTHING
        RETURNING seat_id AS "seatId"`;
      if (locked.length !== seatIds.length) {
        const got = new Set(locked.map((row) => row.seatId));
        // Throwing rolls the whole transaction back: no booking, no partial locks, no idempotency row.
        throw new AppException(
          ErrorCode.SEAT_TAKEN,
          HttpStatus.CONFLICT,
          "One or more seats are no longer available",
          { seatIds: seatIds.filter((id) => !got.has(id)) },
        );
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: "CREATED",
          actor: "USER",
          data: { showtimeId, seatIds, totalBaht },
        },
      });

      const row = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: bookingInclude,
      });
      const body = toBookingBody(row, this.ticketSecret);
      await tx.idempotencyKey.update({
        where: { userId_key: { userId, key: idempotencyKey } },
        data: { responseStatus: 201, responseBody: body },
      });
      return { kind: "created", booking: body };
    });
  }

  /** A pending booking whose hold is over: ask the gateway (no-op until Phase 5), then cancel as PAYMENT_TIMEOUT. */
  private async cancelStale(
    tx: Prisma.TransactionClient,
    bookingId: string,
    now: Date,
  ): Promise<void> {
    await this.gateway.cancelPaymentIntent(bookingId);
    await cancelPendingBooking(tx, { bookingId, reason: "PAYMENT_TIMEOUT", actor: "SYSTEM", now });
  }

  private replay(row: IdempotencyKey, requestHash: string): CreateResult {
    if (row.requestHash !== requestHash) {
      throw unprocessable(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        "This Idempotency-Key was already used with a different request",
      );
    }
    if (row.responseBody === null || row.responseStatus === null) {
      // Cannot happen: the row and its response are written in one transaction.
      throw new AppException(
        ErrorCode.INTERNAL_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Internal server error",
      );
    }
    return { booking: row.responseBody as unknown as BookingBody, replayed: true };
  }

  // ------------------------------------------------------------------ reads

  private async findActive(userId: string, now: Date): Promise<{ id: string } | null> {
    return this.prisma.booking.findFirst({
      where: { userId, status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } },
      select: { id: true },
    });
  }

  /** The caller's in-progress booking (pending and still inside its hold), or null. */
  async getActive(userId: string, now: Date = new Date()): Promise<BookingBody | null> {
    const row = await this.prisma.booking.findFirst({
      where: { userId, status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } },
      include: bookingInclude,
    });
    return row ? toBookingBody(row, this.ticketSecret) : null;
  }

  /** Authorization is part of the query: someone else's booking is indistinguishable from a missing one. */
  async get(userId: string, bookingId: string): Promise<BookingBody> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: bookingInclude,
    });
    if (!row) throw notFound();
    return toBookingBody(row, this.ticketSecret);
  }

  async listMine(
    userId: string,
    query: ListMyBookingsQueryDto,
    now: Date = new Date(),
  ): Promise<BookingPageBody> {
    const where: Prisma.BookingWhereInput = {
      userId,
      status: { in: ["CONFIRMED", "CANCELLED"] },
      showtime: query.scope === "upcoming" ? { endsAt: { gt: now } } : { endsAt: { lte: now } },
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows.map((row) => toBookingBody(row, this.ticketSecret)),
    };
  }

  // ------------------------------------------------------------------ cancel

  /** Gives up a booking before paying: PENDING_PAYMENT only, guarded UPDATE, seats released, event written. */
  async cancel(userId: string, bookingId: string, now: Date = new Date()): Promise<BookingBody> {
    const current = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: { id: true, status: true },
    });
    if (!current) throw notFound();
    if (current.status !== "PENDING_PAYMENT") throw this.notPending();

    // Stripe first (Phase 5): if the payment is already processing or succeeded the cancel is refused.
    const outcome = await this.gateway.cancelPaymentIntent(bookingId);
    if (outcome === "in_progress") {
      throw new AppException(
        ErrorCode.PAYMENT_IN_PROGRESS,
        HttpStatus.CONFLICT,
        "The payment is being processed and cannot be cancelled",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const cancelled = await cancelPendingBooking(tx, {
        bookingId,
        reason: "USER_CANCELLED",
        actor: "USER",
        now,
      });
      // Lost a race with the expiry job or the webhook: the booking is no longer pending.
      if (!cancelled) throw this.notPending();
    });
    return this.get(userId, bookingId);
  }

  private notPending(): AppException {
    return new AppException(
      ErrorCode.BOOKING_NOT_PENDING,
      HttpStatus.CONFLICT,
      "This booking is no longer pending payment",
    );
  }
}

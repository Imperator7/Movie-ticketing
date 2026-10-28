import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { cinemaSchema } from "../catalog/catalog.dto.js";
import { createStrictDto } from "../common/validation/strict-dto.js";

/** Hard cap on the array so a huge body cannot cost work; the real limit (4) answers TOO_MANY_SEATS. */
const MAX_SEAT_IDS_ACCEPTED = 50;

// ---------------------------------------------------------------- requests

export class CreateBookingDto extends createStrictDto({
  showtimeId: z.uuid(),
  seatIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_SEAT_IDS_ACCEPTED)
    .refine((ids) => new Set(ids).size === ids.length, { message: "seat ids must be unique" }),
}) {}

export class ListMyBookingsQueryDto extends createStrictDto({
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}) {}

// ---------------------------------------------------------------- responses (the contract's Booking)

const seatType = z.enum(["STANDARD", "PREMIUM"]);

export const bookingSchema = z.object({
  id: z.uuid(),
  bookingCode: z.string(),
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED", "CANCELLED"]),
  cancelReason: z
    .enum(["PAYMENT_TIMEOUT", "USER_CANCELLED", "LATE_PAYMENT_REFUNDED"])
    .nullable()
    .optional(),
  showtime: z.object({
    id: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    format: z.enum(["TWO_D", "THREE_D", "IMAX"]),
    hallNumber: z.number().int(),
    movie: z.object({
      slug: z.string(),
      title: z.object({ th: z.string(), en: z.string() }),
      posterUrl: z.url().nullable(),
      rating: z.enum(["PROMOTED", "GENERAL", "AGE_13", "AGE_15", "AGE_18", "AGE_20"]),
      durationMin: z.number().int(),
    }),
    cinema: cinemaSchema,
  }),
  seats: z.array(
    z.object({
      seatId: z.uuid(),
      label: z.string(),
      type: seatType,
      priceBaht: z.number().int(),
    }),
  ),
  totalBaht: z.number().int(),
  currency: z.literal("THB"),
  paymentExpiresAt: z.iso.datetime({ offset: true }),
  holdExpiresAt: z.iso.datetime({ offset: true }),
  confirmedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  latestPayment: z
    .object({
      method: z.enum(["CARD", "PROMPTPAY"]),
      status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"]),
      cardBrand: z.string().nullable().optional(),
      cardLast4: z.string().nullable().optional(),
      paidAt: z.iso.datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
  // Plain nullable strings on top-level DTO properties need the override (see auth.dto.ts).
  ticketQr: z.string().nullable().optional().meta({ type: "string", nullable: true }),
});

export const bookingPageSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  items: z.array(bookingSchema),
});

export class BookingDto extends createZodDto(bookingSchema) {}
export class BookingPageDto extends createZodDto(bookingPageSchema) {}

export type BookingBody = z.infer<typeof bookingSchema>;
export type BookingPageBody = z.infer<typeof bookingPageSchema>;

import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { cinemaSchema, movieSummarySchema } from "../catalog/catalog.dto.js";

const seatType = z.enum(["STANDARD", "PREMIUM"]);
const price = z.object({ seatType, priceBaht: z.number().int() });

export const showtimeDetailSchema = z.object({
  id: z.uuid(),
  movie: movieSummarySchema,
  cinema: cinemaSchema,
  hall: z.object({
    id: z.uuid(),
    number: z.number().int(),
    type: z.enum(["STANDARD", "IMAX", "FOUR_DX"]),
  }),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  format: z.enum(["TWO_D", "THREE_D", "IMAX"]),
  audioLanguage: z.string(),
  subtitleLanguage: z.string().nullable().optional().meta({ type: "string", nullable: true }),
  prices: z.array(price),
  bookingClosesAt: z.iso.datetime({ offset: true }),
  isBookable: z.boolean(),
  maxSeatsPerBooking: z.literal(4).meta({ type: "integer", const: 4 }).optional(),
});

export const seatMapSchema = z.object({
  showtimeId: z.uuid(),
  totalRows: z.number().int(),
  totalCols: z.number().int(),
  seats: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      row: z.string(),
      number: z.number().int(),
      gridRow: z.number().int(),
      gridCol: z.number().int(),
      type: seatType,
      status: z.enum(["AVAILABLE", "HELD", "BOOKED"]),
    }),
  ),
  prices: z.array(price),
  generatedAt: z.iso.datetime({ offset: true }),
});

export class ShowtimeDetailDto extends createZodDto(showtimeDetailSchema) {}
export class SeatMapDto extends createZodDto(seatMapSchema) {}

export type ShowtimeDetailBody = z.infer<typeof showtimeDetailSchema>;
export type SeatMapBody = z.infer<typeof seatMapSchema>;

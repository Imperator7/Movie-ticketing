import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser, type CurrentUserInfo } from "../auth/current-user.decorator.js";
import { AppException } from "../common/errors/app.exception.js";
import { ApiErrors } from "../common/errors/api-errors.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { UuidParamPipe } from "../common/validation/param-pipes.js";
import {
  BookingDto,
  BookingPageDto,
  CreateBookingDto,
  ListMyBookingsQueryDto,
  type BookingBody,
  type BookingPageBody,
} from "./booking.dto.js";
import { BookingService } from "./booking.service.js";

const bookingIdParam = { name: "bookingId", schema: { type: "string", format: "uuid" } } as const;

/** Bookings of the logged-in user (contract tag `Bookings`). Everything here needs a valid access token. */
@ApiTags("Bookings")
@ApiBearerAuth("bearerAuth")
@Controller("bookings")
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "Client-generated UUID, one per user action. Retries reuse it. Kept 24 h.",
    schema: { type: "string", format: "uuid" },
  })
  @ApiCreatedResponse({ type: BookingDto })
  @ApiErrors(401, 404, 409, 422)
  async createBooking(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: CreateBookingDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingBody> {
    const key = parseIdempotencyKey(idempotencyKey);
    const { booking, replayed } = await this.bookings.create(user.userId, dto, key);
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    return booking;
  }

  @Get("active")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BookingDto })
  @ApiNoContentResponse({ description: "No active booking" })
  @ApiErrors(401)
  async getActiveBooking(
    @CurrentUser() user: CurrentUserInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingBody | undefined> {
    const active = await this.bookings.getActive(user.userId);
    if (!active) {
      res.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return active;
  }

  @Get("me")
  @ApiOkResponse({ type: BookingPageDto })
  @ApiErrors(401, 422)
  listMyBookings(
    @CurrentUser() user: CurrentUserInfo,
    @Query() query: ListMyBookingsQueryDto,
  ): Promise<BookingPageBody> {
    return this.bookings.listMine(user.userId, query);
  }

  @Get(":bookingId")
  @ApiParam(bookingIdParam)
  @ApiOkResponse({ type: BookingDto })
  @ApiErrors(401, 404)
  getBooking(
    @CurrentUser() user: CurrentUserInfo,
    @Param("bookingId", UuidParamPipe) bookingId: string,
  ): Promise<BookingBody> {
    return this.bookings.get(user.userId, bookingId);
  }

  @Post(":bookingId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiParam(bookingIdParam)
  @ApiOkResponse({ type: BookingDto })
  @ApiErrors(401, 404, 409)
  cancelBooking(
    @CurrentUser() user: CurrentUserInfo,
    @Param("bookingId", UuidParamPipe) bookingId: string,
  ): Promise<BookingBody> {
    return this.bookings.cancel(user.userId, bookingId);
  }
}

const idempotencyKeySchema = z.uuid();

/** The header is required (422 IDEMPOTENCY_KEY_MISSING) and must be a UUID (422 VALIDATION_FAILED). */
export function parseIdempotencyKey(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new AppException(
      ErrorCode.IDEMPOTENCY_KEY_MISSING,
      HttpStatus.UNPROCESSABLE_ENTITY,
      "The Idempotency-Key header is required",
    );
  }
  const parsed = idempotencyKeySchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Validation failed",
      { fields: { "Idempotency-Key": ["invalid_format"] } },
    );
  }
  return parsed.data;
}

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeController,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser, type CurrentUserInfo } from "../auth/current-user.decorator.js";
import { Public } from "../auth/public.decorator.js";
import { AppException } from "../common/errors/app.exception.js";
import { ApiErrors } from "../common/errors/api-errors.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { UuidParamPipe } from "../common/validation/param-pipes.js";
import { createStrictDto } from "../common/validation/strict-dto.js";
import { InvalidSignatureError, PaymentProvider } from "./payment-provider.js";
import { PaymentsService, type PaymentIntentBody } from "./payments.service.js";

export class PaymentIntentResponseDto extends createZodDto(
  z.object({
    clientSecret: z.string(),
    publishableKey: z.string(),
    amountBaht: z.number().int(),
    paymentExpiresAt: z.iso.datetime({ offset: true }),
  }),
) {}

const invalidSignature = (): AppException =>
  new AppException(
    ErrorCode.WEBHOOK_SIGNATURE_INVALID,
    HttpStatus.BAD_REQUEST,
    "Invalid webhook signature",
  );

/** Contract tag `Payments`. */
@ApiTags("Payments")
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly provider: PaymentProvider,
  ) {}

  @Post("bookings/:bookingId/payment-intent")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("bearerAuth")
  @ApiParam({ name: "bookingId", schema: { type: "string", format: "uuid" } })
  @ApiOkResponse({ type: PaymentIntentResponseDto })
  @ApiErrors(401, 404, 409, 422)
  createPaymentIntent(
    @CurrentUser() user: CurrentUserInfo,
    @Param("bookingId", UuidParamPipe) bookingId: string,
  ): Promise<PaymentIntentBody> {
    return this.payments.createPaymentIntent(user.userId, bookingId);
  }

  /** Called by Stripe. The signature is checked against the RAW body (`rawBody: true` in APP_CREATE_OPTIONS). */
  @Post("payments/webhook")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "Stripe-Signature", required: true, schema: { type: "string" } })
  @ApiBody({ schema: { type: "object" }, required: true })
  @ApiOkResponse({ description: "Received (including duplicates and ignored event types)" })
  @ApiErrors(400)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<void> {
    if (!signature || !req.rawBody) throw invalidSignature();
    let event;
    try {
      event = this.provider.parseWebhook(req.rawBody, signature);
    } catch (error) {
      if (error instanceof InvalidSignatureError) throw invalidSignature();
      throw error;
    }
    await this.payments.handleEvent(event);
  }
}

export class DemoPayDto extends createStrictDto({
  bookingId: z.uuid(),
  method: z.enum(["CARD", "PROMPTPAY"]),
}) {}

/**
 * NOT part of the contract: the fake provider's "customer pays" button. Only registered when
 * PAYMENTS_PROVIDER is fake (see PaymentsModule), and hidden from the OpenAPI document.
 */
@ApiExcludeController()
@Controller("__demo")
export class DemoPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("pay")
  @HttpCode(HttpStatus.OK)
  demoPay(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: DemoPayDto,
  ): Promise<{ result: "processing" }> {
    return this.payments.demoPay(user.userId, dto.bookingId, dto.method);
  }
}

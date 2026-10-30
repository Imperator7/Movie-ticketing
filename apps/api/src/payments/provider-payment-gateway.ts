import { Injectable } from "@nestjs/common";
import { PaymentGateway, type CancelOutcome } from "../booking/payment-gateway.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PaymentProvider } from "./payment-provider.js";

/**
 * The booking module's PaymentGateway on top of the real provider: cancels every open PaymentIntent of a booking.
 * `in_progress` wins (the webhook decides), otherwise `cancelled` if anything was cancelled.
 */
@Injectable()
export class ProviderPaymentGateway extends PaymentGateway {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
  ) {
    super();
  }

  async cancelPaymentIntent(bookingId: string): Promise<CancelOutcome> {
    const open = await this.prisma.payment.findMany({
      where: { bookingId, status: { in: ["PENDING", "FAILED"] } },
      select: { id: true, stripePaymentIntentId: true },
    });
    let result: CancelOutcome = "nothing_to_cancel";
    for (const payment of open) {
      const outcome = await this.provider.cancelIntent(payment.stripePaymentIntentId);
      if (outcome === "in_progress") {
        result = "in_progress";
        continue;
      }
      if (outcome === "cancelled" && result === "nothing_to_cancel") result = "cancelled";
      // Guarded: a webhook may have moved it on meanwhile.
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "CANCELLED" },
      });
    }
    return result;
  }
}

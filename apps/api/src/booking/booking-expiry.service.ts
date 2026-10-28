import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { cancelPendingBooking } from "./booking-support.js";
import { PaymentGateway } from "./payment-gateway.js";

/** Key of `pg_try_advisory_xact_lock` for this job: only one container works per tick (database-design §18). */
export const EXPIRY_JOB_LOCK_ID = 7_301_001;
/** Bookings handled per run; the rest wait for the next tick. */
const BATCH_SIZE = 200;
const TRANSACTION_TIMEOUT_MS = 60_000;

export interface ExpiryRunResult {
  /** False when another container held the advisory lock, so nothing was done. */
  ran: boolean;
  cancelled: number;
  /** Payment window over but the gateway says it is processing and the hold is not over: left for the webhook. */
  skipped: number;
  idempotencyKeysDeleted: number;
}

/**
 * Tidies up after the request path (which never depends on it, database-design §3):
 * - PENDING_PAYMENT bookings whose payment window (5 min) is over are cancelled as PAYMENT_TIMEOUT and their seats
 *   unlocked, unless the payment is already processing or succeeded; once the hold (6 min) is over they are
 *   cancelled regardless,
 * - expired idempotency keys are deleted.
 * Every state change is a guarded UPDATE plus its `booking_events` row in the same transaction.
 */
@Injectable()
export class BookingExpiryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BookingExpiryService.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> = Promise.resolve();
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get("JOBS_ENABLED")) return;
    const intervalMs = this.config.get("JOB_INTERVAL_MS");
    this.timer = setInterval(() => {
      this.running = this.running.then(() => this.tick());
    }, intervalMs);
    this.timer.unref(); // never keeps the process alive on its own
    this.logger.log(`Expiry job every ${String(intervalMs)} ms`);
  }

  /** Graceful shutdown: no new ticks, wait for the one in flight. */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private async tick(): Promise<void> {
    if (this.stopping) return;
    try {
      const result = await this.runOnce();
      if (result.cancelled > 0 || result.idempotencyKeysDeleted > 0) {
        this.logger.log({ event: "expiry_job_run", ...result });
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
  }

  /** One pass. Callable directly (tests, admin tooling); safe to run concurrently from many containers. */
  async runOnce(now: Date = new Date()): Promise<ExpiryRunResult> {
    return this.prisma.$transaction(
      async (tx): Promise<ExpiryRunResult> => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${EXPIRY_JOB_LOCK_ID}::bigint) AS locked`;
        if (!lock?.locked)
          return { ran: false, cancelled: 0, skipped: 0, idempotencyKeysDeleted: 0 };

        const due = await tx.booking.findMany({
          where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lte: now } },
          select: { id: true, holdExpiresAt: true },
          orderBy: [{ paymentExpiresAt: "asc" }, { id: "asc" }],
          take: BATCH_SIZE,
        });

        let cancelled = 0;
        let skipped = 0;
        for (const booking of due) {
          const outcome = await this.gateway.cancelPaymentIntent(booking.id);
          const holdOver = booking.holdExpiresAt.getTime() <= now.getTime();
          if (outcome === "in_progress" && !holdOver) {
            skipped++;
            continue;
          }
          const done = await cancelPendingBooking(tx, {
            bookingId: booking.id,
            reason: "PAYMENT_TIMEOUT",
            actor: "SYSTEM",
            now,
          });
          if (done) cancelled++;
        }

        const keys = await tx.idempotencyKey.deleteMany({ where: { expiresAt: { lte: now } } });
        return { ran: true, cancelled, skipped, idempotencyKeysDeleted: keys.count };
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }
}

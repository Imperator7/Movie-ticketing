import { Injectable } from "@nestjs/common";
import { ConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Matches `components.schemas.HealthStatus` in docs/openapi.yaml. */
export interface HealthStatus {
  status: "ok" | "error" | "shutting_down";
  checks?: Record<string, "up" | "down">;
}

export interface HealthResult {
  httpStatus: 200 | 503;
  body: HealthStatus;
}

/**
 * Lifecycle: `running` -> `shutting_down` (one way). Once draining, readiness is 503 so the load balancer
 * stops sending traffic, while liveness stays 200 until the process exits.
 */
@Injectable()
export class HealthService {
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  beginShutdown(): void {
    this.shuttingDown = true;
  }

  liveness(): HealthResult {
    return { httpStatus: 200, body: { status: "ok" } };
  }

  async readiness(): Promise<HealthResult> {
    if (this.shuttingDown) {
      return { httpStatus: 503, body: { status: "shutting_down" } };
    }
    const databaseUp = await this.pingDatabase();
    return databaseUp
      ? { httpStatus: 200, body: { status: "ok", checks: { database: "up" } } }
      : { httpStatus: 503, body: { status: "error", checks: { database: "down" } } };
  }

  private async pingDatabase(): Promise<boolean> {
    const timeoutMs = this.config.get("HEALTH_DB_TIMEOUT_MS");
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, timeoutMs);
    });
    const query = this.prisma.$queryRaw`SELECT 1`.then(
      () => true as const,
      () => false as const,
    );
    try {
      return await Promise.race([query, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

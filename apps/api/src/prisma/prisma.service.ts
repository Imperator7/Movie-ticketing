import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { ConfigService } from "../config/config.service.js";

/** The application's database client. Connects as `app_user` (DML only, DB-2). */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get("DATABASE_URL"),
        // Pool limit per container (DB-6).
        max: config.get("DB_POOL_MAX"),
        connectionTimeoutMillis: config.get("DB_CONNECT_TIMEOUT_MS"),
      }),
    });
  }

  // onApplicationShutdown runs after Nest has closed the HTTP server, so requests still in flight
  // during the drain keep a working pool. (onModuleDestroy would run before the server closes.)
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}

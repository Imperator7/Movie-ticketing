import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { ConfigService } from "../config/config.service.js";

/** The application's database client. Connects as `app_user` (DML only, DB-2). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

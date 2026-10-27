import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthGuard } from "./auth/jwt-auth.guard.js";
import { CommonModule } from "./common/common.module.js";
import { buildLoggerParams } from "./common/logging/logger.config.js";
import { AppThrottlerGuard, buildThrottlerOptions } from "./common/rate-limit/rate-limit.js";
import { ConfigModule } from "./config/config.module.js";
import { ConfigService } from "./config/config.service.js";
import { HealthModule } from "./health/health.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerParams({ NODE_ENV: config.get("NODE_ENV"), LOG_LEVEL: config.get("LOG_LEVEL") }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildThrottlerOptions({
          globalPerMin: config.get("RATE_LIMIT_GLOBAL_PER_MIN"),
          authPerMin: config.get("RATE_LIMIT_AUTH_PER_MIN"),
          loginPerEmailPerMin: config.get("RATE_LIMIT_LOGIN_PER_EMAIL_PER_MIN"),
        }),
    }),
    PrismaModule,
    CommonModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication, so unauthenticated floods are cheap to reject.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { CommonModule } from "./common/common.module.js";
import { buildLoggerParams } from "./common/logging/logger.config.js";
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
    PrismaModule,
    CommonModule,
    HealthModule,
  ],
})
export class AppModule {}

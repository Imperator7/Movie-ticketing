import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { APP_CREATE_OPTIONS, configureApp } from "./app.setup.js";
import { ConfigService } from "./config/config.service.js";
import { EnvValidationError, validateEnv } from "./config/env.schema.js";
import { gracefulShutdown } from "./health/graceful-shutdown.js";
import { HealthService } from "./health/health.service.js";

async function bootstrap(): Promise<void> {
  // Fail fast with a readable message before anything else starts (API-13).
  try {
    validateEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_CREATE_OPTIONS);
  app.useLogger(app.get(Logger));
  configureApp(app);

  const config = app.get(ConfigService);
  const health = app.get(HealthService);
  const logger = app.get(Logger);

  let stopping = false;
  process.once("SIGTERM", () => {
    if (stopping) return;
    stopping = true;
    logger.log(
      `SIGTERM received: not ready, draining for ${String(config.get("SHUTDOWN_DRAIN_MS"))} ms`,
    );
    void gracefulShutdown({
      beginShutdown: () => {
        health.beginShutdown();
      },
      drainMs: config.get("SHUTDOWN_DRAIN_MS"),
      close: () => app.close(),
    }).catch((error: unknown) => {
      logger.error(error);
      process.exit(1);
    });
  });

  const port = config.get("PORT");
  await app.listen(port);
  logger.log(`API listening on port ${String(port)} (prefix /api/v1)`);
}

await bootstrap();

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { inject } from "vitest";
import { AppModule } from "../src/app.module.js";
import { APP_CREATE_OPTIONS, configureApp } from "../src/app.setup.js";

/** Env for the app under test: the real app_user URL from the Testcontainers database. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: inject("databaseUrl"),
    DB_POOL_MAX: "3",
    JWT_SECRET: "test_jwt_secret_change_me_0123456789abcdef",
    REFRESH_TOKEN_PEPPER: "test_refresh_pepper_change_me_0123456789abcdef",
    TICKET_QR_SECRET: "test_ticket_qr_secret_change_me_0123456789abcd",
    ...overrides,
  };
}

/** Boots the real AppModule (real Prisma, real DB) configured exactly like main.ts. */
export async function createTestApp(
  overrides: Record<string, string> = {},
): Promise<NestExpressApplication> {
  const previous = { ...process.env };
  Object.assign(process.env, testEnv(overrides));
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    return app;
  } finally {
    // ConfigModule has read the environment by now; restore it for other specs.
    process.env = previous;
  }
}

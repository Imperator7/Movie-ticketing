import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { ConfigService } from "./config/config.service.js";

export const GLOBAL_PREFIX = "api/v1";
export const JSON_BODY_LIMIT = "100kb";

/**
 * Options every entry point (main.ts, integration tests) must create the app with.
 * - `bodyParser: false`: parsers are registered explicitly in `configureApp` with a size limit.
 * - `rawBody: true`: keeps `req.rawBody` for signature checks (the Stripe webhook, added later).
 */
export const APP_CREATE_OPTIONS = { bodyParser: false, rawBody: true, bufferLogs: true } as const;

/** HTTP-level setup shared by `main.ts` and the integration tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix(GLOBAL_PREFIX);

  // Behind the ALB the real client IP is in X-Forwarded-For (API-14). 0 hops = trust no proxy.
  const hops = config.get("TRUST_PROXY_HOPS");
  app.set("trust proxy", hops > 0 ? hops : false);

  // Swagger UI needs inline scripts, so relax the CSP only when docs are on (never in production).
  app.use(helmet(config.get("SWAGGER_ENABLED") ? { contentSecurityPolicy: false } : {}));

  if (config.isDevelopment) {
    app.enableCors({ origin: config.get("WEB_ORIGINS"), credentials: true });
  }

  // Global JSON limit. A route that needs a different parser (the Stripe webhook, which needs the raw body)
  // can be added later with its own `app.useBodyParser(...)` / middleware scoped to its path.
  app.use(cookieParser()); // the refresh token cookie `rt`
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });

  app.enableShutdownHooks(["SIGINT"]); // SIGTERM is handled in main.ts so readiness can drain first.

  if (config.get("SWAGGER_ENABLED")) setupSwagger(app);
}

function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Movie Ticketing API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .addCookieAuth("rt", { type: "apiKey", in: "cookie", name: "rt" }, "refreshCookie")
      .build(),
  );
  // Served at /api/docs (outside the global prefix). cleanupOpenApiDoc renders the Zod DTO schemas.
  SwaggerModule.setup("api/docs", app, cleanupOpenApiDoc(document));
}

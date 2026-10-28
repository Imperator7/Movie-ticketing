import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { noStoreByDefault } from "./common/http/cache-control.js";
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

  // Nothing is cacheable unless a route opts in with @CacheControl (auth, errors and health stay no-store).
  app.use(noStoreByDefault);

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

/**
 * The OpenAPI document generated from the Nest controllers and Zod DTOs. Operation ids are the method names
 * (`listMovies`), matching docs/openapi.yaml; the contract test compares the two.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Movie Ticketing API")
      .setVersion("0.1.0")
      .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearerAuth")
      .addCookieAuth("rt", { type: "apiKey", in: "cookie", name: "rt" }, "refreshCookie")
      .build(),
    { operationIdFactory: (_controllerKey, methodKey) => methodKey },
  );
  // cleanupOpenApiDoc renders the Zod DTO schemas.
  return cleanupOpenApiDoc(document);
}

function setupSwagger(app: INestApplication): void {
  // Served at /api/docs (outside the global prefix).
  SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app));
}

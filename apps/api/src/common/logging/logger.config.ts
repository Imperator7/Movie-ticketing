import type { Params } from "nestjs-pino";
import { genReqId } from "../request-id.js";
import type { Env } from "../../config/env.schema.js";

/** Paths redacted from every log line (API-8). */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.refreshToken",
  'req.headers["stripe-signature"]',
  "*.email",
  "*.phone",
];

export function buildLoggerParams(env: Pick<Env, "NODE_ENV" | "LOG_LEVEL">): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId,
      // The request id is `req.id` on every line logged during the request, and `requestId` on the access log.
      customProps: (req) => ({ requestId: req.id }),
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      // Pretty output only in development; everything else is JSON.
      ...(env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { singleLine: true, colorize: true } } }
        : {}),
    },
  };
}

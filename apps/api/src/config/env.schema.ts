import { z } from "zod";

/** Environments where placeholder secrets from `.env.example` are tolerated. */
const RELAXED_ENVS = new Set(["development", "test"]);

const MIN_SECRET_BYTES = 32;

/** Values that obviously came from an example file or a copy-paste. */
const PLACEHOLDER_PATTERN =
  /change[_-]?me|placeholder|example|dev[_-]|replace[_-]?me|secret[_-]?here|xxxx/i;

const secret = z.string().refine((value) => Buffer.byteLength(value, "utf8") >= MIN_SECRET_BYTES, {
  message: `must be at least ${MIN_SECRET_BYTES} bytes long (generate one with: openssl rand -base64 48)`,
});

const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const SECRET_KEYS = ["JWT_SECRET", "REFRESH_TOKEN_PEPPER", "TICKET_QR_SECRET"] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // The app connects as app_user (DML only). Migrations use MIGRATION_DATABASE_URL (Prisma CLI only).
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Pool size per container. Size it against RDS max_connections / number of containers (DB-6). */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

    JWT_SECRET: secret,
    REFRESH_TOKEN_PEPPER: secret,
    TICKET_QR_SECRET: secret,

    /**
     * Web origins, comma separated. CORS allows them in development only; the Origin guard on the
     * cookie endpoints (/auth/refresh, /auth/logout) requires the request Origin to be one of them (API-5).
     */
    WEB_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin !== ""),
      )
      .pipe(z.array(z.url()).min(1)),
    /** Number of reverse proxies in front of the app (ALB = 1). 0 = trust none. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    SWAGGER_ENABLED: booleanFlag.default(false),

    // --- Auth (API-4/5/6) ---
    JWT_ISSUER: z.string().min(1).default("movie-ticketing-api"),
    JWT_AUDIENCE: z.string().min(1).default("movie-ticketing-web"),
    /** `Secure` flag of the refresh cookie. `false` is only allowed in development/test. */
    COOKIE_SECURE: booleanFlag.default(true),
    /**
     * A revoked refresh token presented again within this window is treated as a concurrent refresh
     * (401, family kept) instead of theft (family revoked). 0 = always treat as reuse.
     */
    // Racing tabs re-present a just-rotated token; within this window it is a plain 401, not theft (database-design §14).
    REFRESH_REUSE_GRACE_MS: z.coerce.number().int().min(0).max(60_000).default(10_000),

    // --- Background jobs (database-design §18) ---
    /** Runs the booking expiry job in this container. Tests turn it off. */
    JOBS_ENABLED: booleanFlag.default(true),
    JOB_INTERVAL_MS: z.coerce.number().int().min(100).max(3_600_000).default(30_000),

    // Rate limits (API-6), per minute. TODO(redis): in-memory counters are per container.
    RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_LOGIN_PER_EMAIL_PER_MIN: z.coerce.number().int().min(1).default(5),

    /** Time to keep serving (readiness 503) after SIGTERM before closing, so the ALB stops routing first. */
    SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).max(120_000).default(5000),
    HEALTH_DB_TIMEOUT_MS: z.coerce.number().int().min(50).max(30_000).default(2000),
  })
  .superRefine((env, ctx) => {
    if (RELAXED_ENVS.has(env.NODE_ENV)) return;
    for (const key of SECRET_KEYS) {
      if (PLACEHOLDER_PATTERN.test(env[key])) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `looks like a placeholder; real secrets are required when NODE_ENV=${env.NODE_ENV}`,
        });
      }
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: `must be true when NODE_ENV=${env.NODE_ENV}`,
      });
    }
    if (env.SWAGGER_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["SWAGGER_ENABLED"],
        message: `must not be enabled when NODE_ENV=${env.NODE_ENV}`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((line) => `  - ${line}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Parses raw env vars. Never includes values in the message, only variable names and reasons. */
export function validateEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  throw new EnvValidationError(
    result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(env)";
      const missing = issue.code === "invalid_type" && raw[name] === undefined;
      return `${name}: ${missing ? "is required" : issue.message}`;
    }),
  );
}

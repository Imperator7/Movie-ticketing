import { type ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from "@nestjs/throttler";
import type { Request, Response } from "express";
import { normalizeEmail } from "../../auth/email.js";
import { AppException } from "../errors/app.exception.js";
import { ErrorCode } from "../errors/error-code.js";

const MINUTE_MS = 60_000;
const AUTH_PREFIX = "/api/v1/auth/";
const LOGIN_PATH = "/api/v1/auth/login";

export interface RateLimits {
  globalPerMin: number;
  authPerMin: number;
  loginPerEmailPerMin: number;
}

const requestOf = (context: ExecutionContext): Request =>
  context.switchToHttp().getRequest<Request>();

export const isAuthRoute = (context: ExecutionContext): boolean =>
  requestOf(context).path.startsWith(AUTH_PREFIX);

export const isLoginRoute = (context: ExecutionContext): boolean => {
  const request = requestOf(context);
  return request.method === "POST" && request.path === LOGIN_PATH;
};

/** Login attempts are counted per (normalised) email, so a distributed guesser cannot dodge the per-IP limit. */
export function loginTracker(req: Record<string, unknown>): string {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  // Without a usable email the request cannot succeed anyway, so fall back to the IP.
  return email !== "" ? `email:${email}` : `ip:${String(req.ip)}`;
}

/**
 * Three limits per minute (API-6): everything per IP, `/auth/*` per IP, and login per email.
 *
 * TODO(redis): the default storage is in-memory, so counters are per container. With 2+ containers the effective
 * limit multiplies. Use a shared store (e.g. Redis via @nest-lab/throttler-storage-redis) before scaling out.
 */
export function buildThrottlerOptions(limits: RateLimits): ThrottlerModuleOptions {
  return {
    setHeaders: false, // headers are written on 429 by AppThrottlerGuard (the contract uses RateLimit-*)
    throttlers: [
      { name: "default", ttl: MINUTE_MS, limit: limits.globalPerMin },
      { name: "auth", ttl: MINUTE_MS, limit: limits.authPerMin, skipIf: (c) => !isAuthRoute(c) },
      {
        name: "login",
        ttl: MINUTE_MS,
        limit: limits.loginPerEmailPerMin,
        skipIf: (c) => !isLoginRoute(c),
        getTracker: loginTracker,
      },
    ],
  };
}

/** Renders a limit hit as the contract's 429 `RATE_LIMITED` with `Retry-After` and `RateLimit-*` headers. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();
    const retryAfter = Math.max(1, detail.timeToBlockExpire || detail.timeToExpire);
    response.setHeader("Retry-After", String(retryAfter));
    response.setHeader("RateLimit-Limit", String(detail.limit));
    response.setHeader("RateLimit-Remaining", "0");
    response.setHeader("RateLimit-Reset", String(retryAfter));
    throw new AppException(
      ErrorCode.RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS,
      "Too many requests",
    );
  }
}

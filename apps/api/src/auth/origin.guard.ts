import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { ConfigService } from "../config/config.service.js";

/** True only for a present Origin that exactly matches one of the allowed web origins. */
export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin !== undefined && allowed.includes(origin);
}

/**
 * CSRF defence in depth for the cookie-authenticated endpoints (API-5), on top of SameSite=Strict.
 * A missing Origin is rejected too: browsers always send it on cross-site POSTs.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: readonly string[];

  constructor(config: ConfigService) {
    this.allowed = config.get("WEB_ORIGINS");
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isAllowedOrigin(request.headers.origin, this.allowed)) {
      throw new AppException(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, "Origin not allowed");
    }
    return true;
  }
}

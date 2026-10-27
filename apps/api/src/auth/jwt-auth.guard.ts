import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { AccessTokenService } from "./access-token.service.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

/** Global guard (APP_GUARD): every route needs a valid access token unless it is marked `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = await this.verify(request.headers.authorization);
    if (!claims) {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, "Unauthorized");
    }
    request.user = claims;
    return true;
  }

  private async verify(
    header: string | undefined,
  ): Promise<{ userId: string; sessionId: string } | null> {
    const [scheme, token, ...rest] = (header ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) return null;
    return this.tokens.verify(token);
  }
}

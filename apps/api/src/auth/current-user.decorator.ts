import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** The authenticated caller, taken from the access token only. */
export interface CurrentUserInfo {
  userId: string;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: CurrentUserInfo };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserInfo => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new Error("@CurrentUser() used on a route without authentication");
    return user;
  },
);

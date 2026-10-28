import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ApiErrors } from "../common/errors/api-errors.js";
import { ConfigService } from "../config/config.service.js";
import {
  AuthResponseDto,
  LoginDto,
  RegisterDto,
  UserDto,
  type AuthResponseBody,
  type UserBody,
} from "./auth.dto.js";
import { AuthService, type RequestMeta, type Session } from "./auth.service.js";
import { CurrentUser, type CurrentUserInfo } from "./current-user.decorator.js";
import { OriginGuard } from "./origin.guard.js";
import { Public } from "./public.decorator.js";
import { REFRESH_COOKIE_NAME, clearCookieOptions, refreshCookieOptions } from "./refresh-cookie.js";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieSecure = config.get("COOKIE_SECURE");
  }

  @Public()
  @Post("register")
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiErrors(409, 422, 429)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    return this.withCookie(res, await this.auth.register(dto, metaOf(req)));
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrors(401, 422, 429)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    return this.withCookie(res, await this.auth.login(dto, metaOf(req)));
  }

  @Public()
  @UseGuards(OriginGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("refreshCookie")
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrors(401, 403)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const session = await this.auth.refresh(cookieOf(req), metaOf(req));
    return this.withCookie(res, session);
  }

  @Public()
  @UseGuards(OriginGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth("refreshCookie")
  @ApiNoContentResponse()
  @ApiErrors(403)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(cookieOf(req));
    res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions(this.cookieSecure));
  }

  @Get("me")
  @ApiBearerAuth("bearerAuth")
  @ApiOkResponse({ type: UserDto })
  @ApiErrors(401)
  getMe(@CurrentUser() current: CurrentUserInfo): Promise<UserBody> {
    return this.auth.me(current.userId);
  }

  private withCookie(res: Response, session: Session): AuthResponseBody {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, refreshCookieOptions(this.cookieSecure));
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }
}

function cookieOf(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function metaOf(req: Request): RequestMeta {
  return { userAgent: req.headers["user-agent"], ip: req.ip };
}

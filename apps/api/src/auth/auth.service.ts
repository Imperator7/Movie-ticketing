import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, type AuthIdentity, type User } from "../generated/prisma/client.js";
import { AppException } from "../common/errors/app.exception.js";
import { ErrorCode } from "../common/errors/error-code.js";
import { ConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ACCESS_TOKEN_TTL_SECONDS, AccessTokenService } from "./access-token.service.js";
import type { LoginDto, RegisterDto, UserBody } from "./auth.dto.js";
import { loginMethods } from "./login-methods.js";
import { PasswordService } from "./password.service.js";
import {
  REFRESH_TOKEN_TTL_MS,
  decideRotation,
  generateRefreshToken,
  hashRefreshToken,
} from "./refresh-rotation.js";

export interface RequestMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: UserBody;
  /** The raw refresh token: goes into the cookie, never stored and never logged. */
  refreshToken: string;
}

interface LockedTokenRow {
  id: string;
  userId: string;
  familyId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

type RefreshOutcome =
  { kind: "rotated"; userId: string; familyId: string; refreshToken: string } | { kind: "invalid" };

const MAX_USER_AGENT_LENGTH = 512;

type UserWithIdentities = User & { authIdentities: Pick<AuthIdentity, "provider">[] };

export function toUserBody(user: UserWithIdentities): UserBody {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    preferredLocale: user.preferredLocale === "en" ? "en" : "th",
    loginMethods: loginMethods(user, user.authIdentities),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly pepper: string;
  private readonly reuseGraceMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    config: ConfigService,
  ) {
    this.pepper = config.get("REFRESH_TOKEN_PEPPER");
    this.reuseGraceMs = config.get("REFRESH_REUSE_GRACE_MS");
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<Session> {
    const passwordHash = await this.passwords.hash(dto.password);
    let user: UserWithIdentities;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
          phone: dto.phone ?? null,
          preferredLocale: dto.preferredLocale,
        },
        include: { authIdentities: { select: { provider: true } } },
      });
    } catch (error) {
      // The only unique constraint a new user can hit is users_email_uniq (the id is a fresh uuid).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          ErrorCode.EMAIL_ALREADY_USED,
          HttpStatus.CONFLICT,
          "This email is already registered",
        );
      }
      throw error;
    }
    return this.startSession(user, meta);
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<Session> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: { authIdentities: { select: { provider: true } } },
    });

    // Unknown email, or an account without a password (LINE only): same work, same answer.
    const ok =
      user?.passwordHash != null
        ? await this.passwords.verify(user.passwordHash, dto.password)
        : await this.passwords.verifyDummy(dto.password);
    if (!user || !ok) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
        "Invalid email or password",
      );
    }
    return this.startSession(user, meta);
  }

  /**
   * Rotates the refresh token. One transaction, with `SELECT ... FOR UPDATE` on the presented token's row, so
   * two requests with the same token are serialised: the first rotates, the second sees it revoked.
   * Presenting an already-revoked token revokes the whole family (theft detection, database-design §14).
   */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<Session> {
    if (!rawToken) throw this.refreshInvalid();
    const tokenHash = hashRefreshToken(rawToken, this.pepper);
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx): Promise<RefreshOutcome> => {
      const rows = await tx.$queryRaw<LockedTokenRow[]>`
        SELECT id, user_id AS "userId", family_id AS "familyId",
               revoked_at AS "revokedAt", expires_at AS "expiresAt"
        FROM refresh_tokens
        WHERE token_hash = ${tokenHash}
        FOR UPDATE`;
      const row = rows[0] ?? null;
      const decision = decideRotation(row, now, this.reuseGraceMs);

      if (!row || decision === "invalid" || decision === "concurrent") return { kind: "invalid" };

      if (decision === "reuse") {
        const revoked = await tx.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        // Security event. Ids and counts only, never token values.
        this.logger.warn({
          event: "refresh_token_reuse_detected",
          userId: row.userId,
          familyId: row.familyId,
          revokedTokens: revoked.count,
        });
        return { kind: "invalid" }; // committed: the family stays revoked
      }

      await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: now } });
      const successor = generateRefreshToken();
      await this.insertRefreshToken(tx, {
        userId: row.userId,
        familyId: row.familyId,
        token: successor,
        meta,
        now,
      });
      return {
        kind: "rotated",
        userId: row.userId,
        familyId: row.familyId,
        refreshToken: successor,
      };
    });

    if (outcome.kind === "invalid") throw this.refreshInvalid();

    const user = await this.prisma.user.findUnique({
      where: { id: outcome.userId },
      include: { authIdentities: { select: { provider: true } } },
    });
    if (!user) throw this.refreshInvalid();
    return this.buildSession(user, outcome.familyId, outcome.refreshToken);
  }

  /** Revokes this device's token only. Idempotent: unknown or already revoked tokens are fine. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken, this.pepper), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserBody> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { authIdentities: { select: { provider: true } } },
    });
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, "Unauthorized");
    }
    return toUserBody(user);
  }

  // ------------------------------------------------------------------ internals

  /** A new login = a new family. */
  private async startSession(user: UserWithIdentities, meta: RequestMeta): Promise<Session> {
    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    await this.insertRefreshToken(this.prisma, {
      userId: user.id,
      familyId,
      token: refreshToken,
      meta,
      now: new Date(),
    });
    return this.buildSession(user, familyId, refreshToken);
  }

  private async buildSession(
    user: UserWithIdentities,
    familyId: string,
    refreshToken: string,
  ): Promise<Session> {
    const accessToken = await this.accessTokens.sign({ userId: user.id, sessionId: familyId });
    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: toUserBody(user),
      refreshToken,
    };
  }

  private async insertRefreshToken(
    client: Pick<PrismaService, "refreshToken">,
    input: { userId: string; familyId: string; token: string; meta: RequestMeta; now: Date },
  ): Promise<void> {
    await client.refreshToken.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: hashRefreshToken(input.token, this.pepper),
        // The 7 days restart on every rotation.
        expiresAt: new Date(input.now.getTime() + REFRESH_TOKEN_TTL_MS),
        userAgent: input.meta.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
        ip: input.meta.ip && isIP(input.meta.ip) !== 0 ? input.meta.ip : null,
      },
    });
  }

  private refreshInvalid(): AppException {
    return new AppException(
      ErrorCode.REFRESH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED,
      "Refresh token is invalid or expired",
    );
  }
}

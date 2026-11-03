import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { AppException } from "../common/errors/app.exception.js";
import type { AccessTokenService } from "./access-token.service.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

const CLAIMS = { userId: "u1", sessionId: "s1" };

function setup(options: { isPublic?: boolean; authorization?: string; valid?: boolean }) {
  const request = { headers: { authorization: options.authorization } } as AuthenticatedRequest;
  const handler = (): void => undefined;
  const Controller = function Controller(): void {
    /* stands in for the controller class */
  };
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(options.isPublic) };
  const tokens = {
    verify: vi.fn().mockResolvedValue(options.valid === false ? null : CLAIMS),
  };
  const guard = new JwtAuthGuard(
    reflector as unknown as Reflector,
    tokens as unknown as AccessTokenService,
  );
  return { guard, context, request, reflector, tokens, handler, Controller };
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

describe("JwtAuthGuard", () => {
  it("lets @Public() routes through without looking at the token (method or class level)", async () => {
    const { guard, context, reflector, tokens, handler, Controller } = setup({ isPublic: true });
    expect(await guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [handler, Controller]);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it("puts the verified claims on the request", async () => {
    const { guard, context, request, tokens } = setup({ authorization: "Bearer abc.def.ghi" });
    expect(await guard.canActivate(context)).toBe(true);
    expect(tokens.verify).toHaveBeenCalledWith("abc.def.ghi");
    expect(request.user).toEqual(CLAIMS);
  });

  it("accepts the scheme in any case", async () => {
    const { guard, context } = setup({ authorization: "bearer abc" });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["an empty header", ""],
    ["another scheme", "Basic dXNlcjpwdw=="],
    ["a scheme without a token", "Bearer"],
    ["extra parts", "Bearer abc extra"],
  ])(
    "answers 401 UNAUTHORIZED for %s, without verifying anything",
    async (_name, authorization) => {
      const { guard, context, tokens } = setup({ authorization });
      const error = await rejection(guard.canActivate(context));
      expect(error.getStatus()).toBe(401);
      expect(tokens.verify).not.toHaveBeenCalled();
    },
  );

  it("answers 401 for a token that does not verify (expired, forged, wrong algorithm)", async () => {
    const { guard, context, request } = setup({ authorization: "Bearer bad", valid: false });
    const error = await rejection(guard.canActivate(context));
    expect(error.getStatus()).toBe(401);
    expect(request.user).toBeUndefined();
  });
});

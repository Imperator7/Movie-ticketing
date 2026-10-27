import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ZodValidationException } from "nestjs-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { createStrictDto } from "../validation/strict-dto.js";
import { AppException } from "./app.exception.js";
import { toErrorBody } from "./all-exceptions.filter.js";
import { ErrorCode } from "./error-code.js";

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test" });
}

describe("toErrorBody", () => {
  it("renders an AppException with its code, status and details", () => {
    const { body, unexpected } = toErrorBody(
      new AppException(ErrorCode.SEAT_TAKEN, 409, "Seat taken", { seatIds: ["a"] }),
    );

    expect(body).toEqual({
      statusCode: 409,
      code: "SEAT_TAKEN",
      message: "Seat taken",
      details: { seatIds: ["a"] },
    });
    expect(unexpected).toBe(false);
  });

  it("omits details when an AppException has none", () => {
    const { body } = toErrorBody(new AppException(ErrorCode.BOOKING_CLOSED, 409, "Closed"));

    expect(body).not.toHaveProperty("details");
  });

  it("maps Zod validation errors to 422 VALIDATION_FAILED with details.fields", () => {
    const Dto = createStrictDto({ email: z.email(), seats: z.array(z.string()).min(1) });
    const result = Dto.schema.safeParse({ email: "nope", seats: [], extra: 1 });
    expect(result.success).toBe(false);

    const { body, unexpected } = toErrorBody(new ZodValidationException(result.error));

    expect(body.statusCode).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    const fields = (body.details as { fields: { path: string }[] }).fields.map((f) => f.path);
    expect(fields).toEqual(expect.arrayContaining(["email", "seats", ""]));
    expect(unexpected).toBe(false);
  });

  it("rejects unknown keys through a strict DTO", () => {
    const Dto = createStrictDto({ name: z.string() });

    const result = Dto.schema.safeParse({ name: "x", isAdmin: true });

    expect(result.success).toBe(false);
  });

  it.each([
    [new UnauthorizedException("no token"), 401, "UNAUTHORIZED"],
    [new ForbiddenException("nope"), 403, "FORBIDDEN"],
    [new NotFoundException("Cannot GET /x"), 404, "NOT_FOUND"],
    [new HttpException("Too many", 429), 429, "RATE_LIMITED"],
    [new BadRequestException("bad json"), 400, "VALIDATION_FAILED"],
    [new HttpException("Payload too large", 413), 413, "VALIDATION_FAILED"],
  ])("maps Nest HttpException %# to %i %s", (exception, status, code) => {
    const { body, unexpected } = toErrorBody(exception);

    expect(body.statusCode).toBe(status);
    expect(body.code).toBe(code);
    expect(unexpected).toBe(false);
  });

  it("uses the message of an HttpException response object", () => {
    const { body } = toErrorBody(
      new BadRequestException({ message: ["a must be x", "b must be y"] }),
    );

    expect(body.message).toBe("a must be x; b must be y");
  });

  it("hides 5xx HttpException messages and flags them as unexpected", () => {
    const { body, unexpected } = toErrorBody(
      new InternalServerErrorException("db password is hunter2"),
    );

    expect(body).toEqual({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
    expect(unexpected).toBe(true);
  });

  it("maps Prisma P2002 to 409 with the INTERNAL_ERROR fallback code", () => {
    const { body } = toErrorBody(prismaError("P2002"));

    expect(body.statusCode).toBe(409);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("maps Prisma P2025 to 404 NOT_FOUND", () => {
    const { body, unexpected } = toErrorBody(prismaError("P2025"));

    expect(body).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect(unexpected).toBe(false);
  });

  it("maps any other Prisma error to a generic 500", () => {
    const { body, unexpected } = toErrorBody(prismaError("P1001"));

    expect(body).toEqual({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
    expect(unexpected).toBe(true);
  });

  it("maps unknown errors to a generic 500 that never leaks the message", () => {
    const { body, unexpected } = toErrorBody(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    expect(body).toEqual({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(unexpected).toBe(true);
  });

  it("handles non-Error throwables", () => {
    expect(toErrorBody("a string").body.statusCode).toBe(500);
    expect(toErrorBody(undefined).body.code).toBe("INTERNAL_ERROR");
  });
});

describe("ErrorCode", () => {
  it("has the 22 codes of the OpenAPI contract", () => {
    expect(Object.keys(ErrorCode)).toHaveLength(22);
    for (const [key, value] of Object.entries(ErrorCode)) expect(value).toBe(key);
  });
});

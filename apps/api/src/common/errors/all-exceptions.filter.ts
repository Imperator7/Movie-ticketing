import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { AppException } from "./app.exception.js";
import { ErrorCode, type ErrorBody } from "./error-code.js";

/** Maps a plain HTTP status (from a Nest HttpException) to a contract error code. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
    case 405:
      return ErrorCode.NOT_FOUND;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED;
  }
}

/** Key for errors on the request body as a whole (no field path). */
export const ROOT_FIELD = "_root";

/**
 * Contract shape (`docs/openapi.yaml`, ValidationError): `{ fields: { "<dot.path>": ["<issue code>", ...] } }`.
 * The web maps each field straight onto React Hook Form's `setError` and translates the codes.
 * Unknown keys (strict DTOs) are reported under their own name as `unrecognized_key`.
 */
export function zodFields(error: ZodError): { fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const add = (path: string, code: string) => {
    const key = path === "" ? ROOT_FIELD : path;
    const codes = (fields[key] ??= []);
    if (!codes.includes(code)) codes.push(code);
  };
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) add(path ? `${path}.${key}` : key, "unrecognized_key");
    } else {
      add(path, issue.code);
    }
  }
  return { fields };
}

function messageOf(response: string | object, fallback: string): string {
  if (typeof response === "string") return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map(String).join("; ");
  return fallback;
}

/** Pure mapping (no Express), so it is easy to test. Never leaks internals of unexpected errors. */
export function toErrorBody(exception: unknown): { body: ErrorBody; unexpected: boolean } {
  if (exception instanceof AppException) {
    const body: ErrorBody = {
      statusCode: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
    return { body, unexpected: false };
  }

  // Must come before HttpException: it extends BadRequestException.
  if (exception instanceof ZodValidationException) {
    const zodError = exception.getZodError();
    return {
      body: {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.VALIDATION_FAILED,
        message: "Validation failed",
        ...(zodError instanceof ZodError ? { details: zodFields(zodError) } : {}),
      },
      unexpected: false,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    // 5xx messages can carry internals, so show a generic one.
    const message =
      status >= 500
        ? "Internal server error"
        : messageOf(exception.getResponse(), exception.message);
    return {
      body: { statusCode: status, code: codeForStatus(status), message },
      unexpected: status >= 500,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === "P2002") {
      // Callers that know which constraint they hit should catch this and throw an AppException with a specific code.
      return {
        body: {
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.INTERNAL_ERROR,
          message: "Unique constraint violation",
        },
        unexpected: true,
      };
    }
    if (exception.code === "P2025") {
      return {
        body: {
          statusCode: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: "Resource not found",
        },
        unexpected: false,
      };
    }
  }

  return {
    body: {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
    },
    unexpected: true,
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { body, unexpected } = toErrorBody(exception);

    if (unexpected) {
      // Full detail goes to the logs only, never to the client.
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : `Non-error thrown: ${String(exception)}`,
      );
    }

    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    response.status(body.statusCode).json(body);
  }
}

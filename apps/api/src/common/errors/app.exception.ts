import { HttpException } from "@nestjs/common";
import type { ErrorCode } from "./error-code.js";

/** Throw this for every expected business error. The global filter renders it as the contract's `Error`. */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ErrorCode } from "./error-code.js";

/** The contract's `Error` schema, as documented in Swagger. */
export class ErrorDto extends createZodDto(
  z.object({
    statusCode: z.number().int(),
    code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
) {}

/** Documents error responses (all use the contract's `Error` body). Keep in step with docs/openapi.yaml. */
export function ApiErrors(...statuses: number[]): MethodDecorator & ClassDecorator {
  return applyDecorators(...statuses.map((status) => ApiResponse({ status, type: ErrorDto })));
}

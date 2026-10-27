import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Request DTO whose schema rejects unknown keys (the contract says bodies are strict).
 * Use it for every request body/query: `class RegisterDto extends createStrictDto({ email: z.email() }) {}`.
 */
export function createStrictDto<Shape extends z.ZodRawShape>(shape: Shape) {
  return createZodDto(z.strictObject(shape));
}

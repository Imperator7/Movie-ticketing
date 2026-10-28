import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** `components.schemas.HealthStatus` of docs/openapi.yaml. */
export const healthStatusSchema = z.object({
  status: z.enum(["ok", "error", "shutting_down"]),
  checks: z.record(z.string(), z.enum(["up", "down"])).optional(),
});

export class HealthStatusDto extends createZodDto(healthStatusSchema) {}

export type HealthStatus = z.infer<typeof healthStatusSchema>;

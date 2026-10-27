import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../auth/public.decorator.js";
import { HealthService, type HealthStatus } from "./health.service.js";

@Public()
@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** getLiveness: the process is up. */
  @Get("live")
  live(): HealthStatus {
    return this.health.liveness().body;
  }

  /** getReadiness: DB reachable and not draining. */
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const { httpStatus, body } = await this.health.readiness();
    res.status(httpStatus);
    return body;
  }
}

import { Controller, Get, Res } from "@nestjs/common";
import { ApiOkResponse, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../auth/public.decorator.js";
import { HealthStatusDto } from "./health.dto.js";
import { HealthService, type HealthStatus } from "./health.service.js";

@Public()
@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** getLiveness: the process is up. */
  @Get("live")
  @ApiOkResponse({ type: HealthStatusDto })
  getLiveness(): HealthStatus {
    return this.health.liveness().body;
  }

  /** getReadiness: DB reachable and not draining. */
  @Get("ready")
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiResponse({ status: 503, type: HealthStatusDto })
  async getReadiness(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const { httpStatus, body } = await this.health.readiness();
    res.status(httpStatus);
    return body;
  }
}

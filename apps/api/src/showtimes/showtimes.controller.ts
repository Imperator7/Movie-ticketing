import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator.js";
import { ApiErrors } from "../common/errors/api-errors.js";
import { UuidParamPipe } from "../common/validation/param-pipes.js";
import {
  SeatMapDto,
  ShowtimeDetailDto,
  type SeatMapBody,
  type ShowtimeDetailBody,
} from "./showtimes.dto.js";
import { ShowtimesService } from "./showtimes.service.js";

const showtimeIdParam = { name: "showtimeId", schema: { type: "string", format: "uuid" } } as const;

/** Public showtime detail and live seat map. Both stay `no-store`: the seat map is polled and must be fresh. */
@Public()
@ApiTags("Showtimes")
@Controller("showtimes")
export class ShowtimesController {
  constructor(private readonly showtimes: ShowtimesService) {}

  @Get(":showtimeId")
  @ApiParam(showtimeIdParam)
  @ApiOkResponse({ type: ShowtimeDetailDto })
  @ApiErrors(404)
  getShowtime(@Param("showtimeId", UuidParamPipe) showtimeId: string): Promise<ShowtimeDetailBody> {
    return this.showtimes.getShowtime(showtimeId);
  }

  @Get(":showtimeId/seats")
  @ApiParam(showtimeIdParam)
  @ApiOkResponse({ type: SeatMapDto })
  @ApiErrors(404)
  getSeatMap(@Param("showtimeId", UuidParamPipe) showtimeId: string): Promise<SeatMapBody> {
    return this.showtimes.getSeatMap(showtimeId);
  }
}

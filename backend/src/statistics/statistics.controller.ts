import { Controller, Get, Query } from "@nestjs/common";
import { CurrentActor } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ReservationsByAssetQueryDto } from "./statistics.dto.js";
import { StatisticsService } from "./statistics.service.js";

@Controller("statistics")
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get("reservations-by-asset")
  reservationsByAsset(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: ReservationsByAssetQueryDto,
  ) {
    return this.statistics.reservationsByAsset(actor, query);
  }
}

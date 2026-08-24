import { IsIn } from "class-validator";

export const STATISTICS_PERIODS = ["day", "week", "month", "year"] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

export class ReservationsByAssetQueryDto {
  @IsIn(STATISTICS_PERIODS)
  period!: StatisticsPeriod;
}

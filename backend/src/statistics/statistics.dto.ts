import { IsIn, IsISO8601, IsOptional } from "class-validator";

export const STATISTICS_PERIODS = ["day", "week", "month", "year"] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

export class ReservationsByAssetQueryDto {
  @IsIn(STATISTICS_PERIODS)
  period!: StatisticsPeriod;

  /** Any date inside the period to report on (`YYYY-MM-DD`, or a full
   * timestamp -- only its UTC calendar date is used). Omitted means the
   * period containing right now. */
  @IsOptional()
  @IsISO8601({ strict: true })
  anchor?: string;
}

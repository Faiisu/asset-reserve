import { IsISO8601 } from "class-validator";

export class ReservationsByAssetQueryDto {
  /** Inclusive start of the reporting window (`YYYY-MM-DD`, or a full
   * timestamp -- only its UTC calendar date is used). */
  @IsISO8601({ strict: true })
  start!: string;

  /** Inclusive end of the reporting window, same format as `start`. The
   * whole named day counts, so `end=2026-08-31` includes bookings up to
   * 2026-09-01T00:00:00Z. */
  @IsISO8601({ strict: true })
  end!: string;
}

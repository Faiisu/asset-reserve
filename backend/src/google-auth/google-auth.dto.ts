import { IsOptional, IsString } from "class-validator";

export class GoogleCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  /** Present when the user denied consent on Google's screen. */
  @IsOptional()
  @IsString()
  error?: string;
}

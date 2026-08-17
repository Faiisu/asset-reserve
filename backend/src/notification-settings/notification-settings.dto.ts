import { Transform } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateNotificationSettingsDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  smtpHost!: string;

  @IsInt()
  @Min(1)
  @Max(65_535)
  smtpPort!: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  smtpUser!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  fromEmail!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fromName!: string;

  // Omitted or blank -- keep the currently-saved App Password unchanged.
  // Present and non-blank -- replace it.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpPassword?: string;
}

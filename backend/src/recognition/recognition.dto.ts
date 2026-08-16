import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateRecognitionAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateEmailTemplateDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  bodyMarkdown!: string;
}

// Same shape as UpdateEmailTemplateDto today, kept as a separate class so
// the preview endpoint's validation can diverge later (e.g. previewing a
// shorter draft) without touching the save path's contract.
export class PreviewEmailTemplateDto extends UpdateEmailTemplateDto {}

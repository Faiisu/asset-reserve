import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}

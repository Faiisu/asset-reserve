import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class SearchPaginationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  search?: string;
}

export function parseOptionalBoolean(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}

export class ActiveFilterDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
  isURL,
} from "class-validator";

export function IsUrlOrPath(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isUrlOrPath",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (value === null || value === undefined) return true;
          if (typeof value !== "string") return false;
          const trimmed = value.trim();
          if (!trimmed) return true;
          if (
            trimmed.startsWith("/") ||
            trimmed.startsWith("data:image/") ||
            trimmed.startsWith("./") ||
            trimmed.startsWith("../")
          ) {
            return true;
          }
          return isURL(trimmed, { require_tld: false });
        },
        defaultMessage(_args: ValidationArguments) {
          return "$property must be a valid URL or path.";
        },
      },
    });
  };
}

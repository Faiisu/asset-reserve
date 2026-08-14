import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions.js";

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSION_KEYS, { each: true })
  permissions?: PermissionKey[];

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  SearchPaginationQueryDto,
  parseOptionalBoolean,
} from "../common/dto.js";

export class UserListQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;
}

export class CreateUserDto {
  // Login identifier only -- no email/name required up front. The user's
  // email and profile (name, picture) are populated later, once they link
  // their Google account (see google-auth.controller.ts's "connect"
  // callback), which is mandatory before they can otherwise use the app.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9._-]{3,50}$/, {
    message:
      "username must be 3-50 characters: letters, numbers, dots, underscores, or hyphens.",
  })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class AssignRoleDto {
  @IsUUID()
  roleId!: string;

  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  managementAreaId!: string | null;
}

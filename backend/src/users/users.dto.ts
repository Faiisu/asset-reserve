import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
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

export class CreateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  profilePictureUrl?: string | null;
}

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ValidateNested()
  @IsDefined()
  @Type(() => CreateProfileDto)
  profile!: CreateProfileDto;
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

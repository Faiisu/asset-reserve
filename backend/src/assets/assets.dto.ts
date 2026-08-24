import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  IsUrlOrPath,
  SearchPaginationQueryDto,
  parseOptionalBoolean,
} from "../common/dto.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export const ASSET_UNIT_STATUSES = [
  "ACTIVE",
  "RESERVED",
  "CHECKED_OUT",
  "BROKEN",
  "LOST",
  "IN_REPAIR",
  "INACTIVE",
] as const;
export type AssetUnitStatus = (typeof ASSET_UNIT_STATUSES)[number];

/** CHECKED_OUT is flow-managed; RESERVED remains read-only legacy compatibility. */
const MANUALLY_SETTABLE_UNIT_STATUSES = [
  "ACTIVE",
  "BROKEN",
  "LOST",
  "IN_REPAIR",
  "INACTIVE",
] as const;

export class AssetListQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class CreateAssetDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsUUID()
  managementAreaId!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  partNumber?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrlOrPath()
  @MaxLength(2048)
  pictureUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BatchCreateAssetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateAssetDto)
  items!: CreateAssetDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;
}

export class UpdateAssetDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsUUID()
  managementAreaId?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  partNumber?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrlOrPath()
  @MaxLength(2048)
  pictureUrl?: string | null;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class UpdateAssetStatusDto {
  @IsIn(["ACTIVE", "INACTIVE"])
  status!: "ACTIVE" | "INACTIVE";

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class BatchRemoveAssetItemDto {
  @IsUUID()
  assetId!: string;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class BatchRemoveAssetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchRemoveAssetItemDto)
  items!: BatchRemoveAssetItemDto[];
}

export class AssetUnitListQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @IsIn(ASSET_UNIT_STATUSES)
  status?: AssetUnitStatus;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class AssetUnitSearchQueryDto extends SearchPaginationQueryDto {}

export class RegisterAssetUnitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((entry) => (typeof entry === "string" ? entry.trim() : entry))
      : value,
  )
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  serialNumbers!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class RetireAssetUnitItemDto {
  @IsUUID()
  assetUnitId!: string;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class RetireAssetUnitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RetireAssetUnitItemDto)
  items!: RetireAssetUnitItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class UpdateAssetUnitStatusDto {
  @IsIn(MANUALLY_SETTABLE_UNIT_STATUSES)
  status!: (typeof MANUALLY_SETTABLE_UNIT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

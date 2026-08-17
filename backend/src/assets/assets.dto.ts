import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

export class AssetListQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["ACTIVE", "BROKEN", "LOST"])
  status?: "ACTIVE" | "BROKEN" | "LOST";

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
  @MaxLength(150)
  name!: string;

  @IsUUID()
  managementAreaId!: string;

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

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalQuantity!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["ACTIVE", "BROKEN", "LOST"])
  status?: "ACTIVE" | "BROKEN" | "LOST";
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
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsUUID()
  managementAreaId?: string;

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
  @IsIn(["ACTIVE", "BROKEN", "LOST"])
  status?: "ACTIVE" | "BROKEN" | "LOST";

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class UpdateAssetStatusDto {
  @IsIn(["ACTIVE", "BROKEN", "LOST", "INACTIVE"])
  status!: "ACTIVE" | "BROKEN" | "LOST" | "INACTIVE";

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

export class InventoryLineDto {
  @IsUUID()
  assetId!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class InventoryBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  items!: InventoryLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;
}
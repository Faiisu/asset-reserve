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
  @IsUUID()
  templateId?: string;

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
  @MaxLength(150)
  name!: string;

  @IsUUID()
  managementAreaId!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  assetTemplateId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  pictureUrl?: string | null;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalQuantity!: number;

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
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsUUID()
  managementAreaId?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  assetTemplateId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrl({ require_tld: false })
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

export class CreateAssetTemplateDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;
}

export class UpdateAssetTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class SaveAssetAsTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;
}

import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { SearchPaginationQueryDto, parseOptionalBoolean } from "../common/dto.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateReturnItemDto {
  @IsUUID()
  reservationItemId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityReturned: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityBroken: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityLost: number = 0;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  photoUrl?: string | null;
}

export class CreateReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  photoUrls?: string[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2_000)
  note?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  immediateApprove?: boolean;
}

export class DecideReturnItemDto {
  @IsUUID()
  reservationItemId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityReturned: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityBroken: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityLost: number = 0;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  photoUrl?: string | null;
}

export class ReturnDecisionDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecideReturnItemDto)
  items?: DecideReturnItemDto[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2_000)
  description?: string | null;
}

export class ReturnListQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @IsIn(["MINE", "APPROVALS", "ALL"])
  view: "MINE" | "APPROVALS" | "ALL" = "MINE";

  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "REJECTED", "COMPLETED"])
  status?: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;
}

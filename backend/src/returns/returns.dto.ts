import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  SearchPaginationQueryDto,
  parseOptionalBoolean,
} from "../common/dto.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateReturnItemDto {
  @IsUUID()
  reservationItemId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  reservationItemUnitIds!: string[];

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

export class DecideReturnItemUnitDto {
  @IsUUID()
  reservationItemUnitId!: string;

  @IsIn(["GOOD", "BROKEN", "LOST"])
  condition!: "GOOD" | "BROKEN" | "LOST";

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  photoUrl?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2_000)
  note?: string | null;
}

export class DecideReturnItemDto {
  @IsUUID()
  reservationItemId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecideReturnItemUnitDto)
  units?: DecideReturnItemUnitDto[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2_000)
  description?: string | null;
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

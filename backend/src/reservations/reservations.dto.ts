import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { SearchPaginationQueryDto } from "../common/dto.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const reservationStatuses = [
  "DRAFT",
  "PENDING_APPROVAL",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "DELIVERY_CONFIRMED",
  "RETURN_PENDING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export class ReservationListQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @IsIn(["MINE", "PARTICIPATING", "APPROVALS", "APPROVAL_HISTORY", "ALL"])
  view: "MINE" | "PARTICIPATING" | "APPROVALS" | "APPROVAL_HISTORY" | "ALL" =
    "MINE";

  @IsOptional()
  @IsIn(reservationStatuses)
  status?: (typeof reservationStatuses)[number];

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class ReservationItemInputDto {
  @IsUUID()
  assetId!: string;

  @IsInt()
  @Min(1)
  @Max(200)
  quantity!: number;
}

export class CreateReservationDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eventName!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsISO8601({ strict: true })
  startAt!: string;

  @IsISO8601({ strict: true })
  endAt!: string;

  @IsOptional()
  @IsIn(["DRAFT", "PENDING_APPROVAL"])
  status?: "DRAFT" | "PENDING_APPROVAL";

  // A reservation always reserves something -- §7.1 requires at least one
  // asset line, and there is no zero-item path that skips approval.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemInputDto)
  items!: ReservationItemInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  participantIds?: string[];
}

export class SubmitReservationDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

export class ReservationItemDecisionDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assetUnitIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comment?: string;
}

export class ReservationItemDecisionEntryDto {
  @IsUUID()
  reservationItemId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assetUnitIds?: string[];
}

export class ReservationItemsDecisionDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemDecisionEntryDto)
  items!: ReservationItemDecisionEntryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comment?: string;
}

export class CancelReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class ConfirmDeliveryItemDto {
  @IsUUID()
  reservationItemId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  reservationItemUnitIds?: string[];
}

export class ConfirmDeliveryDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConfirmDeliveryItemDto)
  items?: ConfirmDeliveryItemDto[];
}

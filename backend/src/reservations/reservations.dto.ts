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
  "RETURN_CONFIRMED",
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
  @Max(2_147_483_647)
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemInputDto)
  items?: ReservationItemInputDto[];

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
  @IsString()
  @MaxLength(2_000)
  comment?: string;
}

export class ReservationItemsDecisionDto extends ReservationItemDecisionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  itemIds!: string[];
}

export class CancelReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class PrepareReservationItemDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assetUnitIds!: string[];
}

export class ConfirmDeliveryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  itemIds?: string[];
}

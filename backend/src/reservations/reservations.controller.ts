import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentActor } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  CreateReservationChangeRequestDto,
  CreateReservationDto,
  ReservationChangeRequestDecisionDto,
  ReservationItemDecisionDto,
  ReservationItemsDecisionDto,
  SubmitReservationDto,
  ReservationListQueryDto,
} from "./reservations.dto.js";
import { ReservationsService } from "./reservations.service.js";

@Controller("reservations")
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: ReservationListQueryDto,
  ) {
    return this.reservations.list(actor, query);
  }

  @Post()
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateReservationDto,
  ) {
    return this.reservations.create(actor, input);
  }

  @Get(":reservationId")
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
  ) {
    return this.reservations.get(actor, reservationId);
  }

  @Post(":reservationId/submit")
  submit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Body() input: SubmitReservationDto,
  ) {
    return this.reservations.submit(actor, reservationId, input);
  }

  @Post(":reservationId/items/:itemId/decision")
  decideItem(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() input: ReservationItemDecisionDto,
  ) {
    return this.reservations.decideItem(actor, reservationId, itemId, input);
  }

  @Post(":reservationId/items/decision")
  decideItems(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Body() input: ReservationItemsDecisionDto,
  ) {
    return this.reservations.decideItems(actor, reservationId, input);
  }

  @Post(":reservationId/change-requests")
  requestChange(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Body() input: CreateReservationChangeRequestDto,
  ) {
    return this.reservations.requestChange(actor, reservationId, input);
  }

  @Post(":reservationId/change-requests/:changeRequestId/decision")
  decideChangeRequest(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Param("changeRequestId", new ParseUUIDPipe()) changeRequestId: string,
    @Body() input: ReservationChangeRequestDecisionDto,
  ) {
    return this.reservations.decideChangeRequest(
      actor,
      reservationId,
      changeRequestId,
      input,
    );
  }
}

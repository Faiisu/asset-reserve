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
  CreateReturnDto,
  ReturnDecisionDto,
  ReturnListQueryDto,
} from "./returns.dto.js";
import { ReturnsService } from "./returns.service.js";

@Controller()
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get("returns")
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: ReturnListQueryDto,
  ) {
    return this.returns.list(actor, query);
  }

  @Get("returns/:returnId")
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("returnId", new ParseUUIDPipe()) returnId: string,
  ) {
    return this.returns.get(actor, returnId);
  }

  @Post("reservations/:reservationId/returns")
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Body() input: CreateReturnDto,
  ) {
    return this.returns.create(actor, reservationId, input);
  }

  @Post("reservations/:reservationId/returns/:returnId/decision")
  decide(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reservationId", new ParseUUIDPipe()) reservationId: string,
    @Param("returnId", new ParseUUIDPipe()) returnId: string,
    @Body() input: ReturnDecisionDto,
  ) {
    return this.returns.decide(actor, reservationId, returnId, input);
  }
}

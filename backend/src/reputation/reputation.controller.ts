import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { CurrentActor, RequireGlobalAdmin } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { PaginationQueryDto, SearchPaginationQueryDto } from "../common/dto.js";
import { ReputationService } from "./reputation.service.js";

@Controller("reputation")
export class ReputationController {
  constructor(private readonly reputation: ReputationService) {}

  // Self-service routes -- any authenticated user, scoped to their own
  // record via @CurrentActor(), no admin permission required. Declared
  // ahead of the ":userId" routes below so "me" is never captured by
  // ParseUUIDPipe's param route instead (same rule users.controller.ts
  // follows for its own "me" routes).
  @Get("me")
  async getMine(@CurrentActor() actor: AuthenticatedActor) {
    const summary = await this.reputation.getForUser(actor.user.id);
    if (!summary) {
      throw new ApiException(404, "USER_NOT_FOUND", "User not found.");
    }
    return summary;
  }

  @Get("me/events")
  getMyEvents(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reputation.listEvents(actor.user.id, query);
  }

  @RequireGlobalAdmin()
  @Get()
  list(@Query() query: SearchPaginationQueryDto) {
    return this.reputation.listUsers(query);
  }

  @RequireGlobalAdmin()
  @Get(":userId")
  async getUser(@Param("userId", new ParseUUIDPipe()) userId: string) {
    const summary = await this.reputation.getForUser(userId);
    if (!summary) {
      throw new ApiException(404, "USER_NOT_FOUND", "User not found.");
    }
    return summary;
  }

  @RequireGlobalAdmin()
  @Get(":userId/events")
  getUserEvents(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reputation.listEvents(userId, query);
  }
}

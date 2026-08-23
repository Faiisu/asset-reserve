import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentActor,
  RequireAnyGlobalPermission,
  RequireAnyScopedPermission,
} from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { SearchPaginationQueryDto } from "../common/dto.js";
import {
  AssignRoleDto,
  ChangeMyPasswordDto,
  CreateUserDto,
  UpdateSelfDto,
  UpdateUserStatusDto,
  UserListQueryDto,
} from "./users.dto.js";
import { UsersService } from "./users.service.js";

const userAdministrationPermissions = [
  "user:create",
  "user:disable",
  "role:assign",
] as const;

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequireAnyGlobalPermission(...userAdministrationPermissions)
  @Get()
  list(@Query() query: UserListQueryDto) {
    return this.users.list(query);
  }

  // Participant lookup, declared ahead of the ":userId" routes so
  // "directory" is not captured by ParseUUIDPipe's param route. Open to
  // anyone who can create a reservation in any area -- picking a colleague
  // to add is part of composing one -- and returns far less than list().
  @RequireAnyScopedPermission("reservation:create")
  @Get("directory")
  directory(@Query() query: SearchPaginationQueryDto) {
    return this.users.directory(query);
  }

  @RequireAnyGlobalPermission("user:create")
  @Post()
  create(@Body() input: CreateUserDto) {
    return this.users.create(input);
  }

  // Self-service routes -- any authenticated user, scoped to their own
  // record via @CurrentActor(), no admin permission required. Declared
  // ahead of the ":userId" routes below so "me" is never captured by
  // ParseUUIDPipe's param route instead.
  @Patch("me")
  updateSelf(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: UpdateSelfDto,
  ) {
    return this.users.updateSelf(actor, input);
  }

  @Post("me/password")
  @HttpCode(204)
  changeMyPassword(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: ChangeMyPasswordDto,
  ) {
    return this.users.changeMyPassword(actor, input);
  }

  @RequireAnyGlobalPermission(...userAdministrationPermissions)
  @Get(":userId")
  get(@Param("userId", new ParseUUIDPipe()) userId: string) {
    return this.users.get(userId);
  }

  @RequireAnyGlobalPermission("user:disable")
  @Patch(":userId/status")
  updateStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(actor, userId, input);
  }

  @RequireAnyGlobalPermission("role:assign")
  @Post(":userId/role-assignments")
  assignRole(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() input: AssignRoleDto,
  ) {
    return this.users.assignRole(actor, userId, input);
  }

  @RequireAnyGlobalPermission("role:assign")
  @Delete(":userId/role-assignments/:assignmentId")
  @HttpCode(204)
  removeRole(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.users.removeRole(userId, assignmentId);
  }
}

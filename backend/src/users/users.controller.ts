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
} from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  AssignRoleDto,
  CreateUserDto,
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

  @RequireAnyGlobalPermission("user:create")
  @Post()
  create(@Body() input: CreateUserDto) {
    return this.users.create(input);
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

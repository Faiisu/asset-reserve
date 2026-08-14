import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from "@nestjs/common";
import { RequireGlobalAdmin } from "../auth/auth.decorators.js";
import { UpdateRoleDto } from "./access-control.dto.js";
import { AccessControlService } from "./access-control.service.js";

@Controller()
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  @Get("permissions")
  permissions() {
    return this.access.listPermissions();
  }

  @Get("roles")
  roles() {
    return this.access.listRoles();
  }

  @RequireGlobalAdmin()
  @Patch("roles/:roleId")
  updateRole(
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
    @Body() input: UpdateRoleDto,
  ) {
    return this.access.updateRole(roleId, input);
  }
}

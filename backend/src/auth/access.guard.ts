import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ApiException } from "../common/api-exception.js";
import {
  ACCESS_REQUIREMENT_KEY,
  type AccessRequirement,
} from "./auth.decorators.js";

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<AccessRequirement>(
      ACCESS_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    if (!actor)
      throw new ApiException(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
      );

    const permitted =
      requirement.kind === "globalAdmin"
        ? actor.roles.some(
            (role) => role.name === "ADMIN" && role.managementArea === null,
          )
        : requirement.permissions.some(
            (permission) =>
              actor.effectivePermissions.global.includes(permission) ||
              (requirement.kind === "anyScopedPermission" &&
                actor.effectivePermissions.byManagementArea.some((area) =>
                  area.permissions.includes(permission),
                )),
          );

    if (!permitted)
      throw new ApiException(
        403,
        "PERMISSION_DENIED",
        "You do not have permission to perform this action.",
      );
    return true;
  }
}

import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { PermissionKey } from "../access-control/permissions.js";
import type { AuthenticatedActor } from "./auth.types.js";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Exempts a route from AccountLinkGuard's mandatory-linking gate (see
// auth/account-link.guard.ts) -- for the Google/Microsoft auth routes
// themselves (or the gate could never be escaped), plus the handful of
// session-management routes a not-yet-linked user still needs (logout,
// "who am I", session check) so they aren't completely trapped.
export const SKIP_ACCOUNT_LINK_KEY = "skipAccountLinkCheck";
export const SkipAccountLinkCheck = () =>
  SetMetadata(SKIP_ACCOUNT_LINK_KEY, true);

export type AccessRequirement =
  | { kind: "globalAdmin" }
  | { kind: "anyGlobalPermission"; permissions: PermissionKey[] };

export const ACCESS_REQUIREMENT_KEY = "accessRequirement";
export const RequireGlobalAdmin = () =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: "globalAdmin",
  } satisfies AccessRequirement);
export const RequireAnyGlobalPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: "anyGlobalPermission",
    permissions,
  } satisfies AccessRequirement);

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    if (!actor)
      throw new Error("Authenticated actor is missing from the request.");
    return actor;
  },
);

import { appConfig } from "../config.js";
import {
  normalizePermissions,
  type PermissionKey,
} from "../access-control/permissions.js";
import type { AuthenticatedActor } from "./auth.types.js";

export type SessionSource = {
  id: string;
  username: string;
  email: string | null;
  isActive: boolean;
  profile: {
    name: string;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
  } | null;
  authIdentities: Array<{ provider: string }>;
  userRoles: Array<{
    id: string;
    role: { id: string; name: string; permissions: unknown };
    managementArea: { id: string; name: string } | null;
  }>;
};

export function buildSessionContext(source: SessionSource): AuthenticatedActor {
  if (!source.isActive)
    throw new Error("Cannot build an active session for an inactive user.");
  const roles = source.userRoles
    .map((assignment) => ({
      assignmentId: assignment.id,
      id: assignment.role.id,
      name: assignment.role.name,
      permissions: normalizePermissions(assignment.role.permissions),
      managementArea: assignment.managementArea,
    }))
    .sort((a, b) =>
      `${a.name}:${a.managementArea?.name ?? ""}`.localeCompare(
        `${b.name}:${b.managementArea?.name ?? ""}`,
      ),
    );

  const global = normalizePermissions(
    roles
      .filter((role) => !role.managementArea)
      .flatMap((role) => role.permissions),
  );
  const areaIds = [
    ...new Set(
      roles.flatMap((role) =>
        role.managementArea ? [role.managementArea.id] : [],
      ),
    ),
  ].sort();
  const byManagementArea = areaIds.map((managementAreaId) => ({
    managementAreaId,
    permissions: normalizePermissions([
      ...global,
      ...roles
        .filter((role) => role.managementArea?.id === managementAreaId)
        .flatMap((role) => role.permissions),
    ]) as PermissionKey[],
  }));

  return {
    user: {
      id: source.id,
      username: source.username,
      email: source.email,
      isActive: true,
      profile: source.profile,
      // Which external identity providers this user has linked -- the
      // mandatory-link gate (AccountLinkGuard) is satisfied by linking
      // ANY of them, not one specifically. Mirrors the shape
      // UsersService.userDetail()'s authProviders already uses for admin
      // display (users.service.ts), scoped here to just the OAuth
      // providers (no "password").
      linkedProviders: source.authIdentities.map(
        (identity) => identity.provider,
      ),
      accountLinkRequired: appConfig.requireAccountLink(),
    },
    roles,
    effectivePermissions: { global, byManagementArea },
  };
}

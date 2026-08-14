import {
  normalizePermissions,
  type PermissionKey,
} from "../access-control/permissions.js";
import type { AuthenticatedActor } from "./auth.types.js";

export type SessionSource = {
  id: string;
  email: string;
  isActive: boolean;
  profile: {
    name: string;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
  } | null;
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
      email: source.email,
      isActive: true,
      profile: source.profile,
    },
    roles,
    effectivePermissions: { global, byManagementArea },
  };
}

import type { PermissionKey } from "../access-control/permissions.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";

export function hasGlobalPermission(
  actor: AuthenticatedActor,
  permission: PermissionKey,
): boolean {
  return actor.effectivePermissions.global.includes(permission);
}

export function hasAreaPermission(
  actor: AuthenticatedActor,
  permission: PermissionKey,
  managementAreaId: string,
): boolean {
  return (
    actor.effectivePermissions.global.includes(permission) ||
    actor.effectivePermissions.byManagementArea.some(
      (area) =>
        area.managementAreaId === managementAreaId &&
        area.permissions.includes(permission),
    )
  );
}

export function assertAreaPermission(
  actor: AuthenticatedActor,
  permission: PermissionKey,
  managementAreaId: string,
): void {
  if (!hasAreaPermission(actor, permission, managementAreaId)) {
    throw new ApiException(
      403,
      "PERMISSION_DENIED",
      "You do not have permission in this asset's management area.",
    );
  }
}

export function permittedAreaIds(
  actor: AuthenticatedActor,
  permission: PermissionKey,
): string[] | null {
  if (actor.effectivePermissions.global.includes(permission)) return null;
  return actor.effectivePermissions.byManagementArea
    .filter((area) => area.permissions.includes(permission))
    .map((area) => area.managementAreaId);
}

export function hasAnyPermission(
  actor: AuthenticatedActor,
  permission: PermissionKey,
): boolean {
  return (
    actor.effectivePermissions.global.includes(permission) ||
    actor.effectivePermissions.byManagementArea.some((area) =>
      area.permissions.includes(permission),
    )
  );
}

export function assertAnyPermission(
  actor: AuthenticatedActor,
  permission: PermissionKey,
): void {
  if (!hasAnyPermission(actor, permission)) {
    throw new ApiException(
      403,
      "PERMISSION_DENIED",
      "You do not have permission to perform this action.",
    );
  }
}

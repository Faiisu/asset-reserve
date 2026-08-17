export const PERMISSION_CATALOG = [
  [
    "asset:create",
    "asset",
    "create",
    "Create assets within the permitted scope.",
  ],
  ["asset:view", "asset", "view", "View assets within the permitted scope."],
  [
    "asset:update",
    "asset",
    "update",
    "Update assets within the permitted scope.",
  ],
  [
    "asset:delete",
    "asset",
    "delete",
    "Deactivate or delete assets according to policy.",
  ],
  ["reservation:create", "reservation", "create", "Create reservations."],
  [
    "reservation:view",
    "reservation",
    "view",
    "View reservations created by other users (scoped to area or globally).",
  ],
  [
    "reservation:update",
    "reservation",
    "update",
    "Update reservations according to policy.",
  ],
  [
    "reservation:approve",
    "reservation",
    "approve",
    "Approve reservation items within scope.",
  ],
  [
    "reservation:reject",
    "reservation",
    "reject",
    "Reject reservation items within scope.",
  ],
  ["return:approve", "return", "approve", "Decide returns within scope."],
  ["user:create", "user", "create", "Create users."],
  ["user:disable", "user", "disable", "Activate or deactivate users."],
  ["role:assign", "role", "assign", "Assign or remove user roles."],
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number][0];
export const PERMISSION_KEYS = PERMISSION_CATALOG.map(
  ([key]) => key,
) as PermissionKey[];
export const PERMISSION_SET = new Set<string>(PERMISSION_KEYS);

export function normalizePermissions(value: unknown): PermissionKey[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is PermissionKey =>
          typeof item === "string" && PERMISSION_SET.has(item),
      ),
    ),
  ].sort();
}

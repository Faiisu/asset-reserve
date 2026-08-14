export type PermissionKey =
  | "asset:create"
  | "asset:view"
  | "asset:update"
  | "asset:delete"
  | "reservation:create"
  | "reservation:update"
  | "reservation:approve"
  | "reservation:reject"
  | "return:approve"
  | "user:create"
  | "user:disable"
  | "role:assign";

export type SessionContext = {
  user: {
    id: string;
    email: string;
    isActive: true;
    profile: {
      name: string;
      phoneNumber: string | null;
      profilePictureUrl: string | null;
    } | null;
  };
  roles: Array<{
    assignmentId: string;
    id: string;
    name: "ADMIN" | "MANAGER" | "USER";
    permissions: PermissionKey[];
    managementArea: { id: string; name: string } | null;
  }>;
  effectivePermissions: {
    global: PermissionKey[];
    byManagementArea: Array<{
      managementAreaId: string;
      permissions: PermissionKey[];
    }>;
  };
};

export type LoginResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  session: SessionContext;
};

export type PermissionDefinition = {
  key: PermissionKey;
  resource: string;
  action: string;
  description: string;
};

export type RoleDefinition = {
  id: string;
  name: "ADMIN" | "MANAGER" | "USER";
  description: string | null;
  permissions: PermissionKey[];
  createdAt: string;
  updatedAt: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
};

export type RequestDiagnostic = {
  id: number;
  method: string;
  path: string;
  status: number | null;
  statusText: string;
  durationMs: number;
  requestId: string | null;
  occurredAt: string;
  outcome: "success" | "error" | "network";
};

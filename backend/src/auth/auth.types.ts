import type { PermissionKey } from "../access-control/permissions.js";

export type ActorRole = {
  assignmentId: string;
  id: string;
  name: string;
  permissions: PermissionKey[];
  managementArea: { id: string; name: string } | null;
};

export type AuthenticatedActor = {
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
  roles: ActorRole[];
  effectivePermissions: {
    global: PermissionKey[];
    byManagementArea: Array<{
      managementAreaId: string;
      permissions: PermissionKey[];
    }>;
  };
};

declare module "fastify" {
  interface FastifyRequest {
    actor?: AuthenticatedActor;
  }
}

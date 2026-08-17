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
    username: string;
    email: string | null;
    isActive: true;
    profile: {
      name: string;
      phoneNumber: string | null;
      profilePictureUrl: string | null;
    } | null;
    /** Providers with a row in this user's authIdentities, e.g. ["google"]. */
    linkedProviders: string[];
    /** appConfig.requireAccountLink() at session-build time. */
    accountLinkRequired: boolean;
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

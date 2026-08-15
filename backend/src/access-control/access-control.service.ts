import { Injectable } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  PERMISSION_CATALOG,
  normalizePermissions,
  type PermissionKey,
} from "./permissions.js";

const REQUIRED_ADMIN_PERMISSIONS = ["user:disable", "role:assign"] as const;

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  listPermissions() {
    return {
      data: PERMISSION_CATALOG.map(([key, resource, action, description]) => ({
        key,
        resource,
        action,
        description,
      })),
    };
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({ orderBy: { name: "asc" } });
    return { data: roles.map((role) => this.roleDto(role)) };
  }

  async createRole(input: {
    name: string;
    description?: string | null;
    permissions: PermissionKey[];
  }) {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "Role name cannot be empty.",
        { name: "Role name is required." },
      );
    }

    const existing = await this.prisma.role.findFirst({
      where: { name: { equals: trimmedName, mode: "insensitive" } },
    });
    if (existing) {
      throw new ApiException(
        409,
        "ROLE_ALREADY_EXISTS",
        `A role named "${trimmedName}" already exists.`,
      );
    }

    const permissions = normalizePermissions(input.permissions);

    const created = await this.prisma.role.create({
      data: {
        id: crypto.randomUUID(),
        name: trimmedName.toUpperCase(),
        description: input.description?.trim() || null,
        permissions,
      },
    });

    return this.roleDto(created);
  }

  async updateRole(
    roleId: string,
    input: {
      description?: string | null;
      permissions?: PermissionKey[];
      expectedUpdatedAt: string;
    },
  ) {
    if (input.description === undefined && input.permissions === undefined) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "At least one editable field is required.",
        {
          description: "Provide description or permissions.",
        },
      );
    }
    const current = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!current)
      throw new ApiException(404, "ROLE_NOT_FOUND", "The role was not found.");

    const permissions = input.permissions
      ? normalizePermissions(input.permissions)
      : undefined;
    if (current.name === "ADMIN" && permissions) {
      const missing = REQUIRED_ADMIN_PERMISSIONS.filter(
        (key) => !permissions.includes(key),
      );
      if (missing.length) {
        throw new ApiException(
          422,
          "VALIDATION_ERROR",
          "The ADMIN role must retain required permissions.",
          {
            permissions: `Required permissions: ${missing.join(", ")}.`,
          },
        );
      }
    }

    const updated = await this.prisma.role.updateMany({
      where: { id: roleId, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(permissions ? { permissions } : {}),
        updatedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new ApiException(
        409,
        "STALE_WRITE",
        "The role has changed since it was loaded.",
      );
    }
    return this.roleDto(
      await this.prisma.role.findUniqueOrThrow({ where: { id: roleId } }),
    );
  }

  private roleDto(role: {
    id: string;
    name: string;
    description: string | null;
    permissions: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: normalizePermissions(role.permissions),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }
}

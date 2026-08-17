import { Injectable } from "@nestjs/common";
import { hash, verify } from "argon2";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import type {
  AssignRoleDto,
  ChangeMyPasswordDto,
  CreateUserDto,
  UpdateSelfDto,
  UpdateUserStatusDto,
  UserListQueryDto,
} from "./users.dto.js";

const roleAssignmentInclude = {
  role: true,
  managementArea: true,
  assignedByUser: { include: { profile: true } },
} as const;

const userDetailInclude = {
  profile: true,
  authIdentities: { select: { provider: true } },
  userRoles: {
    include: roleAssignmentInclude,
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type UserDetailRecord = Prisma.UserGetPayload<{
  include: typeof userDetailInclude;
}>;
type RoleAssignmentRecord = Prisma.UserRoleGetPayload<{
  include: typeof roleAssignmentInclude;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UserListQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const conditions: Prisma.UserWhereInput[] = [];
    if (query.isActive !== undefined)
      conditions.push({ isActive: query.isActive });
    if (query.search) {
      conditions.push({
        OR: [
          { username: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
          {
            profile: { name: { contains: query.search, mode: "insensitive" } },
          },
        ],
      });
    }
    if (query.roleId || query.areaId) {
      conditions.push({
        userRoles: {
          some: {
            ...(query.roleId ? { roleId: query.roleId } : {}),
            ...(query.areaId ? { managementAreaId: query.areaId } : {}),
          },
        },
      });
    }
    if (cursor) {
      conditions.push({
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      });
    }
    const where: Prisma.UserWhereInput = conditions.length
      ? { AND: conditions }
      : {};
    const rows = await this.prisma.user.findMany({
      where,
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        profile: true,
        userRoles: { include: { role: true } },
        _count: { select: { userRoles: true } },
      },
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.profile?.name ?? null,
        isActive: user.isActive,
        roleCount: user._count.userRoles,
        roles: [
          ...new Map(
            user.userRoles.map((assignment) => [
              assignment.role.id,
              { id: assignment.role.id, name: assignment.role.name },
            ]),
          ).values(),
        ],
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async create(input: CreateUserDto) {
    try {
      const userRole = await this.prisma.role.findUnique({
        where: { name: "USER" },
      });
      const user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          username: input.username,
          // No email or profile at creation time -- both are populated the
          // first time this user links their Google account (mandatory
          // before they can otherwise use the app; see google-auth's
          // "connect" callback).
          email: null,
          passwordHash: await hash(input.password, { type: 2 }),
          ...(userRole
            ? {
                userRoles: {
                  create: {
                    id: randomUUID(),
                    roleId: userRole.id,
                    managementAreaId: null,
                  },
                },
              }
            : {}),
        },
        include: userDetailInclude,
      });
      return this.userDetail(user);
    } catch (error) {
      if (this.prismaCode(error) === "P2002") {
        throw new ApiException(
          409,
          "USERNAME_ALREADY_EXISTS",
          "A user with this username already exists.",
        );
      }
      throw error;
    }
  }

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userDetailInclude,
    });
    if (!user)
      throw new ApiException(404, "USER_NOT_FOUND", "The user was not found.");
    return this.userDetail(user);
  }

  /**
   * Self-service profile edit: a user updating their own name/notification
   * email, independent of (and unaffected by) OAuth linking -- google-auth/
   * microsoft-auth only ever populate email when it's still null, so a
   * self-service value set here is never overwritten by a later link.
   */
  async updateSelf(actor: AuthenticatedActor, input: UpdateSelfDto) {
    const userId = actor.user.id;

    if (input.email !== undefined) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { email: input.email, updatedAt: new Date() },
        });
      } catch (error) {
        if (this.prismaCode(error) === "P2002") {
          throw new ApiException(
            409,
            "EMAIL_ALREADY_IN_USE",
            "This email is already in use by another account.",
          );
        }
        throw error;
      }
    }

    if (input.name !== undefined) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        update: { name: input.name, updatedAt: new Date() },
        create: { userId, name: input.name },
      });
    }

    return this.get(userId);
  }

  async changeMyPassword(actor: AuthenticatedActor, input: ChangeMyPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.user.id },
      select: { passwordHash: true },
    });
    const valid =
      !!user?.passwordHash &&
      (await verify(user.passwordHash, input.currentPassword).catch(() => false));
    if (!valid) {
      throw new ApiException(
        401,
        "INVALID_CURRENT_PASSWORD",
        "Current password is incorrect.",
      );
    }

    await this.prisma.user.update({
      where: { id: actor.user.id },
      data: {
        passwordHash: await hash(input.newPassword, { type: 2 }),
        updatedAt: new Date(),
      },
    });
  }

  async updateStatus(
    actor: AuthenticatedActor,
    userId: string,
    input: UpdateUserStatusDto,
  ) {
    if (!input.isActive && actor.user.id === userId) {
      throw new ApiException(
        409,
        "SELF_DEACTIVATION_NOT_ALLOWED",
        "You cannot deactivate your own account.",
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id: userId } });
        if (!target)
          throw new ApiException(
            404,
            "USER_NOT_FOUND",
            "The user was not found.",
          );
        if (!input.isActive && target.isActive)
          await this.assertNotLastGlobalAdmin(tx, userId);

        const result = await tx.user.updateMany({
          where: { id: userId, updatedAt: new Date(input.expectedUpdatedAt) },
          data: { isActive: input.isActive, updatedAt: new Date() },
        });
        if (result.count === 0) {
          throw new ApiException(
            409,
            "STALE_WRITE",
            "The user has changed since it was loaded.",
          );
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(userId);
  }

  async assignRole(
    actor: AuthenticatedActor,
    userId: string,
    input: AssignRoleDto,
  ) {
    const [user, role, area] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.prisma.role.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true },
      }),
      input.managementAreaId
        ? this.prisma.managementArea.findUnique({
            where: { id: input.managementAreaId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    if (!user)
      throw new ApiException(404, "USER_NOT_FOUND", "The user was not found.");
    if (!role)
      throw new ApiException(404, "ROLE_NOT_FOUND", "The role was not found.");
    if (input.managementAreaId && !area) {
      throw new ApiException(
        404,
        "MANAGEMENT_AREA_NOT_FOUND",
        "The management area was not found.",
      );
    }

    try {
      const assignment = await this.prisma.userRole.create({
        data: {
          id: randomUUID(),
          userId,
          roleId: role.id,
          managementAreaId: input.managementAreaId,
          assignedBy: actor.user.id,
        },
        include: {
          ...roleAssignmentInclude,
        },
      });
      return this.roleAssignment(assignment);
    } catch (error) {
      if (this.prismaCode(error) === "P2002") {
        throw new ApiException(
          409,
          "ROLE_ASSIGNMENT_ALREADY_EXISTS",
          "The user already has this role in the selected scope.",
        );
      }
      throw error;
    }
  }

  async removeRole(userId: string, assignmentId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const assignment = await tx.userRole.findFirst({
          where: { id: assignmentId, userId },
          include: { role: true, user: true },
        });
        if (!assignment) {
          throw new ApiException(
            404,
            "ROLE_ASSIGNMENT_NOT_FOUND",
            "The role assignment was not found.",
          );
        }
        if (
          assignment.role.name === "ADMIN" &&
          assignment.managementAreaId === null &&
          assignment.user.isActive
        ) {
          const count = await this.activeGlobalAdminCount(tx);
          if (count <= 1)
            throw new ApiException(
              409,
              "LAST_GLOBAL_ADMIN",
              "The last active global ADMIN cannot be removed.",
            );
        }
        await tx.userRole.delete({ where: { id: assignmentId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertNotLastGlobalAdmin(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const assignment = await tx.userRole.findFirst({
      where: { userId, managementAreaId: null, role: { name: "ADMIN" } },
      select: { id: true },
    });
    if (assignment && (await this.activeGlobalAdminCount(tx)) <= 1) {
      throw new ApiException(
        409,
        "LAST_GLOBAL_ADMIN",
        "The last active global ADMIN cannot be deactivated.",
      );
    }
  }

  private activeGlobalAdminCount(tx: Prisma.TransactionClient) {
    return tx.userRole.count({
      where: {
        managementAreaId: null,
        role: { name: "ADMIN" },
        user: { isActive: true },
      },
    });
  }

  private userDetail(user: UserDetailRecord) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      profile: user.profile
        ? {
            name: user.profile.name,
            phoneNumber: user.profile.phoneNumber,
            profilePictureUrl: user.profile.profilePictureUrl,
          }
        : null,
      authProviders: [
        ...new Set([
          ...(user.passwordHash ? ["password"] : []),
          ...user.authIdentities.map(
            (identity: { provider: string }) => identity.provider,
          ),
        ]),
      ].sort(),
      roleAssignments: user.userRoles.map((assignment) =>
        this.roleAssignment(assignment),
      ),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private roleAssignment(assignment: RoleAssignmentRecord) {
    return {
      id: assignment.id,
      userId: assignment.userId,
      role: { id: assignment.role.id, name: assignment.role.name },
      managementArea: assignment.managementArea
        ? {
            id: assignment.managementArea.id,
            name: assignment.managementArea.name,
          }
        : null,
      assignedBy: assignment.assignedByUser
        ? {
            id: assignment.assignedByUser.id,
            name: assignment.assignedByUser.profile?.name ?? null,
          }
        : null,
      createdAt: assignment.createdAt.toISOString(),
    };
  }

  private prismaCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  }
}

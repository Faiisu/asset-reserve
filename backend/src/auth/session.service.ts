import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { buildSessionContext } from "./session-context.js";

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async findSource(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        // Needed to compute AuthenticatedActor.user.linkedProviders --
        // which rows exist here is the single source of truth for
        // whether the mandatory-link gate (AccountLinkGuard) is satisfied.
        authIdentities: { select: { provider: true } },
        userRoles: {
          include: { role: true, managementArea: true },
        },
      },
    });
  }

  async findPasswordUser(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async getActor(userId: string) {
    const source = await this.findSource(userId);
    return source?.isActive ? buildSessionContext(source) : null;
  }
}

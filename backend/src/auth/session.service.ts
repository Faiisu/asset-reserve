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
        userRoles: {
          include: { role: true, managementArea: true },
        },
      },
    });
  }

  async findPasswordUser(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getActor(userId: string) {
    const source = await this.findSource(userId);
    return source?.isActive ? buildSessionContext(source) : null;
  }
}

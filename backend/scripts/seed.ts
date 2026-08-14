import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const roles = [
  {
    name: "ADMIN",
    description:
      "Administer users, roles, assets, reservations, and returns globally.",
    permissions: [
      "asset:create",
      "asset:view",
      "asset:update",
      "asset:delete",
      "reservation:create",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
      "return:approve",
      "user:create",
      "user:disable",
      "role:assign",
    ],
  },
  {
    name: "MANAGER",
    description: "Manage assets and workflows in assigned areas.",
    permissions: [
      "asset:create",
      "asset:view",
      "asset:update",
      "reservation:create",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
      "return:approve",
    ],
  },
  {
    name: "USER",
    description: "View assets and manage their own reservations.",
    permissions: ["asset:view", "reservation:create", "reservation:update"],
  },
] as const;

async function seed(): Promise<void> {
  for (const role of roles) {
    const existing = await prisma.role.findUnique({
      where: { name: role.name },
    });
    if (!existing) {
      await prisma.role.create({
        data: {
          id: randomUUID(),
          ...role,
          permissions: [...role.permissions].sort(),
        },
      });
    }
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin";
  if (!email || !password) {
    console.log(
      "Roles seeded. BOOTSTRAP_ADMIN_EMAIL/PASSWORD not set; admin creation skipped.",
    );
    return;
  }
  if (password.length < 12)
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.",
    );

  let user = await prisma.user.findUnique({ where: { email } });
  if (user && (!user.isActive || !user.passwordHash)) {
    throw new Error(
      "The bootstrap admin email belongs to an inactive or external-only user.",
    );
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        passwordHash: await hash(password, { type: 2 }),
        profile: { create: { name } },
      },
    });
  }

  const admin = await prisma.role.findUniqueOrThrow({
    where: { name: "ADMIN" },
  });
  const assignment = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: admin.id, managementAreaId: null },
  });
  if (!assignment) {
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        roleId: admin.id,
        managementAreaId: null,
        assignedBy: user.id,
      },
    });
  }
  console.log(`Roles and global admin ${email} are ready.`);
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}

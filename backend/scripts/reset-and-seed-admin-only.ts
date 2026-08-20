import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";

config({ path: join(import.meta.dirname, "../.env") });

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
      "reservation:view",
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
      "reservation:view",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
      "return:approve",
    ],
  },
  {
    name: "USER",
    description: "View assets and manage their own reservations.",
    // No reservation:view — regular users can only see their own reservations.
    permissions: ["asset:view", "reservation:create", "reservation:update"],
  },
] as const;

const initialAreas = [
  {
    name: "Human Resource",
    description: "Human Resource management and office assets.",
  },
  {
    name: "Application Engineer",
    description: "Application Engineer development tools and lab equipment.",
  },
  {
    name: "Marketing",
    description: "Marketing, event, and media production equipment.",
  },
  {
    name: "Warehouse",
    description: "Warehouse storage, logistics, and heavy handling equipment.",
  },
];

async function wipeDatabase(): Promise<void> {
  console.log("Wiping all existing database tables...");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "return_approvals",
      "return_items",
      "returns",
      "reservation_change_requests",
      "reservation_item_approvals",
      "reservation_items",
      "reservation_participants",
      "reservations",
      "assets",
      "user_roles",
      "management_areas",
      "user_auth_identities",
      "user_profiles",
      "users",
      "roles"
    CASCADE;
  `);
  console.log("All tables successfully cleared.");
}

function cleanUploads(): void {
  const uploadsDir = join(process.cwd(), "uploads", "assets");
  if (existsSync(uploadsDir)) {
    const files = readdirSync(uploadsDir);
    for (const file of files) {
      if (file === ".gitkeep") continue;
      try {
        unlinkSync(join(uploadsDir, file));
      } catch (err) {
        console.warn(`Could not delete upload file ${file}:`, err);
      }
    }
    console.log(`Cleaned ${files.length} uploaded files in ${uploadsDir}.`);
  }
}

async function seedRoles(): Promise<void> {
  console.log("Creating standard roles...");
  for (const role of roles) {
    const permissions = [...role.permissions].sort();
    await prisma.role.create({
      data: {
        id: randomUUID(),
        name: role.name,
        description: role.description,
        permissions,
      },
    });
  }
  console.log("Roles (ADMIN, MANAGER, USER) created.");
}

async function seedAreasAndAccounts(): Promise<void> {
  const defaultPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || "00000000";
  const passwordHash = await hash(defaultPassword, { type: 2 });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "ADMIN" },
  });
  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "MANAGER" },
  });
  const userRole = await prisma.role.findUniqueOrThrow({
    where: { name: "USER" },
  });

  // 1. Create Admin
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com")
    .trim()
    .toLowerCase();
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin";

  console.log(`Creating Admin account: ${adminEmail}...`);
  const adminUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      username: adminEmail.split("@")[0]!,
      email: adminEmail,
      passwordHash,
      isActive: true,
      profile: {
        create: {
          name: adminName,
        },
      },
    },
  });

  await prisma.userRole.create({
    data: {
      id: randomUUID(),
      userId: adminUser.id,
      roleId: adminRole.id,
      managementAreaId: null,
      assignedBy: adminUser.id,
    },
  });
  // Default USER role for Admin
  await prisma.userRole.create({
    data: {
      id: randomUUID(),
      userId: adminUser.id,
      roleId: userRole.id,
      managementAreaId: null,
      assignedBy: adminUser.id,
    },
  });

  // 2. Create Management Areas
  console.log("Creating Management Areas...");
  const createdAreas: Record<string, string> = {};
  for (const area of initialAreas) {
    const record = await prisma.managementArea.create({
      data: {
        id: randomUUID(),
        name: area.name,
        description: area.description,
      },
    });
    createdAreas[area.name] = record.id;
    console.log(` - Management Area: ${area.name} (${record.id})`);
  }

  // 3. Create Managers and Assign Areas + Default USER Role
  const managerAccounts = [
    {
      email: "ae@example.com",
      name: "AE Manager",
      areaName: "Application Engineer",
    },
    {
      email: "mk@example.com",
      name: "Marketing Manager",
      areaName: "Marketing",
    },
    {
      email: "hr@example.com",
      name: "HR Manager",
      areaName: "Human Resource",
    },
    {
      email: "wh@example.com",
      name: "Warehouse Manager",
      areaName: "Warehouse",
    },
  ];

  for (const mgr of managerAccounts) {
    console.log(
      `Creating Manager account: ${mgr.email} for ${mgr.areaName}...`,
    );
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        username: mgr.email.split("@")[0]!,
        email: mgr.email,
        passwordHash,
        isActive: true,
        profile: {
          create: {
            name: mgr.name,
          },
        },
      },
    });

    // Area Manager assignment
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        roleId: managerRole.id,
        managementAreaId: createdAreas[mgr.areaName],
        assignedBy: adminUser.id,
      },
    });

    // Default USER role assignment
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        roleId: userRole.id,
        managementAreaId: null,
        assignedBy: adminUser.id,
      },
    });
  }

  // 4. Create General Users (user1 and user2)
  const generalUsers = [
    { email: "user1@example.com", name: "User One" },
    { email: "user2@example.com", name: "User Two" },
  ];

  for (const u of generalUsers) {
    console.log(`Creating General User: ${u.email}...`);
    const createdUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        username: u.email.split("@")[0]!,
        email: u.email,
        passwordHash,
        isActive: true,
        profile: {
          create: {
            name: u.name,
          },
        },
      },
    });

    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: createdUser.id,
        roleId: userRole.id,
        managementAreaId: null,
        assignedBy: adminUser.id,
      },
    });
  }

  console.log("\n=========================================");
  console.log("DATABASE RESET & SEED SUMMARY:");
  console.log("Management Areas:");
  console.log("  1. Human Resource");
  console.log("  2. Application Engineer");
  console.log("  3. Marketing");
  console.log("  4. Warehouse");
  console.log("\nAccounts (Password: " + defaultPassword + "):");
  console.log("  - admin@example.com -> Role: ADMIN (Global)");
  console.log("  - ae@example.com    -> Role: MANAGER (Application Engineer)");
  console.log("  - mk@example.com    -> Role: MANAGER (Marketing)");
  console.log("  - hr@example.com    -> Role: MANAGER (Human Resource)");
  console.log("  - wh@example.com    -> Role: MANAGER (Warehouse)");
  console.log("  - user1@example.com -> Role: USER (General)");
  console.log("  - user2@example.com -> Role: USER (General)");
  console.log("=========================================");
}

async function main() {
  try {
    await wipeDatabase();
    cleanUploads();
    await seedRoles();
    await seedAreasAndAccounts();
  } catch (error) {
    console.error("Error resetting database:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

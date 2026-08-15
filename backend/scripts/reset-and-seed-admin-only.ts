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
      "asset_transactions",
      "asset_transaction_batches",
      "assets",
      "asset_templates",
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

async function seedAdmin(): Promise<void> {
  const email = (
    process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com"
  ).trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "00000000";
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin";

  console.log(`Creating Bootstrap Admin account: ${email}...`);
  const passwordHash = await hash(password, { type: 2 });
  const adminUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      passwordHash,
      isActive: true,
      profile: {
        create: {
          name,
        },
      },
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "ADMIN" },
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

  console.log(`Global admin created: ${email}`);
}

async function main() {
  try {
    await wipeDatabase();
    cleanUploads();
    await seedRoles();
    await seedAdmin();
    console.log("\nDatabase reset complete! Only 1 Admin user exists.");
  } catch (error) {
    console.error("Error resetting database:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

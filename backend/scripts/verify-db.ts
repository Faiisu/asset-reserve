import { config } from "dotenv";
import { join } from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: join(import.meta.dirname, "../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const users = await prisma.user.findMany({
    include: {
      profile: true,
      userRoles: { include: { role: true, managementArea: true } },
    },
  });
  const roles = await prisma.role.findMany({ select: { name: true, permissions: true } });
  const assets = await prisma.asset.count();
  const areas = await prisma.managementArea.count();
  const reservations = await prisma.reservation.count();
  const returns = await prisma.return.count();

  console.log("=========================================");
  console.log("DATABASE STATUS VERIFICATION");
  console.log("=========================================");
  console.log(`Users count:        ${users.length}`);
  for (const user of users) {
    console.log(` - Email: ${user.email} (${user.profile?.name ?? "No profile"})`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   Roles:  ${user.userRoles.map((r) => r.role.name).join(", ")}`);
  }
  console.log(`Roles count:        ${roles.length} (${roles.map((r) => r.name).join(", ")})`);
  console.log(`Assets count:       ${assets}`);
  console.log(`Areas count:        ${areas}`);
  console.log(`Reservations count: ${reservations}`);
  console.log(`Returns count:      ${returns}`);
  console.log("=========================================");
}

main().finally(() => prisma.$disconnect());

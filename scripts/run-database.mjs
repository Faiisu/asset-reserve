import { existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync, spawn } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const dbDir = join(rootDir, "deploy", "prod", "database");
const envFile = join(dbDir, ".env");
const envExampleFile = join(dbDir, ".env.example");
const composeFile = join(dbDir, "docker-compose.yml");

console.log("\n========================================");
console.log("  🐘 Starting Database (PostgreSQL Docker)");
console.log("========================================\n");

// 1. Ensure .env exists
if (!existsSync(envFile)) {
  if (existsSync(envExampleFile)) {
    copyFileSync(envExampleFile, envFile);
    console.log("📋 Created database/.env from database/.env.example");
  } else {
    console.warn("⚠️ Warning: database/.env.example not found.");
  }
} else {
  console.log("✓ database/.env found");
}

// 2. Check if Docker daemon is running
try {
  execSync("docker info", { stdio: "ignore" });
  console.log("✓ Docker daemon is running");
} catch (err) {
  console.error("\n❌ Error: Docker daemon is not running!");
  console.error("👉 Please start Docker Desktop and try running this command again.\n");
  process.exit(1);
}

// 3. Start database with docker compose
console.log("\n🚀 Starting PostgreSQL container via Docker Compose...");
try {
  execSync(`docker compose -f "${composeFile}" up -d`, {
    cwd: dbDir,
    stdio: "inherit",
  });
} catch (err) {
  console.error("❌ Failed to start database container:", err.message);
  process.exit(1);
}

// 4. Wait for database to be healthy
console.log("\n⏳ Waiting for PostgreSQL to be healthy and ready for connections...");
const maxAttempts = 30;
let isReady = false;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    const status = execSync(
      `docker compose -f "${composeFile}" ps --format json postgres`,
      { cwd: dbDir, encoding: "utf8" },
    );
    if (status.includes('"healthy"') || status.includes('"running"')) {
      // Test actual postgres readiness inside container
      try {
        execSync(
          `docker compose -f "${composeFile}" exec -T postgres pg_isready -U asset_reservation -d asset_reservation`,
          { cwd: dbDir, stdio: "ignore" },
        );
        isReady = true;
        break;
      } catch {
        // Still initializing database
      }
    }
  } catch {
    // Container might still be starting
  }
  process.stdout.write(`... waiting (${attempt}/${maxAttempts})\r`);
  execSync(process.platform === "win32" ? "timeout /t 1 >nul 2>&1 || ping 127.0.0.1 -n 2 >nul" : "sleep 1", { stdio: "ignore" });
}

if (isReady) {
  console.log("\n\n✅ PostgreSQL Database is UP and READY!");
  console.log("📌 Host: localhost");
  console.log("📌 Port: 5432");
  console.log("📌 Database: asset_reservation");
  console.log("📌 User: asset_reservation");
  // The password is whatever deploy/prod/database/.env holds, which can be
  // rotated independently of this script -- don't print a stale literal.
  console.log("📌 Password: see POSTGRES_PASSWORD in deploy/prod/database/.env");
  console.log("📌 Connection string: postgresql://asset_reservation:<POSTGRES_PASSWORD>@localhost:5432/asset_reservation?schema=public\n");
} else {
  console.warn("\n⚠️ Database container started, but healthcheck is still in progress.");
  console.log("It will be ready in a few seconds.\n");
}

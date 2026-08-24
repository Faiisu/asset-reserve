import { existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync, spawn } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const backendDir = join(rootDir, "backend");
const envFile = join(backendDir, ".env");
const envExampleFile = join(backendDir, ".env.example");
const nodeModulesDir = join(backendDir, "node_modules");

console.log("\n========================================");
console.log("  ⚙️  Starting Backend (NestJS / Fastify Dev)");
console.log("========================================\n");

// 1. Ensure backend/.env exists
if (!existsSync(envFile)) {
  if (existsSync(envExampleFile)) {
    copyFileSync(envExampleFile, envFile);
    console.log("📋 Created backend/.env from backend/.env.example");
  } else {
    console.warn("⚠️ Warning: backend/.env.example not found.");
  }
} else {
  console.log("✓ backend/.env found");
}

// 2. Ensure node_modules exist
if (!existsSync(nodeModulesDir)) {
  console.log("📦 Installing backend dependencies (npm install)...");
  execSync("npm install", { cwd: backendDir, stdio: "inherit" });
} else {
  console.log("✓ backend dependencies installed");
}

// 3. Bundle OpenAPI contract
console.log("📄 Bundling OpenAPI specifications...");
try {
  execSync("npm run predev", { cwd: backendDir, stdio: "inherit" });
} catch (err) {
  console.warn("⚠️ Warning: OpenAPI bundle failed, continuing anyway:", err.message);
}

// 4. Generate Prisma Client
console.log("💎 Generating Prisma client...");
try {
  execSync("npx prisma generate", { cwd: backendDir, stdio: "inherit" });
} catch (err) {
  console.warn("⚠️ Warning: Prisma generate failed:", err.message);
}

// 5. Try applying migrations if postgres is accessible
console.log("🔄 Applying database migrations...");
let schemaReady = false;
try {
  // migrate deploy, not db push: the EXCLUDE constraint that rejects
  // overlapping serial assignments, the status CHECK constraints, the partial
  // unique indexes and the assignment-window triggers exist only in the
  // migration SQL -- Prisma schema language cannot express them. A pushed
  // database therefore looks fine and silently enforces none of them, so dev
  // would stop catching what production rejects.
  execSync("npx prisma migrate deploy", {
    cwd: backendDir,
    stdio: "pipe",
    timeout: 120000,
  });
  schemaReady = true;
  console.log("✓ Database migrations applied.");
} catch (err) {
  const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  if (output.includes("P3005") || output.includes("P3009")) {
    // P3005: tables exist with no migration history at all. P3009: a migration
    // is recorded as failed. Both are the signature of a database the old
    // `prisma db push` flow kept alive past a migration it never ran, so its
    // tables look right while the CHECK/EXCLUDE constraints are missing.
    console.log("⚠️ This database drifted from the migration history (old `prisma db push`");
    console.log("   flow). Its tables look right, but constraints are missing.");
    console.log("   Recreate it (dev data is disposable):");
    console.log("   docker compose -f deploy/prod/database/docker-compose.yml down -v && npm run db:up");
  } else {
    console.log("ℹ️ Migrations skipped (PostgreSQL might still be starting or unreachable).");
  }
}

if (schemaReady) {
  try {
    console.log("🌱 Ensuring seed users and initial data are present...");
    execSync("npm run seed", {
      cwd: backendDir,
      stdio: "inherit",
      timeout: 60000,
    });
    console.log("✓ Seed users and data verified.");
  } catch {
    console.log("ℹ️ Seeding skipped.");
  }
}

// 6. Start backend development server
console.log("\n🚀 Starting Backend in dev mode on http://localhost:3000 ...");
console.log("📖 API Docs (Swagger): http://localhost:3000/api/docs\n");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCmd, ["run", "dev"], {
  cwd: backendDir,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});

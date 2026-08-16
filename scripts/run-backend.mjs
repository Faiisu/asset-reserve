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

// 5. Try syncing database schema if postgres is accessible
console.log("🔄 Checking database schema synchronization...");
try {
  execSync("npx prisma db push --skip-generate", {
    cwd: backendDir,
    stdio: "inherit",
    timeout: 10000,
  });
  console.log("✓ Database schema synchronized successfully.");
} catch (err) {
  console.log("ℹ️ Database sync skipped (PostgreSQL might still be starting or unreachable).");
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

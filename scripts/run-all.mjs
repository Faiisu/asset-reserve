import { existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync, spawn } from "node:child_process";
import readline from "node:readline";

const rootDir = resolve(import.meta.dirname, "..");
const dbDir = join(rootDir, "database");
const backendDir = join(rootDir, "backend");
const frontendDir = join(rootDir, "frontend");

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
};

console.log(`
${colors.bold}${colors.cyan}====================================================${colors.reset}
${colors.bold}${colors.cyan}   🚀 ASSET RESERVATION SYSTEM - DEV ENVIRONMENT    ${colors.reset}
${colors.bold}${colors.cyan}====================================================${colors.reset}
`);

// -----------------------------------------------------------------------------
// STEP 1: Verify Environment Files
// -----------------------------------------------------------------------------
console.log(`${colors.bold}[1/5] Checking Environment Configuration (.env files)...${colors.reset}`);

function ensureEnv(dir, name) {
  const envPath = join(dir, ".env");
  const envExamplePath = join(dir, ".env.example");
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      copyFileSync(envExamplePath, envPath);
      console.log(`  ${colors.green}✓${colors.reset} Created ${name}/.env from .env.example`);
    } else {
      console.log(`  ${colors.yellow}⚠️${colors.reset} Missing ${name}/.env and no .env.example found`);
    }
  } else {
    console.log(`  ${colors.green}✓${colors.reset} ${name}/.env is ready`);
  }
}

ensureEnv(dbDir, "database");
ensureEnv(backendDir, "backend");
ensureEnv(frontendDir, "frontend");

// -----------------------------------------------------------------------------
// STEP 2: Verify Dependencies
// -----------------------------------------------------------------------------
console.log(`\n${colors.bold}[2/5] Checking Dependencies (node_modules)...${colors.reset}`);

function ensureDependencies(dir, name) {
  if (!existsSync(join(dir, "node_modules"))) {
    console.log(`  📦 Installing dependencies for ${name}...`);
    execSync("npm install", { cwd: dir, stdio: "inherit" });
  } else {
    console.log(`  ${colors.green}✓${colors.reset} ${name} dependencies installed`);
  }
}

ensureDependencies(backendDir, "backend");
ensureDependencies(frontendDir, "frontend");

// -----------------------------------------------------------------------------
// STEP 3: Start Database (Docker Compose)
// -----------------------------------------------------------------------------
console.log(`\n${colors.bold}[3/5] Starting Database (PostgreSQL Docker Compose)...${colors.reset}`);

let dockerAvailable = false;
try {
  execSync("docker info", { stdio: "ignore" });
  dockerAvailable = true;
} catch {
  console.error(`  ${colors.red}❌ Error: Docker daemon is not running!${colors.reset}`);
  console.error(`  👉 Please start Docker Desktop to start the PostgreSQL database.`);
  console.error(`  ℹ️  If your database is already running externally, backend will try connecting to localhost:5432.\n`);
}

if (dockerAvailable) {
  const composeFile = join(dbDir, "docker-compose.yml");
  try {
    execSync(`docker compose -f "${composeFile}" up -d`, {
      cwd: dbDir,
      stdio: "inherit",
    });
    console.log(`  ${colors.green}✓${colors.reset} Docker container started`);

    console.log(`  ⏳ Waiting for PostgreSQL to be healthy...`);
    const maxAttempts = 30;
    let isReady = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        execSync(
          `docker compose -f "${composeFile}" exec -T postgres pg_isready -U asset_reservation -d asset_reservation`,
          { cwd: dbDir, stdio: "ignore" },
        );
        isReady = true;
        break;
      } catch {
        // Continue waiting
      }
      process.stdout.write(`  ... checking readiness (${attempt}/${maxAttempts})\r`);
      execSync(process.platform === "win32" ? "timeout /t 1 >nul 2>&1 || ping 127.0.0.1 -n 2 >nul" : "sleep 1", { stdio: "ignore" });
    }

    if (isReady) {
      console.log(`\n  ${colors.green}✅ PostgreSQL Database is healthy and ready on port 5432!${colors.reset}`);
    } else {
      console.log(`\n  ${colors.yellow}⚠️ Database container started; healthcheck continuing in background.${colors.reset}`);
    }
  } catch (err) {
    console.error(`  ${colors.red}❌ Failed to start docker compose:${colors.reset}`, err.message);
  }
}

// -----------------------------------------------------------------------------
// STEP 4: Build Contracts & Sync Prisma Schema
// -----------------------------------------------------------------------------
console.log(`\n${colors.bold}[4/5] Preparing Backend Contracts & Database Schema...${colors.reset}`);

try {
  console.log(`  📄 Bundling OpenAPI specifications...`);
  execSync("npm run predev", { cwd: backendDir, stdio: "ignore" });
  console.log(`  ${colors.green}✓${colors.reset} OpenAPI specifications bundled`);
} catch (err) {
  console.warn(`  ${colors.yellow}⚠️ Warning bundling OpenAPI:${colors.reset}`, err.message);
}

try {
  console.log(`  💎 Generating Prisma Client...`);
  execSync("npx prisma generate", { cwd: backendDir, stdio: "ignore" });
  console.log(`  ${colors.green}✓${colors.reset} Prisma client generated`);
} catch (err) {
  console.warn(`  ${colors.yellow}⚠️ Warning generating Prisma client:${colors.reset}`, err.message);
}

let schemaReady = false;
try {
  console.log(`  🔄 Applying database migrations (prisma migrate deploy)...`);
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
  console.log(`  ${colors.green}✓${colors.reset} Database migrations applied`);
} catch (err) {
  const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  if (output.includes("P3005") || output.includes("P3009")) {
    // P3005: tables exist with no migration history at all. P3009: a migration
    // is recorded as failed. Both are the signature of a database the old
    // `prisma db push` flow kept alive past a migration it never ran, so its
    // tables look right while the CHECK/EXCLUDE constraints are missing.
    console.log(`  ${colors.yellow}⚠️ This database drifted from the migration history (old \`prisma db push\` flow).${colors.reset}`);
    console.log(`  ${colors.dim}Its tables look right, but the CHECK/EXCLUDE constraints are missing.${colors.reset}`);
    console.log(`  ${colors.dim}Recreate it (dev data is disposable):${colors.reset} ${colors.cyan}docker compose -f database/docker-compose.yml down -v && npm run db:up${colors.reset}`);
  } else {
    console.log(`  ${colors.dim}ℹ️ Migrations skipped or database not yet reachable.${colors.reset}`);
  }
}

if (schemaReady) {
  try {
    console.log(`  🌱 Ensuring seed users and initial data are present...`);
    execSync("npm run seed", {
      cwd: backendDir,
      stdio: "ignore",
      timeout: 60000,
    });
    console.log(`  ${colors.green}✓${colors.reset} Seed users and data verified`);
  } catch {
    console.log(`  ${colors.dim}ℹ️ Seeding skipped.${colors.reset}`);
  }
}

// -----------------------------------------------------------------------------
// STEP 5: Launch Backend & Frontend Concurrently
// -----------------------------------------------------------------------------
console.log(`\n${colors.bold}[5/5] Launching Backend and Frontend in Development Mode...${colors.reset}`);
console.log(`
${colors.bold}📍 ACTIVE SERVICES:${colors.reset}
  🐘 ${colors.bold}Database:${colors.reset}  PostgreSQL on ${colors.cyan}localhost:5432${colors.reset}
  ⚙️  ${colors.bold}Backend:${colors.reset}   NestJS API on ${colors.green}http://localhost:3000${colors.reset}
  📖 ${colors.bold}API Docs:${colors.reset}  Swagger UI on ${colors.green}http://localhost:3000/api/docs${colors.reset}
  ⚡ ${colors.bold}Frontend:${colors.reset}  React / Vite on ${colors.magenta}http://localhost:5173${colors.reset}

${colors.dim}Press Ctrl+C at any time to stop all dev servers.${colors.reset}
${colors.dim}--------------------------------------------------------------------${colors.reset}
`);

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function prefixStream(stream, prefixColor, prefixText) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    console.log(`${prefixColor}[${prefixText}]${colors.reset} ${line}`);
  });
}

// Launch Backend
const backendProcess = spawn(npmCmd, ["run", "dev"], {
  cwd: backendDir,
  shell: true,
  env: { ...process.env, FORCE_COLOR: "1" },
});

if (backendProcess.stdout) prefixStream(backendProcess.stdout, colors.green, "BACKEND");
if (backendProcess.stderr) prefixStream(backendProcess.stderr, colors.red, "BACKEND");

// Launch Frontend
const frontendProcess = spawn(npmCmd, ["run", "dev"], {
  cwd: frontendDir,
  shell: true,
  env: { ...process.env, FORCE_COLOR: "1" },
});

if (frontendProcess.stdout) prefixStream(frontendProcess.stdout, colors.magenta, "FRONTEND");
if (frontendProcess.stderr) prefixStream(frontendProcess.stderr, colors.red, "FRONTEND");

// Cleanup handler
let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n\n${colors.yellow}🛑 Shutting down dev servers...${colors.reset}`);

  try {
    if (process.platform === "win32") {
      if (backendProcess.pid) execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: "ignore" });
      if (frontendProcess.pid) execSync(`taskkill /pid ${frontendProcess.pid} /T /F`, { stdio: "ignore" });
    } else {
      backendProcess.kill("SIGTERM");
      frontendProcess.kill("SIGTERM");
    }
  } catch {}

  console.log(`${colors.green}✓ Backend and Frontend dev processes stopped.${colors.reset}`);
  console.log(`${colors.dim}ℹ️ Note: Database container is still running in background. To stop it: npm run db:down${colors.reset}\n`);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

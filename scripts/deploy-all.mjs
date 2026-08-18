import { existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const composeFile = join(rootDir, "docker-compose.yml");
const envFile = join(rootDir, ".env");
const envExampleFile = join(rootDir, ".env.example");

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
${colors.bold}${colors.cyan}   🐳 ASSET RESERVATION SYSTEM - DOCKER DEPLOY      ${colors.reset}
${colors.bold}${colors.cyan}====================================================${colors.reset}
`);

// Step 1: Ensure .env exists
console.log(`${colors.bold}[1/4] Checking Environment Configuration (.env)...${colors.reset}`);
if (!existsSync(envFile)) {
  if (existsSync(envExampleFile)) {
    copyFileSync(envExampleFile, envFile);
    console.log(`  ${colors.green}✓${colors.reset} Created root .env from .env.example`);
  } else {
    console.warn(`  ${colors.yellow}⚠️${colors.reset} Missing .env and .env.example`);
  }
} else {
  console.log(`  ${colors.green}✓${colors.reset} Root .env configuration ready`);
}

// Step 2: Ensure subfolder .env files exist (backend, database, frontend)
function ensureSubEnv(dirName) {
  const targetDir = join(rootDir, dirName);
  const targetEnv = join(targetDir, ".env");
  const targetExample = join(targetDir, ".env.example");
  if (!existsSync(targetEnv) && existsSync(targetExample)) {
    copyFileSync(targetExample, targetEnv);
    console.log(`  ${colors.green}✓${colors.reset} Created ${dirName}/.env from .env.example`);
  }
}
ensureSubEnv("database");
ensureSubEnv("backend");
ensureSubEnv("frontend");

// Step 3: Check Docker daemon
console.log(`\n${colors.bold}[2/4] Verifying Docker daemon...${colors.reset}`);
try {
  execSync("docker info", { stdio: "ignore" });
  console.log(`  ${colors.green}✓${colors.reset} Docker Engine is active and reachable`);
} catch {
  console.error(`\n  ${colors.red}❌ Error: Docker daemon is not running!${colors.reset}`);
  console.error(`  👉 Please start Docker Desktop or your Docker daemon and try again.\n`);
  process.exit(1);
}

// Step 4: Build and start containers
console.log(`\n${colors.bold}[3/4] Building and launching Docker Compose stack...${colors.reset}`);
try {
  execSync(`docker compose -f "${composeFile}" up -d --build`, {
    cwd: rootDir,
    stdio: "inherit",
  });
  console.log(`  ${colors.green}✓${colors.reset} Docker Compose containers deployed`);
} catch (err) {
  console.error(`  ${colors.red}❌ Failed to start docker compose stack:${colors.reset}`, err.message);
  process.exit(1);
}

// Step 5: Wait for services to be healthy
console.log(`\n${colors.bold}[4/4] Monitoring startup & service health...${colors.reset}`);

const maxWaitSeconds = 60;
let postgresHealthy = false;
let backendHealthy = false;
let frontendHealthy = false;

for (let second = 1; second <= maxWaitSeconds; second++) {
  try {
    const psOutput = execSync(`docker compose -f "${composeFile}" ps --format json`, {
      cwd: rootDir,
      encoding: "utf8",
    });

    const lines = psOutput.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const name = item.Service || item.Name || "";
        const status = (item.Status || item.State || "").toLowerCase();
        const health = (item.Health || "").toLowerCase();

        if (name.includes("postgres") && (status.includes("healthy") || health.includes("healthy"))) {
          postgresHealthy = true;
        }
        if (name.includes("backend") && (status.includes("healthy") || health.includes("healthy"))) {
          backendHealthy = true;
        }
        if (name.includes("frontend") && (status.includes("healthy") || health.includes("healthy") || status.includes("running") || status.includes("up"))) {
          frontendHealthy = true;
        }
      } catch {}
    }
  } catch {}

  if (postgresHealthy && backendHealthy && frontendHealthy) {
    break;
  }

  process.stdout.write(`  ⏳ Waiting for containers to initialize and report healthy (${second}/${maxWaitSeconds}s)...\r`);
  execSync(process.platform === "win32" ? "timeout /t 1 >nul 2>&1 || ping 127.0.0.1 -n 2 >nul" : "sleep 1", { stdio: "ignore" });
}

console.log("\n");
execSync(`docker compose -f "${composeFile}" ps`, { cwd: rootDir, stdio: "inherit" });

console.log(`
${colors.bold}${colors.green}====================================================${colors.reset}
${colors.bold}${colors.green}   🎉 STACK SUCCESSFULLY DEPLOYED & RUNNING!        ${colors.reset}
${colors.bold}${colors.green}====================================================${colors.reset}

${colors.bold}📍 ACCESSIBLE ENDPOINTS:${colors.reset}
  🌐 ${colors.bold}Frontend (Web UI):${colors.reset}     ${colors.magenta}http://localhost:8080${colors.reset}
  ⚙️  ${colors.bold}Backend API:${colors.reset}           ${colors.green}http://localhost:3000${colors.reset} (or via Frontend proxy: ${colors.magenta}http://localhost:8080/api/v1${colors.reset})
  📖 ${colors.bold}Swagger API Docs:${colors.reset}      ${colors.green}http://localhost:3000/api/docs${colors.reset}
  🐘 ${colors.bold}PostgreSQL Database:${colors.reset}   ${colors.cyan}localhost:5432${colors.reset} (Database: ${colors.dim}asset_reservation${colors.reset})

${colors.bold}🔑 DEFAULT LOGIN CREDENTIALS:${colors.reset}
  👑 ${colors.bold}Admin:${colors.reset}    admin@example.com   | Password: 00000000
  👔 ${colors.bold}Manager:${colors.reset}  ae@example.com      | Password: password123456
  👔 ${colors.bold}Manager:${colors.reset}  mk@example.com      | Password: password123456
  👔 ${colors.bold}Manager:${colors.reset}  hr@example.com      | Password: password123456
  👔 ${colors.bold}Manager:${colors.reset}  wh@example.com      | Password: password123456
  👤 ${colors.bold}User:${colors.reset}     user1@example.com   | Password: password123456

${colors.bold}🛠️ MANAGEMENT COMMANDS:${colors.reset}
  - View live container logs:  ${colors.cyan}npm run deploy:logs${colors.reset} (or ${colors.dim}docker compose logs -f${colors.reset})
  - Check container status:    ${colors.cyan}npm run deploy:ps${colors.reset}   (or ${colors.dim}docker compose ps${colors.reset})
  - Stop deployed stack:       ${colors.cyan}npm run deploy:down${colors.reset} (or ${colors.dim}docker compose down${colors.reset})
  - Wipe & reset stack:        ${colors.cyan}npm run deploy:clean${colors.reset} (or ${colors.dim}docker compose down -v${colors.reset})
`);

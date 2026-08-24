import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const dbDir = join(rootDir, "deploy", "prod", "database");
const composeFile = join(dbDir, "docker-compose.yml");

console.log("\n========================================");
console.log("  🛑 Stopping Development Services");
console.log("========================================\n");

// Stop Docker database
try {
  console.log("🐘 Stopping Database Docker container...");
  execSync(`docker compose -f "${composeFile}" down`, {
    cwd: dbDir,
    stdio: "inherit",
  });
  console.log("✓ Database stopped successfully.");
} catch (err) {
  console.log("ℹ️ Docker compose down skipped or not running.");
}

console.log("\n✅ All development services stopped.\n");

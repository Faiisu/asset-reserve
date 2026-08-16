import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const composeFile = join(rootDir, "docker-compose.yml");

console.log("Stopping Docker Compose deployment stack...");
try {
  execSync(`docker compose -f "${composeFile}" down`, {
    cwd: rootDir,
    stdio: "inherit",
  });
  console.log("✓ Deployed stack stopped successfully.");
} catch (err) {
  console.error("Failed to stop docker stack:", err.message);
}

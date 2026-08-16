import { existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync, spawn } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const frontendDir = join(rootDir, "frontend");
const envFile = join(frontendDir, ".env");
const envExampleFile = join(frontendDir, ".env.example");
const nodeModulesDir = join(frontendDir, "node_modules");

console.log("\n========================================");
console.log("  ⚡ Starting Frontend (React / Vite Dev)");
console.log("========================================\n");

// 1. Ensure frontend/.env exists
if (!existsSync(envFile)) {
  if (existsSync(envExampleFile)) {
    copyFileSync(envExampleFile, envFile);
    console.log("📋 Created frontend/.env from frontend/.env.example");
  } else {
    console.warn("⚠️ Warning: frontend/.env.example not found.");
  }
} else {
  console.log("✓ frontend/.env found");
}

// 2. Ensure node_modules exist
if (!existsSync(nodeModulesDir)) {
  console.log("📦 Installing frontend dependencies (npm install)...");
  execSync("npm install", { cwd: frontendDir, stdio: "inherit" });
} else {
  console.log("✓ frontend dependencies installed");
}

// 3. Start frontend development server
console.log("\n🚀 Starting Frontend Vite dev server...");
console.log("🌐 URL: http://localhost:5173\n");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCmd, ["run", "dev"], {
  cwd: frontendDir,
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

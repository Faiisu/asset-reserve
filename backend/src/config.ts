import "dotenv/config";

function integer(name: string, fallback: number, minimum = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(
      `${name} must be an integer greater than or equal to ${minimum}.`,
    );
  }
  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export const appConfig = {
  port: integer("PORT", 3000),
  databaseUrl: () => required("DATABASE_URL"),
  databasePoolMax: integer("DATABASE_POOL_MAX", 10),
  databaseConnectionTimeoutMs: integer("DATABASE_CONNECTION_TIMEOUT_MS", 5_000),
  jwtSecret: () => {
    const secret = required("JWT_SECRET");
    if (secret.length < 32)
      throw new Error("JWT_SECRET must contain at least 32 characters.");
    return secret;
  },
  jwtAccessTtlSeconds: integer("JWT_ACCESS_TTL_SECONDS", 900),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "true",
};

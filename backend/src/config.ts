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
  // Internal-only asset recognition service (recognition-service/). Never
  // exposed to the browser directly -- the RecognitionModule is the sole
  // caller, so this stays a plain internal HTTP dependency, same posture as
  // the database connection.
  recognitionServiceUrl: (
    process.env.RECOGNITION_SERVICE_URL ?? "http://localhost:8000"
  ).replace(/\/$/, ""),
  // Outgoing email (Gmail SMTP + App Password), an optional feature: null
  // when unconfigured (SMTP_USER/SMTP_APP_PASSWORD both absent -- e.g. dev
  // or CI, EmailService just no-ops sends), throws if only one of the pair
  // is set (that's a misconfiguration, not "disabled"), else returns the
  // resolved settings. Evaluated once by EmailService's constructor.
  smtp: (): {
    host: string;
    port: number;
    user: string;
    appPassword: string;
    fromEmail: string;
    fromName: string;
  } | null => {
    const user = process.env.SMTP_USER?.trim();
    const appPassword = process.env.SMTP_APP_PASSWORD?.trim();
    const present = [user, appPassword].filter(Boolean).length;
    if (present === 0) return null;
    if (present < 2) {
      throw new Error(
        "SMTP_USER and SMTP_APP_PASSWORD must both be set together (or both left unset to disable email).",
      );
    }
    return {
      host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
      port: integer("SMTP_PORT", 465),
      user: user!,
      appPassword: appPassword!,
      fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || user!,
      fromName: process.env.SMTP_FROM_NAME?.trim() || "Advantech Asset Reservation",
    };
  },
};

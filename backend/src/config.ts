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
  // resolved settings. This is only the fallback path -- EmailService
  // prefers a NotificationSettings database row (settable through the
  // admin UI) when one exists, and only falls back to these env vars when
  // it doesn't. Read fresh on every call, not cached.
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
  // Key for encrypting secrets stored reversibly in the database (currently
  // just the SMTP App Password when set through the Notification settings
  // admin page -- see backend/src/common/secret-cipher.ts). Lazy/required:
  // only called by code paths that actually touch an encrypted secret, so
  // an app that never uses that feature never needs this env var set.
  tokenEncryptionKey: (): Buffer => {
    const key = Buffer.from(required("TOKEN_ENCRYPTION_KEY"), "base64");
    if (key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).");
    }
    return key;
  },
  // Google Sign-In / account linking, an optional feature (same "all set or
  // none set, else throws" shape as smtp()): null unless GOOGLE_CLIENT_ID,
  // GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI are all present.
  googleAuth: (): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } | null => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    const present = [clientId, clientSecret, redirectUri].filter(Boolean).length;
    if (present === 0) return null;
    if (present < 3) {
      throw new Error(
        "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must all be set together (or all left unset to disable Google sign-in).",
      );
    }
    return { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri! };
  },
  // The frontend's own origin, e.g. http://localhost:5173 -- only needed to
  // build the redirect target at the end of the Google OAuth callback, so
  // it's required (not optional) the moment googleAuth() is configured, but
  // otherwise unused.
  frontendBaseUrl: (): string => required("FRONTEND_BASE_URL").replace(/\/$/, ""),
  // Whether every user must link a Google account before using the app
  // (enforced by GoogleLinkGuard). Three effective states: Google not
  // configured -> always off (nothing to force-link to); Google configured
  // and this unset/anything but "false" -> on (the production default);
  // Google configured *and* explicitly set to "false" -> off (lets a
  // developer configure real Google OAuth locally to test the link flow
  // itself without every other login being blocked by it).
  requireGoogleLink: (): boolean =>
    appConfig.googleAuth() !== null && process.env.REQUIRE_GOOGLE_LINK !== "false",
};

-- Singleton settings row (always looked up/upserted by one fixed id, see
-- NOTIFICATION_SETTINGS_ID in notification-settings.service.ts) so an admin
-- can set the SMTP App Password EmailService sends through from the app
-- itself instead of only via env vars + redeploy.
CREATE TABLE "notification_settings" (
    "id" UUID NOT NULL,
    "smtp_host" VARCHAR(255) NOT NULL,
    "smtp_port" INTEGER NOT NULL,
    "smtp_user" VARCHAR(255) NOT NULL,
    "smtp_app_password_cipher" TEXT NOT NULL,
    "from_email" VARCHAR(255) NOT NULL,
    "from_name" VARCHAR(255) NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notification_settings"
    ADD CONSTRAINT "notification_settings_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Admin-configurable email templates: one row per situation (fixed keys --
-- "reservation_submitted", "reservation_decided", "return_decided", see
-- email-templates.constants.ts), not a generated id. No row for a situation
-- means EmailService falls back to the hardcoded default in
-- email/email-templates.ts, same "row overrides, absence falls back"
-- pattern already used by notification_settings.
CREATE TABLE "email_templates" (
    "situation" VARCHAR(50) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("situation")
);

ALTER TABLE "email_templates"
    ADD CONSTRAINT "email_templates_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

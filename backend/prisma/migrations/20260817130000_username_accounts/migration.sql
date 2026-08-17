-- Username accounts: admin-created users now start with just a username +
-- password (no email/name required up front). Email becomes nullable and
-- is only populated once a user links their Google account (see
-- google-auth.controller.ts's "connect" callback). Existing rows are
-- backfilled from their current email's local-part so already-seeded
-- accounts keep working with the same credentials.
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(50);

-- Backfill: derive from the email local-part, lowercased, with characters
-- outside CreateUserDto's accepted set ([a-z0-9._-]) stripped; de-duplicate
-- collisions (two different emails sharing a local-part) by appending a
-- numeric suffix to every row after the first, ordered by creation so the
-- oldest account keeps the unsuffixed name.
WITH candidates AS (
  SELECT
    "id",
    regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g') AS base,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g')
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "users"
)
UPDATE "users" u
SET "username" = CASE WHEN c.rn = 1 THEN c.base ELSE c.base || '-' || c.rn END
FROM candidates c
WHERE u."id" = c."id";

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");

-- Email is no longer required at account creation -- populated only once a
-- user links Google. The existing unique index tolerates multiple NULLs
-- under Postgres semantics, so no index change is needed here.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

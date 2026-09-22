ALTER TABLE "app_users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "google_sub" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "studio" text;
CREATE UNIQUE INDEX IF NOT EXISTS "app_users_google_sub_idx" ON "app_users" ("google_sub");
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "created_by_user_id" integer;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "created_by_name" text;
CREATE INDEX IF NOT EXISTS "tickets_creator_idx" ON "tickets" ("created_by_user_id");

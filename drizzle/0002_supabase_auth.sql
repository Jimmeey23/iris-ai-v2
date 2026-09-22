-- Move authentication to Supabase Auth.
-- Passwords and sessions now live in Supabase's auth schema; this database keeps
-- only the workspace profile and a link to the Supabase user id.
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "supabase_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_users_supabase_user_idx" ON "app_users" ("supabase_user_id");--> statement-breakpoint
ALTER TABLE "app_users" DROP COLUMN IF EXISTS "password_hash";--> statement-breakpoint
DROP TABLE IF EXISTS "auth_sessions";

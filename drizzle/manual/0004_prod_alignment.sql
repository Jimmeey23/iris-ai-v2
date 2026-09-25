-- ============================================================================
--  0004_prod_alignment.sql — run ONCE against an existing production database
--
--  Brings a database that was built by `drizzle-kit push`, the legacy
--  drizzle/legacy/000*.sql files and the ad-hoc scripts/legacy/*.mjs sync scripts
--  in line with src/db/schema.ts, then records drizzle/0000_baseline.sql as
--  applied so `npm run db:migrate` works from here on.
--
--  Idempotent: every statement is guarded (IF NOT EXISTS / catalog checks), so a
--  second run is a no-op. It runs in one transaction: any failure rolls back all
--  of it. See docs/MIGRATIONS.md for the procedure and verification queries.
--
--  GENERATED from drizzle/meta/0000_snapshot.json — do not hand-edit the column,
--  index or FK sections; regenerate them if the baseline changes.
-- ============================================================================

BEGIN;

-- Only this app's tables; never Supabase's auth/storage schemas.
SET LOCAL search_path = public;
-- Fail fast rather than queue behind a long-running query holding a lock.
SET LOCAL lock_timeout = '10s';

-- ----------------------------------------------------------------------------
-- 1. Tables that may not exist yet (e.g. ticket_drafts, asset_locations,
--    momence_action_receipts, rate_limits on an older database).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"supabase_user_id" uuid,
	"google_sub" text,
	"avatar_url" text,
	"role" text DEFAULT 'agent' NOT NULL,
	"staff_id" integer,
	"department" text,
	"studio" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "asset_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"studio" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"studio" text NOT NULL,
	"area" text,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"serial" text,
	"status" text DEFAULT 'in-service' NOT NULL,
	"status_note" text,
	"status_changed_at" timestamp with time zone,
	"fault_count" integer DEFAULT 0 NOT NULL,
	"last_fault_at" timestamp with time zone,
	"category" text,
	"manufacturer" text,
	"model" text,
	"asset_tag" text,
	"vendor" text,
	"location_id" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition" text,
	"image_url" text,
	"purchase_cost" numeric(12, 2),
	"warranty_until" timestamp with time zone,
	"notes" text,
	"acquired_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_url" text NOT NULL,
	"data" "bytea",
	"checksum" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'welcome' NOT NULL,
	"collected" jsonb NOT NULL,
	"missing" jsonb NOT NULL,
	"draft" jsonb,
	"ticket_id" integer,
	"ticket_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "delivery_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_secrets" text,
	"status" text DEFAULT 'not_configured' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "momence_action_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"studio" text,
	"performed_by" text NOT NULL,
	"performed_by_user_id" integer,
	"status" text DEFAULT 'synced' NOT NULL,
	"momence_ref" text DEFAULT '' NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "staff" (
	"id" integer PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"location" text NOT NULL,
	"manager" text,
	"studio_id" integer,
	"categories" jsonb NOT NULL,
	"avatar_color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_contact_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"contacted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_user_id" integer NOT NULL,
	"author_name" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"template_id" text,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_follow_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"note" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"owner_staff_id" integer,
	"owner_name" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_links" (
	"ticket_id" integer NOT NULL,
	"related_id" integer NOT NULL,
	"relation" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_links_ticket_id_related_id_pk" PRIMARY KEY("ticket_id","related_id")
);

CREATE TABLE IF NOT EXISTS "ticket_resolution_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_resolutions" (
	"ticket_id" integer PRIMARY KEY NOT NULL,
	"author_user_id" integer NOT NULL,
	"root_cause" text DEFAULT '' NOT NULL,
	"action_taken" text DEFAULT '' NOT NULL,
	"preventive_action" text DEFAULT '' NOT NULL,
	"member_outcome" text DEFAULT '' NOT NULL,
	"follow_up_at" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text NOT NULL,
	"severity" text NOT NULL,
	"sentiment" text,
	"studio" text,
	"class_format" text,
	"trainer" text,
	"membership" text,
	"incident_at" text,
	"member_name" text NOT NULL,
	"member_email" text,
	"member_phone" text,
	"momence_member_id" text,
	"preferred_contact" text,
	"requested_resolution" text,
	"assigned_staff_id" integer,
	"assigned_staff_name" text,
	"assigned_staff_email" text,
	"department_id" text,
	"department_name" text,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"sla_due_at" timestamp with time zone,
	"source" text DEFAULT 'iris' NOT NULL,
	"channel" text DEFAULT 'chat' NOT NULL,
	"tags" jsonb NOT NULL,
	"custom_fields" jsonb NOT NULL,
	"momence_context" jsonb,
	"template_id" text,
	"is_escalated" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'issue' NOT NULL,
	"resolution_required" boolean DEFAULT true NOT NULL,
	"momence_session_id" text,
	"source_ref" text,
	"submission_key" text,
	"impact" text,
	"asset_id" integer,
	"created_by_user_id" integer,
	"created_by_name" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);


-- ----------------------------------------------------------------------------
-- 2. Columns added to schema.ts after a table was first created.
--    NOT NULL columns without a default cannot be added to a populated table;
--    those are only checked, and reported with a WARNING if missing.
-- ----------------------------------------------------------------------------

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='value') THEN RAISE WARNING 'Missing NOT NULL column app_settings.value (type jsonb) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "updated_by" integer;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_users' AND column_name='email') THEN RAISE WARNING 'Missing NOT NULL column app_users.email (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_users' AND column_name='name') THEN RAISE WARNING 'Missing NOT NULL column app_users.name (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "supabase_user_id" uuid;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "google_sub" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'agent' NOT NULL;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "staff_id" integer;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "studio" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT True NOT NULL;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_locations' AND column_name='studio') THEN RAISE WARNING 'Missing NOT NULL column asset_locations.studio (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_locations' AND column_name='name') THEN RAISE WARNING 'Missing NOT NULL column asset_locations.name (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "asset_locations" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "asset_locations" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT True NOT NULL;
ALTER TABLE "asset_locations" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='studio') THEN RAISE WARNING 'Missing NOT NULL column assets.studio (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "area" text;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='type') THEN RAISE WARNING 'Missing NOT NULL column assets.type (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='label') THEN RAISE WARNING 'Missing NOT NULL column assets.label (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='name') THEN RAISE WARNING 'Missing NOT NULL column assets.name (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "serial" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'in-service' NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "status_note" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "fault_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "last_fault_at" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_tag" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "vendor" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "location_id" integer;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "quantity" integer DEFAULT 1 NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "condition" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "purchase_cost" numeric(12, 2);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "warranty_until" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "acquired_at" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_id" integer;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='actor_name') THEN RAISE WARNING 'Missing NOT NULL column audit_logs.actor_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='action') THEN RAISE WARNING 'Missing NOT NULL column audit_logs.action (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='entity') THEN RAISE WARNING 'Missing NOT NULL column audit_logs.entity (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "detail" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_attachments' AND column_name='session_id') THEN RAISE WARNING 'Missing NOT NULL column chat_attachments.session_id (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_attachments' AND column_name='file_name') THEN RAISE WARNING 'Missing NOT NULL column chat_attachments.file_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_attachments' AND column_name='file_type') THEN RAISE WARNING 'Missing NOT NULL column chat_attachments.file_type (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_attachments' AND column_name='file_size') THEN RAISE WARNING 'Missing NOT NULL column chat_attachments.file_size (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_attachments' AND column_name='storage_url') THEN RAISE WARNING 'Missing NOT NULL column chat_attachments.storage_url (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "data" bytea;
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "checksum" text;
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "uploaded_by" text;
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='session_id') THEN RAISE WARNING 'Missing NOT NULL column chat_messages.session_id (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='role') THEN RAISE WARNING 'Missing NOT NULL column chat_messages.role (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='content') THEN RAISE WARNING 'Missing NOT NULL column chat_messages.content (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "meta" jsonb;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "attachment_ids" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "phase" text DEFAULT 'welcome' NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_sessions' AND column_name='collected') THEN RAISE WARNING 'Missing NOT NULL column chat_sessions.collected (type jsonb) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_sessions' AND column_name='missing') THEN RAISE WARNING 'Missing NOT NULL column chat_sessions.missing (type jsonb) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "draft" jsonb;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "ticket_id" integer;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "ticket_number" text;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "owner_key" text;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_logs' AND column_name='integration_id') THEN RAISE WARNING 'Missing NOT NULL column delivery_logs.integration_id (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_logs' AND column_name='action') THEN RAISE WARNING 'Missing NOT NULL column delivery_logs.action (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "result" jsonb;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "delivery_logs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='departments' AND column_name='name') THEN RAISE WARNING 'Missing NOT NULL column departments.name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='departments' AND column_name='description') THEN RAISE WARNING 'Missing NOT NULL column departments.description (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT True NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='import_runs' AND column_name='source') THEN RAISE WARNING 'Missing NOT NULL column import_runs.source (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "import_runs" ADD COLUMN IF NOT EXISTS "imported" integer DEFAULT 0 NOT NULL;
ALTER TABLE "import_runs" ADD COLUMN IF NOT EXISTS "skipped" integer DEFAULT 0 NOT NULL;
ALTER TABLE "import_runs" ADD COLUMN IF NOT EXISTS "errors" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "import_runs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT False NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "encrypted_secrets" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'not_configured' NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='momence_action_receipts' AND column_name='action') THEN RAISE WARNING 'Missing NOT NULL column momence_action_receipts.action (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='momence_action_receipts' AND column_name='target_type') THEN RAISE WARNING 'Missing NOT NULL column momence_action_receipts.target_type (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='momence_action_receipts' AND column_name='target_id') THEN RAISE WARNING 'Missing NOT NULL column momence_action_receipts.target_id (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='momence_action_receipts' AND column_name='target_name') THEN RAISE WARNING 'Missing NOT NULL column momence_action_receipts.target_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='momence_action_receipts' AND column_name='summary') THEN RAISE WARNING 'Missing NOT NULL column momence_action_receipts.summary (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "momence_action_receipts" ADD COLUMN IF NOT EXISTS "details" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "momence_action_receipts" ADD COLUMN IF NOT EXISTS "studio" text;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='momence_action_receipts' AND column_name='performed_by') THEN RAISE WARNING 'Missing NOT NULL column momence_action_receipts.performed_by (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "momence_action_receipts" ADD COLUMN IF NOT EXISTS "performed_by_user_id" integer;
ALTER TABLE "momence_action_receipts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'synced' NOT NULL;
ALTER TABLE "momence_action_receipts" ADD COLUMN IF NOT EXISTS "momence_ref" text DEFAULT '' NOT NULL;
ALTER TABLE "momence_action_receipts" ADD COLUMN IF NOT EXISTS "performed_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "window_start" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='external_id') THEN RAISE WARNING 'Missing NOT NULL column staff.external_id (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='name') THEN RAISE WARNING 'Missing NOT NULL column staff.name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='email') THEN RAISE WARNING 'Missing NOT NULL column staff.email (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='role') THEN RAISE WARNING 'Missing NOT NULL column staff.role (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='department') THEN RAISE WARNING 'Missing NOT NULL column staff.department (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='location') THEN RAISE WARNING 'Missing NOT NULL column staff.location (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "manager" text;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "studio_id" integer;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='categories') THEN RAISE WARNING 'Missing NOT NULL column staff.categories (type jsonb) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='avatar_color') THEN RAISE WARNING 'Missing NOT NULL column staff.avatar_color (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT True NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_activities' AND column_name='ticket_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_activities.ticket_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_activities' AND column_name='actor_name') THEN RAISE WARNING 'Missing NOT NULL column ticket_activities.actor_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_activities' AND column_name='action') THEN RAISE WARNING 'Missing NOT NULL column ticket_activities.action (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_activities" ADD COLUMN IF NOT EXISTS "detail" text;
ALTER TABLE "ticket_activities" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_comments' AND column_name='ticket_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_comments.ticket_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_comments' AND column_name='author_name') THEN RAISE WARNING 'Missing NOT NULL column ticket_comments.author_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_comments' AND column_name='author_role') THEN RAISE WARNING 'Missing NOT NULL column ticket_comments.author_role (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_comments' AND column_name='body') THEN RAISE WARNING 'Missing NOT NULL column ticket_comments.body (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_comments" ADD COLUMN IF NOT EXISTS "is_internal" boolean DEFAULT True NOT NULL;
ALTER TABLE "ticket_comments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_contact_log' AND column_name='ticket_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_contact_log.ticket_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_contact_log' AND column_name='channel') THEN RAISE WARNING 'Missing NOT NULL column ticket_contact_log.channel (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_contact_log' AND column_name='outcome') THEN RAISE WARNING 'Missing NOT NULL column ticket_contact_log.outcome (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_contact_log" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
ALTER TABLE "ticket_contact_log" ADD COLUMN IF NOT EXISTS "contacted_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_contact_log' AND column_name='author_user_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_contact_log.author_user_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_contact_log' AND column_name='author_name') THEN RAISE WARNING 'Missing NOT NULL column ticket_contact_log.author_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_drafts' AND column_name='user_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_drafts.user_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_drafts' AND column_name='title') THEN RAISE WARNING 'Missing NOT NULL column ticket_drafts.title (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_drafts" ADD COLUMN IF NOT EXISTS "template_id" text;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_drafts' AND column_name='category') THEN RAISE WARNING 'Missing NOT NULL column ticket_drafts.category (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_drafts' AND column_name='subcategory') THEN RAISE WARNING 'Missing NOT NULL column ticket_drafts.subcategory (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_drafts" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "ticket_drafts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "ticket_drafts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_follow_ups' AND column_name='ticket_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_follow_ups.ticket_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_follow_ups' AND column_name='note') THEN RAISE WARNING 'Missing NOT NULL column ticket_follow_ups.note (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_follow_ups' AND column_name='due_at') THEN RAISE WARNING 'Missing NOT NULL column ticket_follow_ups.due_at (type timestamp with time zone) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_follow_ups" ADD COLUMN IF NOT EXISTS "owner_staff_id" integer;
ALTER TABLE "ticket_follow_ups" ADD COLUMN IF NOT EXISTS "owner_name" text DEFAULT '' NOT NULL;
ALTER TABLE "ticket_follow_ups" ADD COLUMN IF NOT EXISTS "done" boolean DEFAULT False NOT NULL;
ALTER TABLE "ticket_follow_ups" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_follow_ups' AND column_name='created_by_user_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_follow_ups.created_by_user_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_follow_ups' AND column_name='created_by_name') THEN RAISE WARNING 'Missing NOT NULL column ticket_follow_ups.created_by_name (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_follow_ups" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_links' AND column_name='ticket_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_links.ticket_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_links' AND column_name='related_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_links.related_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_links" ADD COLUMN IF NOT EXISTS "relation" text DEFAULT 'related' NOT NULL;
ALTER TABLE "ticket_links" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_resolution_steps' AND column_name='ticket_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_resolution_steps.ticket_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_resolution_steps' AND column_name='author_user_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_resolution_steps.author_user_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_resolution_steps' AND column_name='author_name') THEN RAISE WARNING 'Missing NOT NULL column ticket_resolution_steps.author_name (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_resolution_steps' AND column_name='body') THEN RAISE WARNING 'Missing NOT NULL column ticket_resolution_steps.body (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_resolution_steps" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_resolutions' AND column_name='author_user_id') THEN RAISE WARNING 'Missing NOT NULL column ticket_resolutions.author_user_id (type integer) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "ticket_resolutions" ADD COLUMN IF NOT EXISTS "root_cause" text DEFAULT '' NOT NULL;
ALTER TABLE "ticket_resolutions" ADD COLUMN IF NOT EXISTS "action_taken" text DEFAULT '' NOT NULL;
ALTER TABLE "ticket_resolutions" ADD COLUMN IF NOT EXISTS "preventive_action" text DEFAULT '' NOT NULL;
ALTER TABLE "ticket_resolutions" ADD COLUMN IF NOT EXISTS "member_outcome" text DEFAULT '' NOT NULL;
ALTER TABLE "ticket_resolutions" ADD COLUMN IF NOT EXISTS "follow_up_at" text;
ALTER TABLE "ticket_resolutions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='ticket_number') THEN RAISE WARNING 'Missing NOT NULL column tickets.ticket_number (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='title') THEN RAISE WARNING 'Missing NOT NULL column tickets.title (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='summary') THEN RAISE WARNING 'Missing NOT NULL column tickets.summary (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='description') THEN RAISE WARNING 'Missing NOT NULL column tickets.description (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='category') THEN RAISE WARNING 'Missing NOT NULL column tickets.category (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='subcategory') THEN RAISE WARNING 'Missing NOT NULL column tickets.subcategory (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='priority') THEN RAISE WARNING 'Missing NOT NULL column tickets.priority (type text) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='severity') THEN RAISE WARNING 'Missing NOT NULL column tickets.severity (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sentiment" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "studio" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "class_format" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "trainer" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "membership" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "incident_at" text;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='member_name') THEN RAISE WARNING 'Missing NOT NULL column tickets.member_name (type text) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "member_email" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "member_phone" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "momence_member_id" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "preferred_contact" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "requested_resolution" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assigned_staff_id" integer;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assigned_staff_name" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assigned_staff_email" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "department_id" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "department_name" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sla_hours" integer DEFAULT 24 NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sla_due_at" timestamp with time zone;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'iris' NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'chat' NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='tags') THEN RAISE WARNING 'Missing NOT NULL column tickets.tags (type jsonb) — add it by hand with a backfill.'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='custom_fields') THEN RAISE WARNING 'Missing NOT NULL column tickets.custom_fields (type jsonb) — add it by hand with a backfill.'; END IF; END $$;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "momence_context" jsonb;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "template_id" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "is_escalated" boolean DEFAULT False NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'issue' NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_required" boolean DEFAULT True NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "momence_session_id" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "source_ref" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "submission_key" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "impact" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "asset_id" integer;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "created_by_user_id" integer;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "created_by_name" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;

-- Leftovers from the pre-Supabase-Auth schema (legacy 0001/0002 intended these).
ALTER TABLE "app_users" DROP COLUMN IF EXISTS "password_hash";
DROP TABLE IF EXISTS "auth_sessions";

-- ----------------------------------------------------------------------------
-- 3. Unique constraints.
-- ----------------------------------------------------------------------------

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='app_users_email_unique' AND conrelid='public.app_users'::regclass) THEN ALTER TABLE "app_users" ADD CONSTRAINT "app_users_email_unique" UNIQUE ("email"); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tickets_ticket_number_unique' AND conrelid='public.tickets'::regclass) THEN ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_number_unique" UNIQUE ("ticket_number"); END IF; END $$;

-- ----------------------------------------------------------------------------
-- 4. Foreign keys. schema.ts is authoritative:
--    * ticket children (comments, activities, links, resolution, steps,
--      follow-ups, contact log) CASCADE with their ticket;
--    * author/creator columns on the audit trail (ticket_resolutions,
--      ticket_resolution_steps, ticket_contact_log, ticket_follow_ups) are
--      NO ACTION — deleting a user who authored history is refused; deactivate
--      the user (app_users.active = false) instead. The legacy sync script had
--      created these as ON DELETE CASCADE, which would silently erase history.
--    * optional pointers (assigned staff, asset, creator, location, settings
--      editor, receipt performer) SET NULL.
--
--    iris_ensure_fk() drops any other FK on the same column (legacy `*_fkey`
--    names from the scripts, duplicates, wrong ON DELETE rule), repairs orphans
--    so the constraint can be added, and creates the drizzle-named constraint.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.iris_ensure_fk(
  p_table text, p_column text, p_ref_table text, p_ref_column text,
  p_name text, p_on_delete text
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  want "char" := CASE p_on_delete WHEN 'cascade' THEN 'c' WHEN 'set null' THEN 'n' WHEN 'restrict' THEN 'r' ELSE 'a' END;
  v_attnum smallint;
  con record;
  orphans bigint;
BEGIN
  SELECT a.attnum INTO v_attnum FROM pg_attribute a
   WHERE a.attrelid = format('public.%I', p_table)::regclass AND a.attname = p_column AND NOT a.attisdropped;
  IF v_attnum IS NULL THEN
    RAISE WARNING 'Column %.% missing; FK % skipped', p_table, p_column, p_name;
    RETURN;
  END IF;

  FOR con IN
    SELECT c.conname, c.confdeltype, c.confrelid
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.conrelid = format('public.%I', p_table)::regclass
       AND c.conkey = ARRAY[v_attnum]
  LOOP
    IF con.conname <> p_name OR con.confdeltype <> want
       OR con.confrelid <> format('public.%I', p_ref_table)::regclass THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, con.conname);
      RAISE NOTICE 'Dropped FK %.% (%)', p_table, con.conname, con.confdeltype;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = p_name
              AND conrelid = format('public.%I', p_table)::regclass) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM public.%1$I t WHERE t.%2$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I r WHERE r.%4$I = t.%2$I)',
    p_table, p_column, p_ref_table, p_ref_column) INTO orphans;

  IF orphans > 0 THEN
    IF want = 'n' THEN
      EXECUTE format('UPDATE public.%1$I t SET %2$I = NULL WHERE t.%2$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I r WHERE r.%4$I = t.%2$I)',
        p_table, p_column, p_ref_table, p_ref_column);
      RAISE NOTICE '%: cleared % dangling %.% value(s)', p_name, orphans, p_table, p_column;
    ELSIF want = 'c' THEN
      EXECUTE format('DELETE FROM public.%1$I t WHERE t.%2$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I r WHERE r.%4$I = t.%2$I)',
        p_table, p_column, p_ref_table, p_ref_column);
      RAISE NOTICE '%: deleted % orphaned % row(s)', p_name, orphans, p_table;
    ELSE
      -- Audit-trail rows are never deleted. Add the FK NOT VALID so new writes are
      -- checked; the old rows are reported for a human to resolve, then
      -- ALTER TABLE ... VALIDATE CONSTRAINT.
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE %s ON UPDATE NO ACTION NOT VALID',
        p_table, p_name, p_column, p_ref_table, p_ref_column, p_on_delete);
      RAISE WARNING '%: % row(s) in % reference missing %; constraint added NOT VALID', p_name, orphans, p_table, p_ref_table;
      RETURN;
    END IF;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE %s ON UPDATE NO ACTION',
    p_table, p_name, p_column, p_ref_table, p_ref_column, p_on_delete);
END
$fn$;

SELECT pg_temp.iris_ensure_fk('app_settings', 'updated_by', 'app_users', 'id', 'app_settings_updated_by_app_users_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('app_users', 'staff_id', 'staff', 'id', 'app_users_staff_id_staff_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('assets', 'location_id', 'asset_locations', 'id', 'assets_location_id_asset_locations_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('chat_messages', 'session_id', 'chat_sessions', 'id', 'chat_messages_session_id_chat_sessions_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('momence_action_receipts', 'performed_by_user_id', 'app_users', 'id', 'momence_action_receipts_performed_by_user_id_app_users_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('ticket_activities', 'ticket_id', 'tickets', 'id', 'ticket_activities_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_comments', 'ticket_id', 'tickets', 'id', 'ticket_comments_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_contact_log', 'ticket_id', 'tickets', 'id', 'ticket_contact_log_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_contact_log', 'author_user_id', 'app_users', 'id', 'ticket_contact_log_author_user_id_app_users_id_fk', 'no action');
SELECT pg_temp.iris_ensure_fk('ticket_drafts', 'user_id', 'app_users', 'id', 'ticket_drafts_user_id_app_users_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_follow_ups', 'ticket_id', 'tickets', 'id', 'ticket_follow_ups_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_follow_ups', 'owner_staff_id', 'staff', 'id', 'ticket_follow_ups_owner_staff_id_staff_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('ticket_follow_ups', 'created_by_user_id', 'app_users', 'id', 'ticket_follow_ups_created_by_user_id_app_users_id_fk', 'no action');
SELECT pg_temp.iris_ensure_fk('ticket_links', 'ticket_id', 'tickets', 'id', 'ticket_links_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_links', 'related_id', 'tickets', 'id', 'ticket_links_related_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_resolution_steps', 'ticket_id', 'tickets', 'id', 'ticket_resolution_steps_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_resolution_steps', 'author_user_id', 'app_users', 'id', 'ticket_resolution_steps_author_user_id_app_users_id_fk', 'no action');
SELECT pg_temp.iris_ensure_fk('ticket_resolutions', 'ticket_id', 'tickets', 'id', 'ticket_resolutions_ticket_id_tickets_id_fk', 'cascade');
SELECT pg_temp.iris_ensure_fk('ticket_resolutions', 'author_user_id', 'app_users', 'id', 'ticket_resolutions_author_user_id_app_users_id_fk', 'no action');
SELECT pg_temp.iris_ensure_fk('tickets', 'assigned_staff_id', 'staff', 'id', 'tickets_assigned_staff_id_staff_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('tickets', 'asset_id', 'assets', 'id', 'tickets_asset_id_assets_id_fk', 'set null');
SELECT pg_temp.iris_ensure_fk('tickets', 'created_by_user_id', 'app_users', 'id', 'tickets_created_by_user_id_app_users_id_fk', 'set null');

-- ----------------------------------------------------------------------------
-- 5. Indexes. (Plain CREATE INDEX briefly blocks writes to the table; these
--    tables are small. For a large table, run the statement by hand with
--    CONCURRENTLY outside a transaction first.)
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "app_users_staff_profile_idx" ON "app_users" USING btree ("staff_id");
CREATE UNIQUE INDEX IF NOT EXISTS "app_users_google_sub_idx" ON "app_users" USING btree ("google_sub");
CREATE UNIQUE INDEX IF NOT EXISTS "app_users_supabase_user_idx" ON "app_users" USING btree ("supabase_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "asset_locations_studio_name_idx" ON "asset_locations" USING btree ("studio","name");
CREATE UNIQUE INDEX IF NOT EXISTS "assets_studio_type_label_idx" ON "assets" USING btree ("studio","type","label");
CREATE INDEX IF NOT EXISTS "assets_studio_status_idx" ON "assets" USING btree ("studio","status");
CREATE INDEX IF NOT EXISTS "assets_type_idx" ON "assets" USING btree ("type");
CREATE INDEX IF NOT EXISTS "assets_location_idx" ON "assets" USING btree ("location_id");
CREATE INDEX IF NOT EXISTS "chat_attachments_session_idx" ON "chat_attachments" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "chat_message_session_idx" ON "chat_messages" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_expires_at_idx" ON "chat_sessions" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "delivery_logs_status_next_idx" ON "delivery_logs" USING btree ("status","next_attempt_at");
CREATE INDEX IF NOT EXISTS "delivery_logs_created_idx" ON "delivery_logs" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "momence_receipts_target_idx" ON "momence_action_receipts" USING btree ("target_type","target_id");
CREATE INDEX IF NOT EXISTS "momence_receipts_at_idx" ON "momence_action_receipts" USING btree ("performed_at");
CREATE INDEX IF NOT EXISTS "ticket_activities_ticket_idx" ON "ticket_activities" USING btree ("ticket_id","created_at");
CREATE INDEX IF NOT EXISTS "ticket_comments_ticket_idx" ON "ticket_comments" USING btree ("ticket_id","created_at");
CREATE INDEX IF NOT EXISTS "ticket_contact_log_ticket_idx" ON "ticket_contact_log" USING btree ("ticket_id","contacted_at");
CREATE INDEX IF NOT EXISTS "ticket_drafts_user_updated_idx" ON "ticket_drafts" USING btree ("user_id","updated_at");
CREATE INDEX IF NOT EXISTS "ticket_follow_ups_ticket_idx" ON "ticket_follow_ups" USING btree ("ticket_id","due_at");
CREATE INDEX IF NOT EXISTS "ticket_links_related_idx" ON "ticket_links" USING btree ("related_id");
CREATE INDEX IF NOT EXISTS "ticket_resolution_steps_ticket_idx" ON "ticket_resolution_steps" USING btree ("ticket_id","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_source_ref_idx" ON "tickets" USING btree ("source_ref");
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_submission_key_idx" ON "tickets" USING btree ("submission_key");
CREATE INDEX IF NOT EXISTS "tickets_category_idx" ON "tickets" USING btree ("category","subcategory");
CREATE INDEX IF NOT EXISTS "tickets_status_sla_idx" ON "tickets" USING btree ("status","sla_due_at");
CREATE INDEX IF NOT EXISTS "tickets_owner_idx" ON "tickets" USING btree ("assigned_staff_id");
CREATE INDEX IF NOT EXISTS "tickets_creator_idx" ON "tickets" USING btree ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "tickets_created_idx" ON "tickets" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "tickets_asset_idx" ON "tickets" USING btree ("asset_id");
CREATE INDEX IF NOT EXISTS "tickets_studio_idx" ON "tickets" USING btree ("studio");
CREATE INDEX IF NOT EXISTS "tickets_department_name_idx" ON "tickets" USING btree ("department_name");
CREATE INDEX IF NOT EXISTS "tickets_source_idx" ON "tickets" USING btree ("source");

-- ----------------------------------------------------------------------------
-- 6. Record drizzle/0000_baseline.sql as applied, so `drizzle-kit migrate` only
--    runs migrations generated after it. hash = sha256 of the file's bytes,
--    created_at = its "when" in drizzle/meta/_journal.json. If you ever
--    regenerate the baseline, regenerate this file too.
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '3db4b4b20862609312c09bff7e2da10b4286c9d936e7de9b469bac61ea45b658', 1790336621133
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at >= 1790336621133);

COMMIT;

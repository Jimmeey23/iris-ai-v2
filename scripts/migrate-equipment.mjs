#!/usr/bin/env node
/**
 * Brings an existing database up to the schema in src/db/schema.ts:
 *   - the equipment register's extra detail columns (serial is already there; this adds
 *     manufacturer, model, asset tag, vendor, location, quantity, condition, cost, warranty)
 *   - asset_locations, the managed list of rooms equipment lives in
 *   - momence_action_receipts, which replaces four module-scope arrays
 *   - rate_limits, the fixed-window counters for the AI endpoints
 *   - chat_attachments.data, so an uploaded file is actually stored
 *
 * Every statement is guarded, so this is safe to re-run.
 */
import 'dotenv/config';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: url.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
});

const sql = `
CREATE TABLE IF NOT EXISTS "asset_locations" (
  "id" serial PRIMARY KEY,
  "studio" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "asset_locations_studio_name_idx" ON "asset_locations" ("studio", "name");

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_tag" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "vendor" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "location_id" integer;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "quantity" integer NOT NULL DEFAULT 1;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "condition" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "purchase_cost" numeric(12,2);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "warranty_until" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_location_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_location_id_fkey"
      FOREIGN KEY ("location_id") REFERENCES "asset_locations"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "assets_type_idx" ON "assets" ("type");
CREATE INDEX IF NOT EXISTS "assets_location_idx" ON "assets" ("location_id");

ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "data" bytea;
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "checksum" text;

CREATE TABLE IF NOT EXISTS "momence_action_receipts" (
  "id" text PRIMARY KEY,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "target_name" text NOT NULL,
  "summary" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "studio" text,
  "performed_by" text NOT NULL,
  "performed_by_user_id" integer REFERENCES "app_users"("id"),
  "status" text NOT NULL DEFAULT 'synced',
  "momence_ref" text NOT NULL DEFAULT '',
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "momence_receipts_target_idx" ON "momence_action_receipts" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "momence_receipts_at_idx" ON "momence_action_receipts" ("performed_at");

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  "window_start" timestamp with time zone DEFAULT now() NOT NULL
);

-- tickets_asset_idx and tickets_created_idx already exist in the schema, so the per-asset
-- ticket counts and the analytics date range are already indexed.
`;

try {
  await pool.query(sql);
  console.log('equipment + operations schema is up to date');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

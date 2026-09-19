#!/usr/bin/env node
/**
 * One-off script to create the `assets` table when drizzle-kit push is unavailable.
 * Matches src/db/schema.ts exactly; safe to re-run (CREATE TABLE IF NOT EXISTS).
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
CREATE TABLE IF NOT EXISTS "assets" (
  "id" serial PRIMARY KEY,
  "studio" text NOT NULL,
  "area" text,
  "type" text NOT NULL,
  "label" text NOT NULL,
  "name" text NOT NULL,
  "serial" text,
  "status" text NOT NULL DEFAULT 'in-service',
  "status_note" text,
  "status_changed_at" timestamp with time zone,
  "fault_count" integer NOT NULL DEFAULT 0,
  "last_fault_at" timestamp with time zone,
  "acquired_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'assets'
      AND indexname = 'assets_studio_type_label_idx'
  ) THEN
    CREATE UNIQUE INDEX "assets_studio_type_label_idx" ON "assets" ("studio", "type", "label");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'assets'
      AND indexname = 'assets_studio_status_idx'
  ) THEN
    CREATE INDEX "assets_studio_status_idx" ON "assets" ("studio", "status");
  END IF;
END $$;
`;

try {
  await pool.query(sql);
  console.log('assets table created or already exists');
} catch (err) {
  console.error('Failed to create assets table:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

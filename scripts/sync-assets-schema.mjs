#!/usr/bin/env node
/**
 * Bring the live assets and asset_locations tables in sync with src/db/schema.ts.
 * Idempotent — safe to re-run.
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

async function tableExists(table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(index) {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
    [index]
  );
  return rows.length > 0;
}

async function typeExists(type) {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_type WHERE typname=$1`,
    [type]
  );
  return rows.length > 0;
}

const statements = [];

// ------------------------------------------------------------------
// 1. asset_locations table
// ------------------------------------------------------------------
if (!(await tableExists('asset_locations'))) {
  statements.push(`
    CREATE TABLE "asset_locations" (
      "id" serial PRIMARY KEY NOT NULL,
      "studio" text NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "active" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
}
if (!(await indexExists('asset_locations_studio_name_idx'))) {
  statements.push(`CREATE UNIQUE INDEX "asset_locations_studio_name_idx" ON "asset_locations" ("studio", "name");`);
}

// ------------------------------------------------------------------
// 2. assets columns
// ------------------------------------------------------------------
const assetCols = [
  { name: 'category', def: 'text' },
  { name: 'manufacturer', def: 'text' },
  { name: 'model', def: 'text' },
  { name: 'asset_tag', def: 'text' },
  { name: 'vendor', def: 'text' },
  { name: 'location_id', def: 'integer' },
  { name: 'quantity', def: 'integer DEFAULT 1 NOT NULL' },
  { name: 'condition', def: 'text' },
  { name: 'purchase_cost', def: 'numeric(12, 2)' },
  { name: 'warranty_until', def: 'timestamp with time zone' },
  { name: 'notes', def: 'text' },
  { name: 'retired_at', def: 'timestamp with time zone' },
];

for (const col of assetCols) {
  if (!(await columnExists('assets', col.name))) {
    statements.push(`ALTER TABLE "assets" ADD COLUMN "${col.name}" ${col.def};`);
  }
}

// ------------------------------------------------------------------
// 3. assets indexes
// ------------------------------------------------------------------
if (!(await indexExists('assets_type_idx'))) {
  statements.push(`CREATE INDEX "assets_type_idx" ON "assets" ("type");`);
}
if (!(await indexExists('assets_location_idx'))) {
  statements.push(`CREATE INDEX "assets_location_idx" ON "assets" ("location_id");`);
}

// ------------------------------------------------------------------
// 4. FK assets.location_id -> asset_locations.id
// ------------------------------------------------------------------
const { rows: fkRows } = await pool.query(
  `SELECT 1 FROM information_schema.table_constraints WHERE table_schema='public' AND table_name='assets' AND constraint_name='assets_location_id_asset_locations_id_fk'`
);
if (fkRows.length === 0) {
  statements.push(`ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_asset_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "asset_locations"("id") ON DELETE SET NULL;`);
}

// ------------------------------------------------------------------
// Execute
// ------------------------------------------------------------------
if (!statements.length) {
  console.log('assets schema is already in sync.');
  await pool.end();
  process.exit(0);
}

console.log(`Applying ${statements.length} schema change(s)...`);
for (const sql of statements) {
  console.log('→', sql.trim().split('\n')[0].trim());
  try {
    await pool.query(sql);
  } catch (err) {
    console.error('Failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}
console.log('assets schema sync complete.');
await pool.end();

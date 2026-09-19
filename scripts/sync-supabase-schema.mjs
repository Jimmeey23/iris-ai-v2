#!/usr/bin/env node
/**
 * Idempotent schema sync for the existing Supabase database.
 * Adds columns / indexes / constraints that exist in src/db/schema.ts but are
 * missing in the live DB, without touching existing data.
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

const statements = [];

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

async function constraintExists(table, constraint) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_schema='public' AND table_name=$1 AND constraint_name=$2`,
    [table, constraint]
  );
  return rows.length > 0;
}

async function fkExists(table, constraint) {
  return constraintExists(table, constraint);
}

// ------------------------------------------------------------------
// 1. tickets.asset_id column + index
// ------------------------------------------------------------------
if (!(await columnExists('tickets', 'asset_id'))) {
  statements.push(`ALTER TABLE "tickets" ADD COLUMN "asset_id" integer;`);
}
if (!(await indexExists('tickets_asset_idx'))) {
  statements.push(`CREATE INDEX "tickets_asset_idx" ON "tickets" ("asset_id");`);
}

// ------------------------------------------------------------------
// 2. app_users indexes / FK (schema has app_users_staff_profile_idx + fk)
// ------------------------------------------------------------------
if (!(await indexExists('app_users_staff_profile_idx'))) {
  statements.push(`CREATE UNIQUE INDEX "app_users_staff_profile_idx" ON "app_users" ("staff_id");`);
}
if (!(await fkExists('app_users', 'app_users_staff_id_staff_id_fk'))) {
  statements.push(`ALTER TABLE "app_users" ADD CONSTRAINT "app_users_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;`);
}

// ------------------------------------------------------------------
// 3. auth_sessions FK
// ------------------------------------------------------------------
if (!(await fkExists('auth_sessions', 'auth_sessions_user_id_app_users_id_fk'))) {
  statements.push(`ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE;`);
}

// ------------------------------------------------------------------
// 4. chat_messages FK (if missing)
// ------------------------------------------------------------------
if (!(await fkExists('chat_messages', 'chat_messages_session_id_chat_sessions_id_fk'))) {
  statements.push(`ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE;`);
}

// ------------------------------------------------------------------
// 5. ticket_contact_log FKs
// ------------------------------------------------------------------
if (!(await fkExists('ticket_contact_log', 'ticket_contact_log_ticket_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_contact_log" ADD CONSTRAINT "ticket_contact_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;`);
}
if (!(await fkExists('ticket_contact_log', 'ticket_contact_log_author_user_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_contact_log" ADD CONSTRAINT "ticket_contact_log_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE;`);
}

// ------------------------------------------------------------------
// 6. ticket_follow_ups FKs
// ------------------------------------------------------------------
if (!(await fkExists('ticket_follow_ups', 'ticket_follow_ups_ticket_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_follow_ups" ADD CONSTRAINT "ticket_follow_ups_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;`);
}
if (!(await fkExists('ticket_follow_ups', 'ticket_follow_ups_owner_staff_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_follow_ups" ADD CONSTRAINT "ticket_follow_ups_owner_staff_id_fkey" FOREIGN KEY ("owner_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;`);
}
if (!(await fkExists('ticket_follow_ups', 'ticket_follow_ups_created_by_user_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_follow_ups" ADD CONSTRAINT "ticket_follow_ups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE;`);
}

// ------------------------------------------------------------------
// 7. ticket_resolution_steps FKs
// ------------------------------------------------------------------
if (!(await fkExists('ticket_resolution_steps', 'ticket_resolution_steps_ticket_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_resolution_steps" ADD CONSTRAINT "ticket_resolution_steps_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;`);
}
if (!(await fkExists('ticket_resolution_steps', 'ticket_resolution_steps_author_user_id_fkey'))) {
  statements.push(`ALTER TABLE "ticket_resolution_steps" ADD CONSTRAINT "ticket_resolution_steps_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE;`);
}

// ------------------------------------------------------------------
// 8. app_settings FK
// ------------------------------------------------------------------
if (!(await fkExists('app_settings', 'app_settings_updated_by_app_users_id_fk'))) {
  statements.push(`ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_app_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_users"("id") ON DELETE SET NULL;`);
}

// ------------------------------------------------------------------
// Execute
// ------------------------------------------------------------------
if (!statements.length) {
  console.log('Schema is already in sync.');
  await pool.end();
  process.exit(0);
}

console.log(`Applying ${statements.length} schema change(s)...`);
for (const sql of statements) {
  console.log('→', sql);
  try {
    await pool.query(sql);
  } catch (err) {
    console.error('Failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}
console.log('Schema sync complete.');
await pool.end();

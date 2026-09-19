#!/usr/bin/env node
/**
 * Bring the live chat tables (chat_sessions, chat_messages, chat_attachments) in sync
 * with src/db/schema.ts. Idempotent — safe to re-run.
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

async function constraintExists(table, constraint) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_schema='public' AND table_name=$1 AND constraint_name=$2`,
    [table, constraint]
  );
  return rows.length > 0;
}

const statements = [];

// ------------------------------------------------------------------
// 1. chat_sessions
// ------------------------------------------------------------------
if (!(await tableExists('chat_sessions'))) {
  statements.push(`
    CREATE TABLE "chat_sessions" (
      "id" text PRIMARY KEY NOT NULL,
      "phase" text NOT NULL DEFAULT 'welcome',
      "collected" jsonb NOT NULL,
      "missing" jsonb NOT NULL,
      "draft" jsonb,
      "ticket_id" integer,
      "ticket_number" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      "owner_key" text,
      "version" integer NOT NULL DEFAULT 1,
      "expires_at" timestamp with time zone
    );
  `);
}

const chatSessionCols = [
  { name: 'phase', def: `text NOT NULL DEFAULT 'welcome'` },
  { name: 'collected', def: 'jsonb NOT NULL' },
  { name: 'missing', def: 'jsonb NOT NULL' },
  { name: 'draft', def: 'jsonb' },
  { name: 'ticket_id', def: 'integer' },
  { name: 'ticket_number', def: 'text' },
  { name: 'owner_key', def: 'text' },
  { name: 'version', def: 'integer NOT NULL DEFAULT 1' },
  { name: 'expires_at', def: 'timestamp with time zone' },
];

for (const col of chatSessionCols) {
  if (!(await columnExists('chat_sessions', col.name))) {
    statements.push(`ALTER TABLE "chat_sessions" ADD COLUMN "${col.name}" ${col.def};`);
  }
}

if (!(await indexExists('chat_sessions_expires_at_idx'))) {
  statements.push(`CREATE INDEX "chat_sessions_expires_at_idx" ON "chat_sessions" ("expires_at");`);
}

// ------------------------------------------------------------------
// 2. chat_messages
// ------------------------------------------------------------------
if (!(await tableExists('chat_messages'))) {
  statements.push(`
    CREATE TABLE "chat_messages" (
      "id" serial PRIMARY KEY NOT NULL,
      "session_id" text NOT NULL,
      "role" text NOT NULL,
      "content" text NOT NULL,
      "meta" jsonb,
      "attachment_ids" jsonb DEFAULT '[]'::jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
}

const chatMessageCols = [
  { name: 'meta', def: 'jsonb' },
  { name: 'attachment_ids', def: `jsonb DEFAULT '[]'::jsonb` },
];

for (const col of chatMessageCols) {
  if (!(await columnExists('chat_messages', col.name))) {
    statements.push(`ALTER TABLE "chat_messages" ADD COLUMN "${col.name}" ${col.def};`);
  }
}

if (!(await indexExists('chat_message_session_idx'))) {
  statements.push(`CREATE INDEX "chat_message_session_idx" ON "chat_messages" ("session_id");`);
}

if (!(await constraintExists('chat_messages', 'chat_messages_session_id_chat_sessions_id_fk'))) {
  statements.push(`ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE;`);
}

// ------------------------------------------------------------------
// 3. chat_attachments
// ------------------------------------------------------------------
if (!(await tableExists('chat_attachments'))) {
  statements.push(`
    CREATE TABLE "chat_attachments" (
      "id" text PRIMARY KEY NOT NULL,
      "session_id" text NOT NULL,
      "file_name" text NOT NULL,
      "file_type" text NOT NULL,
      "file_size" integer NOT NULL,
      "storage_url" text NOT NULL,
      "data" bytea,
      "checksum" text,
      "uploaded_by" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
}

const chatAttachmentCols = [
  { name: 'file_size', def: 'integer NOT NULL' },
  { name: 'storage_url', def: 'text NOT NULL' },
  { name: 'data', def: 'bytea' },
  { name: 'checksum', def: 'text' },
  { name: 'uploaded_by', def: 'text' },
];

for (const col of chatAttachmentCols) {
  if (!(await columnExists('chat_attachments', col.name))) {
    statements.push(`ALTER TABLE "chat_attachments" ADD COLUMN "${col.name}" ${col.def};`);
  }
}

if (!(await indexExists('chat_attachments_session_idx'))) {
  statements.push(`CREATE INDEX "chat_attachments_session_idx" ON "chat_attachments" ("session_id");`);
}

// ------------------------------------------------------------------
// Execute
// ------------------------------------------------------------------
if (!statements.length) {
  console.log('Chat schema is already in sync.');
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
console.log('Chat schema sync complete.');
await pool.end();

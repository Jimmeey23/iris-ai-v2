# Database migrations

`src/db/schema.ts` is the single source of truth. Migrations in `drizzle/` are
generated from it with drizzle-kit and applied with `drizzle-kit migrate`.

```
drizzle/
  0000_baseline.sql            full schema as of the production-hardening pass
  meta/_journal.json           the list drizzle-kit migrate applies, in order
  meta/0000_snapshot.json      schema snapshot the next `generate` diffs against
  manual/0004_prod_alignment.sql   one-off: brings an EXISTING database in line
  legacy/                      the old 0000-0003 files and journal (reference only)
scripts/legacy/                the old ad-hoc sync scripts (reference only)
```

## Why there is a new baseline

Before this pass the history was inconsistent: the journal listed only
`0000_sync_schema`, while `0001_identity_access`, `0002_supabase_auth` and
`0003_ticket_drafts` sat beside it unregistered, and several changes (asset
locations, Momence receipts, rate limits, chat FKs, …) had only ever been applied
by the ad-hoc `scripts/sync-*.mjs` scripts. Those scripts also disagreed with the
schema: author FKs on `ticket_contact_log`, `ticket_resolution_steps` and
`ticket_follow_ups` were created `ON DELETE CASCADE` (deleting a user would have
silently erased the audit trail they wrote), and `assets.location_id` could end
up with two FKs under different names.

So the old files moved to `drizzle/legacy/` and `drizzle/0000_baseline.sql` was
generated from the current schema. A fresh database is built from the baseline; an
existing one is aligned once with `0004_prod_alignment.sql`, which also records the
baseline as applied.

## Fresh database (new environment, CI, local)

```bash
npm run db:migrate        # drizzle-kit migrate
```

## Existing production database — one-time procedure

Do this once, before (or together with) deploying the release that contains this
file.

1. **Back up.** Supabase → Database → Backups: confirm last night's backup exists,
   or take a logical dump:
   `pg_dump "$DATABASE_URL" --schema=public --no-owner -Fc -f iris-pre-0004.dump`
2. **Dry run on a copy (recommended).** Restore the dump into a scratch database
   (or a Supabase branch) and run the file there first.
3. **Run the alignment script** against production, as the `postgres` user, in the
   Supabase SQL editor (paste the file) or with psql:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/manual/0004_prod_alignment.sql
   ```
   It is a single transaction — any error rolls everything back — and it is
   idempotent, so re-running it is harmless. It:
   - creates any missing app table (`CREATE TABLE IF NOT EXISTS`);
   - adds any missing column (`ADD COLUMN IF NOT EXISTS`), including the new
     outbox column `delivery_logs.next_attempt_at`; NOT NULL columns without a
     default are only checked and reported with a `WARNING`;
   - drops the leftover `app_users.password_hash` column and `auth_sessions` table
     (already the intent of legacy 0002);
   - makes every foreign key match the schema: drops FKs on the same column that
     have another name (`*_fkey` from the scripts), a duplicate, or the wrong
     `ON DELETE` rule, then adds the drizzle-named constraint. Before adding it,
     dangling references are repaired — `SET NULL` columns are nulled, orphaned
     `CASCADE` children are deleted (e.g. chat messages whose session is gone),
     and audit-trail (`NO ACTION`) FKs with orphans are added `NOT VALID` with a
     `WARNING` instead of deleting anything;
   - creates missing indexes (`CREATE INDEX IF NOT EXISTS`), including the new
     ones on `ticket_comments`, `ticket_activities`, `ticket_links.related_id`,
     `tickets.studio / department_name / source` and `delivery_logs`;
   - inserts the baseline's hash into `drizzle.__drizzle_migrations`.
4. **Read the output.** `NOTICE` lines list what changed (FKs dropped, rows
   repaired). Any `WARNING` needs a human decision — e.g. an audit FK added
   `NOT VALID` means some rows reference a deleted user; fix them, then
   `ALTER TABLE <t> VALIDATE CONSTRAINT <name>;`.
5. **Verify:**
   ```bash
   npm run db:migrate    # must report nothing to apply
   ```
   ```sql
   -- every app FK and its ON DELETE rule (a=no action, c=cascade, n=set null)
   select conrelid::regclass as tbl, conname, confdeltype, convalidated
     from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
     order by 1, 2;
   select * from drizzle.__drizzle_migrations;
   ```

Validated locally against a database rebuilt from the legacy files plus the
legacy scripts (including CASCADE author FKs, a duplicate `assets.location_id`
FK and orphan rows): after the script, `pg_dump --schema-only` matches a database
built from `0000_baseline.sql` except for column order, a second run changes
nothing, and `drizzle-kit migrate` is a no-op.

## Changing the schema from now on

1. Edit `src/db/schema.ts`.
2. `npm run db:generate -- --name <what_changed>` — writes `drizzle/000N_*.sql`
   and updates `meta/`. Review the SQL; commit both.
3. Apply: `DATABASE_URL=<prod> npm run db:migrate` (from a trusted machine or a
   one-off CI job — Vercel builds do not run migrations and `drizzle/` is in
   `.vercelignore`).
4. Deploy the app code that depends on it.

Prefer additive, backwards-compatible changes (new nullable columns, new tables)
so the migration can run before the deploy. CI fails when `schema.ts` changes
without a matching migration.

Do not use `npm run db:push` against production: it applies a diff without a
record, which is how the history drifted in the first place. Never edit
`0000_baseline.sql` — its hash is recorded in production. If it ever has to be
regenerated, regenerate `manual/0004_prod_alignment.sql` with it.

## Foreign-key policy

| Relationship | ON DELETE | Why |
|---|---|---|
| ticket children (comments, activities, links, resolution, steps, follow-ups, contact log) → tickets | CASCADE | They have no meaning without the ticket. |
| chat_messages → chat_sessions, ticket_drafts → app_users | CASCADE | Transient working data. |
| author/creator on resolutions, steps, follow-ups, contact log → app_users | NO ACTION | Audit trail. Deleting a user who authored history is refused; deactivate them instead (`app_users.active = false`, which also bans them in Supabase). |
| tickets.assigned_staff_id → staff, tickets.asset_id → assets, tickets.created_by_user_id → app_users, app_users.staff_id → staff, assets.location_id → asset_locations, follow-up owner → staff, settings editor / receipt performer → app_users | SET NULL | Optional pointers; the denormalised name columns keep the history readable. |

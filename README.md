# IRIS · Physique 57 India

A Next.js App Router workspace backed by PostgreSQL and Drizzle. The default workspace is an explicitly labeled preview until the first administrator is created under Settings.

## Configuration

- `DATABASE_URL` — PostgreSQL connection.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase Auth. See **Authentication** below. The service-role key is server-side only.
- `INTEGRATION_ENCRYPTION_KEY` — 64-character hexadecimal AES-256 key. Created locally for this workspace. Keep this key with your encrypted backup; changing it without re-encrypting credentials makes saved secrets unreadable.
- `OPENAI_API_KEY`, optional `OPENAI_MODEL` — OpenAI API access (not a ChatGPT subscription).
- `MOMENCE_USERNAME`, `MOMENCE_PASSWORD`, `MOMENCE_CLIENT_ID`, `MOMENCE_CLIENT_SECRET` — password grant exchanged directly for a Momence OAuth access token using Basic client authentication. Token expiry and refresh are managed on the server.
- Alternatively configure encrypted credentials in **Integrations**. Environment variables take precedence.
- Google connectors accept their individual credentials or `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Enable the respective APIs and grant the scopes described in each connector.

Production and operations settings (all documented in `.env.example`):

| Variable | Purpose |
|---|---|
| `SETUP_TOKEN` | One-time token required by the in-app "create first administrator" dialog. Without it setup is disabled. Remove it once the first admin exists. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated domains whose confirmed Supabase users may self-provision an agent profile (default `physique57india.com`). Everyone else needs an admin invite. |
| `CRON_SECRET` | Bearer secret for `/api/cron/outbox`. Vercel Cron sends it automatically when set; without it the route rejects every call. |
| `SEED_DEMO_DATA` | `true` seeds demo tickets. Leave unset in production. |
| `DB_POOL_MAX` | Postgres pool size per server instance (default `3`, sized for serverless). |
| `DATABASE_CA_CERT` | PEM root certificate of the database. When set, TLS is fully verified. When unset, Supabase connections are encrypted but the certificate is **not** verified (the pooler's chain does not reach Node's default CA bundle). Recommended for production: download it from Supabase → Database → SSL Configuration. Do not also put `sslmode=` in `DATABASE_URL`; pg lets the URL override this setting. |
| `TRAINER_REVIEW_SOURCES` | Overrides the built-in trainer review forms: `<fillout-form\|zite-app>:<id>[:<label>]`, comma-separated. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback name for the publishable key on older Supabase projects. |

## Authentication

Sign-in runs entirely on Supabase Auth. This application stores no passwords and issues no session cookies of its own; `app_users` holds only the workspace profile (role, linked staff member, department, studio) keyed to the Supabase user id.

To set up a project:

1. Copy the project URL, the publishable (anon) key and the `service_role` key from **Supabase Dashboard > Project Settings > API** into `.env`.
2. In **Authentication > URL Configuration**, add `<your-app>/auth/callback` to the redirect allow list for every environment, including `http://localhost:3000/auth/callback`.
3. In **Authentication > Providers > Google**, enable Google and paste your Google OAuth client id and secret. Add the callback URL Supabase shows there to the Google credential's authorised redirect URIs. Google is configured in Supabase, not in this application's environment.
4. Leave **Confirm email** enabled under **Authentication > Sign In / Providers**. Email sign-up returns `confirmationRequired` and the account becomes usable once the link is clicked. Configure SMTP under **Authentication > Emails** before relying on it in production; the built-in sender is rate limited.
5. Apply the database schema: `npm run db:migrate` on a new database, or the one-time alignment script on an existing one (see [docs/MIGRATIONS.md](docs/MIGRATIONS.md)).

The first administrator is created from the in-app setup dialog, which uses the service-role key to mint a pre-confirmed account. Administrator-created accounts under **Settings** work the same way. Deactivating a user bans them in Supabase and revokes their live sessions, so access ends immediately rather than when the access token expires.

`proxy.ts` (Next.js 16's name for middleware) refreshes the Supabase session on every request and redirects unauthenticated visitors to `/login`. Authorisation always verifies the token with `supabase.auth.getUser()`; `getSession()` reads the cookie without verifying it and must not be used for access decisions.

Never commit `.env` or the integration encryption key. The database contains member information and should be backed up and access-controlled at infrastructure level.

## Workflows

- **Raising a ticket (`/iris`)** is a form-based generator: pick a category, pick a sub-category, answer that sub-category's questions, read the ticket back, file. The field plans come from the Support Hub (`Jimmeey23/physique57-support-hub`, `src/data.json`), compacted into `src/lib/intake/plan-data.json` by `npm run build:intake-plan -- <checkout>`; only sub-categories in the workspace taxonomy are offered. `src/lib/intake/plan.ts` evaluates conditional visibility and the link-don't-type gates (a member when staff file on a member's behalf, the class when a class was touched) and maps answers onto the shared ticket contract — fields without a column ride in `customFields` under the plan's field id, with the plan recorded under `customFields._intake`. Member, class and ticket lookups go through `/api/momence` (demo records are labelled demo; a signed-out desk can type a name, which is labelled as typed). **Start from a class** reads a session's roll and capacity out of Momence and builds the ticket around it. A class linked on the form is read from Momence too (format, coach, start time and the roll fill assumed answers, never typed ones). Conditional questions narrow on the answer they follow (a linked ticket only once "already open", churn risk only once a member is frustrated), a **Required only** switch hides the optional ones, and **Write it up from the answers** composes the summary deterministically from what is already on the form — no model, nothing invented. Routing, priority, SLA, tags and idempotency are the existing `POST /api/tickets` contract; the form only adds `?channel=form`. Deep links: `/iris?category=&subcategory=` opens a form, `/iris?desk=class` opens the class desk, `/iris?mode=chat` opens the legacy chat for one visit. `npm run check:intake` covers all of this. The previous conversational intake remains available behind the **Legacy chat** switch on the same page.
- Iris chat (legacy) saves conversation state server-side, gathers one missing field at a time, prefers Momence member/session lookup, and asks for approval of a detailed draft.
- Template cards open structured guided forms. Category-specific fields, hosted-class feedback and weighted trainer assessments are included. Templates may be edited in **Settings → Database explorer → templates**.
- Creation uses a shared validated contract with deterministic department routing, active studio-aware staff matching, tags, response targets and idempotency keys.
- Compliments, qualifying positive feedback and assessments can be record-only: no SLA deadline and no required resolution.
- Only the current assigned owner's authenticated staff account can read or write private resolutions. Administrators do not receive a blanket resolution override.
- Ticket edits use revision checks. Tickets can be duplicated and manually related; same-category/subcategory suggestions are queried from the database.
- List, board and card views, filters, CSV exports, saved views, themes, settings, accounts and audit trails persist.

## Momence

The UI shows only the selected module. It preserves the published response structures, including nested instructors, locations, visits, membership details, cancellations and check-ins. Detail dialogs support roster pagination and related-record drill-downs.

The API catalogue is generated from `https://static.momence.com/schema/api-v2-schema.yaml`. Host operations use a fixed provider base URL; there is no arbitrary authenticated proxy. POST, PUT and DELETE actions require administrator authentication and explicit confirmation. Member notes are read-only because Momence publishes a GET-only notes endpoint.

With no configured connection, illustrative member/session records are clearly labeled **Demo**. They are never mixed into live results. Live errors and empty results are surfaced as-is; no invented sales or payment transactions are displayed.

## Integrations

Native server adapters are included for Momence, OpenAI, n8n, WhatsApp Cloud API, Mailtrap, Fillout, Gmail, Google Calendar, Contacts, Sheets, Docs and respond.io. Provider credentials and permissions are required for live operation; they cannot be verified without supplied credentials.

All external writes are reviewed before execution. n8n ticket-created events and Mailtrap owner-assignment emails can be explicitly enabled in Automation. Events enter a persistent outbox (`delivery_logs`) and are dispatched right after the request using Next.js `after`, and again by the scheduled worker (see **Scheduled jobs**). A failed delivery is retried automatically with exponential backoff (2, 4, 8, 16, 32 minutes) up to 6 attempts, then parked as `failed`, where it stays visible for a reviewed manual retry. Deliveries left in `sending` by a crashed function are released after 10 minutes. Interactive actions run from the Integrations page are logged the same way but are never retried automatically. Delivery is not exactly-once at third-party providers; inspect uncertain failures before retrying.

## Historical tickets and Fillout

The historic ticket export (`data/historic-tickets.json`) contains member and staff details, so it is **not committed** (`data/` is git- and Vercel-ignored) and is not present in deployments. Import it by uploading the file under **Settings → History & knowledge**, which accepts a JSON array or `{ "tickets": [...] }`. (The "import server file" option only works on a machine where that file exists locally.) Imports validate rows, preserve source metadata, record row errors, and deduplicate by source reference. Re-imports do not erase or duplicate tickets.

Iris retrieves relevant historical examples as context. This is retrieval-assisted learning, **not** model fine-tuning. It does not export the private resolution table to OpenAI.

Iris Ai workflows were inspected at https://github.com/Jimmeey23/Athena-Ai, specifically `src/lib/intake-templates.ts`, `src/lib/trainer-evaluation-core.ts` and the Fillout functions. Adapted workflow definitions include hosted classes, instructor punctuality, late arrival, class experience, studio environment and four assessment rubrics. No form IDs or submissions have been fabricated or copied from private accounts.

Fillout exact-submission imports use the actual submission ID. Set `FILLOUT_WEBHOOK_SECRET` or its encrypted integration equivalent and send `X-Fillout-Webhook-Secret` to `POST /api/webhooks/fillout`. Configure label mapping and score scale (`5` or `weight`) when needed. Missing rubric fields are rejected rather than silently scored as zero.

## Validation

- `npm run lint`, `npm run typecheck`, `npm run build`.
- `npm test` runs the offline checks (`check:intake`, `check:labels`, `check:dashboard`, `check:iris`) — no database, network or API keys needed.
- `scripts/browser-check.mjs` exercises templates, nested-dialog Escape behavior, Momence scrolling, themes and responsive views against the running preview.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, the offline checks, applies all migrations to an empty Postgres, fails if `schema.ts` has changes with no migration, builds, and audits production dependencies.

## Deployment (Vercel + Supabase)

1. Create the Supabase project and configure Auth (see **Authentication**).
2. Apply the schema (see **Database migrations**).
3. In Vercel → Project → Settings → Environment Variables (Production, and Preview if used), set `DATABASE_URL` (the Supabase **transaction pooler** URL, port 6543), `INTEGRATION_ENCRYPTION_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SETUP_TOKEN` (first deploy only), `OPENAI_API_KEY`, and optionally `DATABASE_CA_CERT`, `ALLOWED_EMAIL_DOMAINS` and integration credentials.
4. Deploy. Check `GET /api/health` → `{ "ok": true, "db": "up", "commit": "<sha>", "env": "production" }`.
5. Sign in, open the setup dialog with the `SETUP_TOKEN`, create the first administrator, then remove `SETUP_TOKEN` and redeploy.

Security headers (HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, referrer policy, permissions policy) are set in `next.config.ts`. The full Content-Security-Policy currently ships as **`Content-Security-Policy-Report-Only`** because the Fillout embed runtime may load origins that cannot be audited from this repo; once the browser console shows no CSP reports in production, rename that header to `Content-Security-Policy`.

## Database migrations

`src/db/schema.ts` is authoritative. `npm run db:generate` creates a migration from schema changes, `npm run db:migrate` applies pending ones, `npm run db:check` validates the migration folder. An existing production database needs a one-time alignment first. Full procedure: **[docs/MIGRATIONS.md](docs/MIGRATIONS.md)**. The old ad-hoc scripts live in `scripts/legacy/` for reference only.

## Scheduled jobs

`vercel.json` schedules `GET /api/cron/outbox` every 5 minutes. It retries due outbox deliveries in batches within a 45-second budget, releases stuck ones, then runs the SLA escalation sweep. It requires `Authorization: Bearer $CRON_SECRET` (sent by Vercel Cron automatically once `CRON_SECRET` is set).

**Plan limits:** Vercel Hobby allows cron jobs to run at most once a day — a `*/5` schedule fails to deploy there. On Hobby, change the schedule to daily (e.g. `0 3 * * *`) and rely on the in-request `after()` delivery, or call the endpoint from an external scheduler (e.g. GitHub Actions or cron-job.org) with the bearer header. Pro allows the 5-minute schedule.

## Monitoring

- Every uncaught server error (Server Components, Route Handlers, Server Actions, proxy) is logged by `onRequestError` in `src/instrumentation.ts` as one JSON line: `message`, `digest`, `path`, `method`, `routeType`, `routePath`, `commit`. Vercel → Logs indexes it; filter on `source:onRequestError`. The error pages show the same `digest` as a reference code, so a user's screenshot can be matched to the log line.
- Client-side error boundaries log a JSON line with `source: error-boundary` / `global-error` to the browser console.
- `GET /api/health` is read-only (`select 1`) and suitable for an uptime monitor (Better Stack, UptimeRobot, Vercel Checks). It returns 503 when the database is unreachable.
- The cron worker logs a `cron.outbox` summary line per run; alert on `failed > 0` or on runs missing.
- **Optional Sentry:** `npm i @sentry/nextjs`, run its wizard, and call `Sentry.captureRequestError` from `onRequestError` in `src/instrumentation.ts` (and `Sentry.captureException` in `error.tsx` / `global-error.tsx`). Add Sentry's ingest origin to `connect-src` in the CSP. Not installed by default.

## Backups and restore

The database holds member information and every ticket, resolution and audit record. Supabase is the system of record:

- **Daily backups** are included on Supabase Pro (7 days retained; longer on Team/Enterprise). Free-tier projects have no downloadable backups — do not run production on Free.
- **Point-in-Time Recovery (PITR)** is a paid add-on that allows restore to any second within the retention window. Recommended for production.
- **Off-platform copy:** schedule a weekly logical dump to storage you control, e.g. `pg_dump "$DATABASE_URL" --schema=public --no-owner -Fc -f iris-$(date +%F).dump`, and keep `INTEGRATION_ENCRYPTION_KEY` in the same secret store — without it, encrypted integration credentials in the dump are unreadable.

Restore:

1. Supabase → Database → Backups → choose the daily backup or a PITR timestamp → Restore. This replaces the project's database in place, with downtime; for a partial recovery, restore into a **new** project instead and copy rows across.
2. From a logical dump: `pg_restore --no-owner --clean --if-exists -d "$DATABASE_URL" iris-YYYY-MM-DD.dump` (into a scratch database first if you only need some rows).
3. Run `npm run db:migrate` so the restored database is at the current schema, then check `GET /api/health`.
4. Test a restore at least once a quarter.
   
# IRIS · Physique 57 India

A Next.js App Router workspace backed by PostgreSQL and Drizzle. The default workspace is an explicitly labeled preview until the first administrator is created under Settings.

## Configuration

- `DATABASE_URL` — PostgreSQL connection.
- `INTEGRATION_ENCRYPTION_KEY` — 64-character hexadecimal AES-256 key. Created locally for this workspace. Keep this key with your encrypted backup; changing it without re-encrypting credentials makes saved secrets unreadable.
- `OPENAI_API_KEY`, optional `OPENAI_MODEL` — OpenAI API access (not a ChatGPT subscription).
- `MOMENCE_USERNAME`, `MOMENCE_PASSWORD`, `MOMENCE_CLIENT_ID`, `MOMENCE_CLIENT_SECRET` — password grant exchanged directly for a Momence OAuth access token using Basic client authentication. Token expiry and refresh are managed on the server.
- Alternatively configure encrypted credentials in **Integrations**. Environment variables take precedence.
- Google connectors accept their individual credentials or `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Enable the respective APIs and grant the scopes described in each connector.

Never commit `.env` or the integration encryption key. The database contains member information and should be backed up and access-controlled at infrastructure level.

## Workflows

- Iris saves conversation state server-side, gathers one missing field at a time, prefers Momence member/session lookup, and asks for approval of a detailed draft.
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

All external writes are reviewed before execution. n8n ticket-created events and Mailtrap owner-assignment emails can be explicitly enabled in Automation. Events enter a persistent outbox and are dispatched using Next.js `after`. Failed requests remain visible for reviewed retries. Delivery is not exactly-once at third-party providers; inspect uncertain failures before retrying.

## Historical tickets and Fillout

The supplied project did not contain `data/historic-tickets.json`. **Settings → History & knowledge** can import that server file when available, or an uploaded JSON array / `{ "tickets": [...] }` file. Imports validate rows, preserve source metadata, record row errors, and deduplicate by source reference. Re-imports do not erase or duplicate tickets.

Iris retrieves relevant historical examples as context. This is retrieval-assisted learning, **not** model fine-tuning. It does not export the private resolution table to OpenAI.

Athena workflows were inspected at https://github.com/Jimmeey23/Athena-Ai, specifically `src/lib/intake-templates.ts`, `src/lib/trainer-evaluation-core.ts` and the Fillout functions. Adapted workflow definitions include hosted classes, instructor punctuality, late arrival, class experience, studio environment and four assessment rubrics. No form IDs or submissions have been fabricated or copied from private accounts.

Fillout exact-submission imports use the actual submission ID. Set `FILLOUT_WEBHOOK_SECRET` or its encrypted integration equivalent and send `X-Fillout-Webhook-Secret` to `POST /api/webhooks/fillout`. Configure label mapping and score scale (`5` or `weight`) when needed. Missing rubric fields are rejected rather than silently scored as zero.

## Validation

Run Next type generation, TypeScript, and the production build. `scripts/browser-check.mjs` exercises templates, nested-dialog Escape behavior, Momence scrolling, themes and responsive views against the running preview.

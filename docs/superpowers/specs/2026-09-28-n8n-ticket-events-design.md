# n8n ticket event webhooks — design

**Date:** 2026-09-28
**Status:** Approved for planning

## Purpose

Push ticket lifecycle events from IRIS to n8n as HTTP webhooks, so studio
workflows (chat alerts, escalation chains, spreadsheets, on-call paging) can be
built in n8n instead of in this codebase.

Today exactly one event is emitted — `ticket.created`, from
`insertTicketFromDraft` in `src/lib/tickets.ts`, gated on the `webhookOnCreate`
setting. Everything else that happens to a ticket is invisible to n8n.

### Success criteria

- An n8n workflow can trigger on any of six lifecycle events without polling.
- A ticket that breaches its follow-up target reaches n8n exactly once, whether
  or not automatic escalation is configured.
- Delivery survives a failing or briefly unreachable n8n instance.
- Bulk history imports emit nothing.

### Non-goals

- Inbound n8n → IRIS control (n8n writing back to tickets). Out of scope.
- Per-event webhook URLs. One URL, filtered by event type inside n8n.
- Replacing the existing Mailtrap assignment/reminder emails.

## What already exists

This work is an emission layer over infrastructure that is already built and in
production use. It adds no new delivery machinery.

| Piece | Location | State |
|---|---|---|
| n8n connector (URL + `X-Webhook-Secret`, SSRF guard) | `lib/integrations.ts` → `runIntegration('n8n', …)` | Done |
| Outbox table | `db/schema.ts` → `deliveryLogs` | Done |
| Outbox drain, backoff, stuck-row recovery, give-up | `lib/integrations.ts` → `deliverPending`, `OUTBOX_MAX_ATTEMPTS=6` | Done |
| Scheduled worker | `app/api/cron/outbox/route.ts` (Vercel cron) | Done |
| Delivery log UI + manual retry | Integrations page | Done |
| Idempotency ledger | `db/schema.ts` → `ticketNotifications`, unique on `(ticketId, kind, recipientEmail)` | Done, reused here |
| `ticket.created` emission | `lib/tickets.ts:147` | Replaced by this work |

## Architecture

```
domain mutation (inside its existing transaction)
        │
        ▼
  emitTicketEvent()            ← lib/ticket-events.ts (new)
        │  checks: per-event toggle, n8n connection enabled
        ▼
  deliveryLogs row  (integration_id='n8n', action='webhook', status='pending')
        │
        ▼
  cron/outbox → deliverPending() → runIntegration('n8n','webhook',payload)
        │                                   │
        │                                   ▼
        │                          POST <webhook_url>
        │                          X-Webhook-Secret, X-IRIS-Event-Id
        ▼
  success | retry with backoff | failed (visible in delivery log)
```

The emitter is deliberately the only new component. It has one public function,
depends on the config, the `integrations` table and `deliveryLogs`, and can be
tested without any network.

## Components

### 1. `src/lib/ticket-events.ts` (new)

```ts
export type TicketEventType =
  | 'ticket.created'
  | 'ticket.status_changed'
  | 'ticket.assigned'
  | 'ticket.resolved'
  | 'ticket.overdue'
  | 'ticket.escalated';

export async function emitTicketEvent(tx: Tx, input: {
  type: TicketEventType;
  ticket: typeof tickets.$inferSelect;       // the post-change row
  actor?: {id?: number; name: string};       // omitted for system events
  changes?: Record<string, {from: unknown; to: unknown}>;
  cfg?: WorkspaceConfig;                     // pass through when the caller already loaded it
}): Promise<boolean>;                        // true when a row was enqueued
```

Behaviour, in order:

1. Load config if not supplied. If `n8nEvents[key(type)]` is false → return false.
2. Select the `n8n` row from `integrations`. If missing or `enabled` is false →
   return false. This check exists so a disabled connection does not fill the
   outbox with rows that will burn six retries before parking as failed.
3. Insert one `deliveryLogs` row with `integrationId:'n8n'`, `action:'webhook'`,
   **`nextAttemptAt: new Date()`**, and the envelope below as `payload`.

The function never throws on delivery concerns; a webhook must not be able to
fail a ticket write. Config or integration lookup errors propagate (they mean
the database is unhealthy, which already fails the surrounding transaction).

It takes a transaction handle and is always called inside the caller's existing
transaction, so an event is never enqueued for a write that rolled back.

`Tx` is currently a private alias in `lib/tickets.ts` (line 19) and
`WorkspaceConfig` is exported from `lib/settings-contract.ts`. `Tx` must be
exported — from `db/index.ts` rather than `lib/tickets.ts`, so the new module
does not import from the file that imports it.

### 2. Event envelope

The top-level `{event, ticket}` shape of the current payload is preserved, so an
existing n8n workflow bound to `ticket.created` keeps working.

```json
{
  "event": "ticket.status_changed",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "occurredAt": "2026-09-28T11:04:22.118Z",
  "workspace": "Physique 57 India",
  "actor": { "id": 3, "name": "Jane Doe" },
  "changes": { "status": { "from": "assigned", "to": "in_progress" } },
  "ticket": {
    "id": 1284, "ticketNumber": "P57-1284",
    "title": "…", "summary": "…",
    "status": "in_progress", "priority": "high", "severity": "…",
    "category": "…", "subcategory": "…", "kind": "issue",
    "studio": "…", "area": "…",
    "memberName": "…", "memberEmail": "…", "memberPhone": "…",
    "assignedStaffId": 3, "assignedStaffName": "…", "assignedStaffEmail": "…",
    "departmentId": "…", "departmentName": "…",
    "resolutionRequired": true, "isEscalated": false,
    "slaHours": 24, "slaDueAt": "…", "resolvedAt": null, "closedAt": null,
    "tags": ["…"], "source": "workspace", "channel": "workspace",
    "createdAt": "…", "updatedAt": "…", "version": 4
  },
  "links": { "ticket": "https://iris.example/tickets/1284" }
}
```

Rules:

- **Ticket snapshot** is the `tickets` row after the change, restricted to the
  field list above. `description`, `customFields`, `momenceContext` and
  `_brief` are excluded — they are the bulk of the row's bytes and are not
  event-shaped. A workflow needing them reads the ticket via the API.
- **`eventId`** is a fresh UUID. `runIntegration` already forwards
  `payload.eventId` as the `X-IRIS-Event-Id` header, so n8n can deduplicate the
  at-least-once retries.
- **`actor`** is omitted for system-generated events (`ticket.overdue`,
  `ticket.escalated`) and for imports.
- **`changes`** is present on `ticket.status_changed`, `ticket.assigned` and
  `ticket.resolved`; absent on the others.
- **`links.ticket`** is built from `NEXT_PUBLIC_APP_URL`, falling back to
  `VERCEL_URL`. When neither is set the `links` key is omitted entirely rather
  than emitting a broken relative URL.

### 3. Call sites

All five sit inside a transaction that is already open.

| Event | Site | Condition |
|---|---|---|
| `ticket.created` | `insertTicketFromDraft`, `lib/tickets.ts` | Replaces line 147. **Skipped when `source === 'history'`** — a backfill of thousands of rows must not flood n8n. |
| `ticket.status_changed` | PATCH transaction, `api/tickets/[id]/route.ts` | Only when `status` is present and differs from `current.status`. |
| `ticket.assigned` | Same transaction | Only when `assignedStaffId` changed to a non-null value. Both events can fire from one PATCH; that is correct. |
| `ticket.resolved` | `resolveTicket`, `lib/tickets.ts` | Covers the `resolved` and `closed` paths, which bypass the PATCH transaction. Emits `ticket.resolved` only — not also `status_changed` — so a resolution is one event, not two. |
| `ticket.escalated` | `applyEscalations`, `lib/tickets.ts` | One event per escalated row, inside the existing transaction. |
| `ticket.overdue` | `emitOverdueEvents()` (new), called from `api/cron/outbox/route.ts` | See below. |

### 4. Overdue detection

The only genuinely new logic. Today nothing notices a breached follow-up target
unless `escalateAfterBreachHours` is set, and it defaults to `0` (off).

`emitOverdueEvents(now = new Date())` in `lib/tickets.ts`:

- Selects tickets where `resolutionRequired` is true, `status not in
  ('resolved','closed','recorded')`, `slaDueAt is not null` and `slaDueAt < now`.
- For each, inserts an idempotency row into `ticketNotifications` with
  `kind = 'webhook:overdue'` and `recipientEmail = 'n8n'`, using
  `onConflictDoNothing().returning()`. An empty return means this ticket was
  already reported → skip. The existing unique index on
  `(ticketId, kind, recipientEmail)` is what makes this safe; no migration is
  needed.
- Emits `ticket.overdue` for the rows that won the insert.

`recipientEmail` holds a channel name rather than an address here. The column
comment is widened to say the ledger covers one-shot per-ticket notifications,
not only emails.

Called from the cron route next to `queueSlaReminderEmails()`, on the first
batch only, matching how the reminder sweep is already invoked. A failure is
caught and logged without failing the cron run, matching the existing
`applyEscalations` error handling there.

Reopening a ticket does not clear the ledger row, so a ticket that breaches,
is resolved, is reopened and breaches again emits `ticket.overdue` once in
total. This is deliberate for a first version: the alternative is a churn of
repeated alerts for the same ticket. Noted as a known limitation.

### 5. Settings

`configSchema` in `lib/settings-contract.ts` gains:

```ts
n8nEvents: z.object({
  created:       z.boolean().default(false),
  statusChanged: z.boolean().default(false),
  assigned:      z.boolean().default(false),
  resolved:      z.boolean().default(false),
  overdue:       z.boolean().default(false),
  escalated:     z.boolean().default(false),
}).default({}),
```

`webhookOnCreate` stays in the schema, marked deprecated. The emitter treats
`created` as enabled when `n8nEvents.created || webhookOnCreate`, so a
workspace that has the old toggle on keeps receiving created events after
deploy without touching settings.

Settings → Automation replaces the single "Send ticket-created events to n8n"
checkbox with the six, grouped under a short heading, reusing the existing
`booleanSetting` helper and nested-key support. The existing warning box about
authorizing external delivery stays.

## Error handling

| Failure | Behaviour |
|---|---|
| n8n connection disabled or absent | No row enqueued. Event silently dropped — this is the toggle working. |
| Event toggle off | No row enqueued. |
| n8n returns 5xx / times out | Outbox retries with existing backoff (2, 4, 8, 16, 32 min … capped 6h) up to 6 attempts, then parks as `failed` in the delivery log for manual retry. |
| Worker dies mid-delivery | `releaseStuckDeliveries()` requeues after 10 min — which is why `nextAttemptAt` must be set at enqueue time. See "Bug fixed in passing". |
| n8n returns 4xx | Same retry path. A permanently bad URL parks as `failed` after 6 attempts. |
| Overdue sweep throws | Caught and logged in the cron route; the outbox drain and escalation sweep still run. |

## Bug fixed in passing

`lib/tickets.ts:147` enqueues the n8n row **without** `nextAttemptAt`.
`releaseStuckDeliveries()` only requeues stuck rows where that column is
non-null; rows with a null value are marked `failed` permanently on the
assumption they are interactive `loggedIntegration()` writes. So an n8n event
interrupted by a deploy or a function timeout is abandoned rather than retried.
The Mailtrap emitter three lines above sets it correctly.

The new emitter always sets `nextAttemptAt: new Date()`, which fixes this.

## Testing

The repo has no unit test runner; verification is by executable checks under
`scripts/`, wired into `npm test`. This work adds
`scripts/webhook-check.ts` and a `check:webhooks` script, following
`scripts/dashboard-check.ts`.

Assertions:

1. **Envelope shape** — each of the six event types produces a payload with the
   required envelope keys, a `ticket` object limited to the agreed field list,
   and no excluded field (`description`, `customFields`, `momenceContext`).
2. **Toggles gate** — with every toggle off, no rows are enqueued; with one on,
   exactly that event type is enqueued.
3. **Legacy setting** — `webhookOnCreate: true` with `n8nEvents.created: false`
   still emits `ticket.created`.
4. **Disabled connection** — with the n8n integration disabled, no rows are
   enqueued even with toggles on.
5. **History imports are silent** — `source: 'history'` emits nothing.
6. **Overdue fires once** — two consecutive `emitOverdueEvents()` runs over the
   same breached ticket enqueue exactly one row.
7. **Retry safety** — every enqueued row has a non-null `nextAttemptAt`.

Manual verification before shipping: point the n8n connector at a
`webhook.site`-style URL, create a ticket, change its status, resolve it, and
confirm three deliveries arrive with distinct `X-IRIS-Event-Id` headers and
succeed in the delivery log.

## Known limitations

- One webhook URL for all events; filtering happens in n8n.
- `ticket.overdue` fires at most once per ticket, ever (see §4).
- At-least-once delivery, not exactly-once. Consumers deduplicate on
  `X-IRIS-Event-Id`.
- Delivery latency is bounded by the cron interval, not instant.

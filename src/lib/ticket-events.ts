/**
 * Ticket lifecycle events → n8n.
 *
 * This module's only job is to turn a domain change into an outbox row. It does
 * not deliver anything: `deliveryLogs` rows are drained by lib/integrations.ts
 * (`deliverPending`) from the cron worker, which already owns retries, backoff,
 * dead-worker recovery and the give-up state shown in the delivery log.
 *
 * Every emit runs inside the caller's transaction, so an event is never queued
 * for a write that rolled back.
 */
import {eq} from 'drizzle-orm';
import {randomUUID} from 'crypto';
import type {Tx} from '@/db';
import {integrations, deliveryLogs, tickets} from '@/db/schema';
import {getConfig, type WorkspaceConfig} from './config';

export const TICKET_EVENTS = [
  'ticket.created',
  'ticket.status_changed',
  'ticket.assigned',
  'ticket.resolved',
  'ticket.overdue',
  'ticket.escalated',
] as const;
export type TicketEventType = (typeof TICKET_EVENTS)[number];

/** Event type → the `n8nEvents` toggle that gates it. */
const TOGGLE: Record<TicketEventType, keyof WorkspaceConfig['n8nEvents']> = {
  'ticket.created': 'created',
  'ticket.status_changed': 'statusChanged',
  'ticket.assigned': 'assigned',
  'ticket.resolved': 'resolved',
  'ticket.overdue': 'overdue',
  'ticket.escalated': 'escalated',
};

type TicketRow = typeof tickets.$inferSelect;

/** The fields a webhook carries. `description`, `customFields` and `momenceContext`
 *  are deliberately excluded — they are most of the row's bytes and a workflow that
 *  needs them can read the ticket back through the API. */
const SNAPSHOT_FIELDS = [
  'id', 'ticketNumber', 'title', 'summary',
  'status', 'priority', 'severity', 'category', 'subcategory', 'kind',
  'studio', 'area', 'classFormat', 'trainer', 'membership',
  'memberName', 'memberEmail', 'memberPhone',
  'assignedStaffId', 'assignedStaffName', 'assignedStaffEmail',
  'departmentId', 'departmentName',
  'resolutionRequired', 'isEscalated',
  'slaHours', 'slaDueAt', 'resolvedAt', 'closedAt',
  'tags', 'source', 'channel',
  'createdAt', 'updatedAt', 'version',
] as const satisfies readonly (keyof TicketRow)[];

export function ticketSnapshot(ticket: TicketRow) {
  const out: Record<string, unknown> = {};
  for (const key of SNAPSHOT_FIELDS) {
    const value = ticket[key];
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** Absolute URL of the app, for the `links` block. Returns null when neither env
 *  var is set, in which case `links` is left out rather than emitting a relative URL. */
function appOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  return vercel ? 'https://' + vercel.replace(/\/+$/, '') : null;
}

export type TicketEventChanges = Record<string, {from: unknown; to: unknown}>;

export function buildTicketEvent(input: {
  type: TicketEventType;
  ticket: TicketRow;
  cfg: WorkspaceConfig;
  actor?: {id?: number | null; name: string};
  changes?: TicketEventChanges;
}) {
  const origin = appOrigin();
  return {
    event: input.type,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    workspace: input.cfg.workspaceName,
    ...(input.actor ? {actor: {id: input.actor.id ?? null, name: input.actor.name}} : {}),
    ...(input.changes && Object.keys(input.changes).length ? {changes: input.changes} : {}),
    ticket: ticketSnapshot(input.ticket),
    ...(origin ? {links: {ticket: `${origin}/tickets/${input.ticket.id}`}} : {}),
  };
}

/** Whether an event type is switched on. `ticket.created` also honours the
 *  superseded `webhookOnCreate` flag so an existing workspace keeps working. */
export function eventEnabled(cfg: WorkspaceConfig, type: TicketEventType) {
  if (type === 'ticket.created' && cfg.webhookOnCreate) return true;
  return Boolean(cfg.n8nEvents?.[TOGGLE[type]]);
}

/**
 * Queue one ticket event for delivery to n8n. Returns true when a row was
 * written — false means the event type is switched off or the n8n connection is
 * absent or disabled, both of which are normal and silent.
 *
 * The enabled check happens here rather than at delivery time so a disabled
 * connection does not fill the outbox with rows that burn six retries each
 * before parking as failed.
 */
export async function emitTicketEvent(tx: Tx, input: {
  type: TicketEventType;
  ticket: TicketRow;
  actor?: {id?: number | null; name: string};
  changes?: TicketEventChanges;
  /** Pass the config through when the caller already loaded it, to avoid a second read. */
  cfg?: WorkspaceConfig | null;
}): Promise<boolean> {
  const cfg = input.cfg ?? (await getConfig());
  if (!eventEnabled(cfg, input.type)) return false;
  const [connection] = await tx.select({enabled: integrations.enabled}).from(integrations).where(eq(integrations.id, 'n8n'));
  if (!connection?.enabled) return false;
  await tx.insert(deliveryLogs).values({
    integrationId: 'n8n',
    action: 'webhook',
    // Must be set: releaseStuckDeliveries() only requeues interrupted rows that
    // carry one, and treats a null as an interactive write never to be replayed.
    nextAttemptAt: new Date(),
    payload: buildTicketEvent({type: input.type, ticket: input.ticket, cfg, actor: input.actor, changes: input.changes}),
  });
  return true;
}

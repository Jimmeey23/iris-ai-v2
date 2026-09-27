/**
 * The n8n ticket-event contract: envelope shape, what the snapshot carries, and the
 * toggles that gate emission.
 *
 * No database. The outbox insert is exercised against a stub transaction, which is
 * enough to prove the gating and the row shape. Two behaviours cannot be covered
 * here and are verified manually before release (see the spec):
 *   - a `source: 'history'` import emits nothing
 *   - emitOverdueEvents() enqueues at most once per ticket
 */
// db/index.ts requires this at import time; the pool is lazy, so nothing connects.
process.env.DATABASE_URL ||= 'postgres://check:check@127.0.0.1:5432/check';
process.env.NEXT_PUBLIC_APP_URL ||= 'https://iris.example';

import {DEFAULT_CONFIG, type WorkspaceConfig} from '../src/lib/settings-contract';
import {buildTicketEvent, emitTicketEvent, eventEnabled, ownerOf, TICKET_EVENTS, ticketSnapshot} from '../src/lib/ticket-events';
import type {Tx} from '../src/db';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); }
};
const section = (t: string) => console.log('\n' + t);

/* ── Fixtures ──────────────────────────────────────────────────────────── */

type TicketRow = Parameters<typeof ticketSnapshot>[0];
const ticket = (over: Record<string, unknown> = {}) => ({
  id: 1284, ticketNumber: 'P57-01284', title: 'Mic cutting out in Studio 2',
  summary: 'Reported by A Member', description: 'A long narrative that must not be sent.',
  status: 'assigned', priority: 'high', severity: 'major',
  category: 'Tech Issues', subcategory: 'Mic Not Working', kind: 'issue',
  studio: 'Kwality House, Kemps Corner', area: 'Studio 2',
  classFormat: null, trainer: null, membership: null,
  memberName: 'A Member', memberEmail: 'a@example.com', memberPhone: '+910000000000',
  assignedStaffId: 3, assignedStaffName: 'Shifa Ali', assignedStaffEmail: 's@example.com',
  departmentId: 'ops', departmentName: 'Operations',
  resolutionRequired: true, isEscalated: false,
  slaHours: 24, slaDueAt: new Date('2026-09-29T06:00:00.000Z'),
  resolvedAt: null, closedAt: null,
  tags: ['tech-issues'], source: 'workspace', channel: 'workspace',
  createdAt: new Date('2026-09-28T06:00:00.000Z'), updatedAt: new Date('2026-09-28T07:00:00.000Z'),
  version: 4,
  customFields: {_brief: {routingReason: 'secret'}}, momenceContext: {big: 'blob'},
  ...over,
}) as unknown as TicketRow;

const config = (over: Partial<WorkspaceConfig> = {}): WorkspaceConfig =>
  ({...DEFAULT_CONFIG, ...over});
const allOn = config({n8nEvents: {created: true, statusChanged: true, assigned: true, resolved: true, overdue: true, escalated: true}});

/** A stub transaction: records inserted rows, answers the n8n-enabled lookup. */
function stubTx(enabled: boolean | undefined) {
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({from: () => ({where: async () => (enabled === undefined ? [] : [{enabled}])})}),
    insert: () => ({values: async (row: Record<string, unknown>) => { inserted.push(row); }}),
  } as unknown as Tx;
  return {tx, inserted};
}

/* ── Envelope ──────────────────────────────────────────────────────────── */

section('Event envelope');
const created = buildTicketEvent({type: 'ticket.created', ticket: ticket(), cfg: allOn, actor: {id: 3, name: 'Jane'}});
check('carries the event type', created.event === 'ticket.created', created.event);
check('carries a unique eventId', /^[0-9a-f-]{36}$/.test(created.eventId), created.eventId);
check('carries an ISO occurredAt', !Number.isNaN(Date.parse(created.occurredAt)), created.occurredAt);
check('carries the workspace name', created.workspace === DEFAULT_CONFIG.workspaceName, created.workspace);
check('carries the actor', JSON.stringify((created as {actor?: unknown}).actor) === '{"id":3,"name":"Jane"}', (created as {actor?: unknown}).actor);
check('builds an absolute ticket link', (created as {links?: {ticket: string}}).links?.ticket === 'https://iris.example/tickets/1284', (created as {links?: unknown}).links);
check('two events get different ids', created.eventId !== buildTicketEvent({type: 'ticket.created', ticket: ticket(), cfg: allOn}).eventId);
check('actor omitted for system events', !('actor' in buildTicketEvent({type: 'ticket.overdue', ticket: ticket(), cfg: allOn})));

section('Owner and link');
const withOwner = buildTicketEvent({type: 'ticket.created', ticket: ticket(), cfg: allOn, owner: ownerOf(ticket(), '+919137261245')});
const owner = (withOwner as {owner?: Record<string, unknown>}).owner ?? {};
check('carries the owner name', owner.name === 'Shifa Ali', owner);
check('carries the owner email', owner.email === 's@example.com', owner);
check('carries the owner phone', owner.phone === '+919137261245', owner);
check('carries the owner staff id and department', owner.staffId === 3 && owner.department === 'Operations', owner);
check('an unassigned ticket has no owner block',
  ownerOf(ticket({assignedStaffId: null, assignedStaffName: null})) === null);
check('an owner with no phone on file reports null, not missing',
  ownerOf(ticket())?.phone === null, ownerOf(ticket())?.phone);
check('the ticket object also carries the link',
  (withOwner.ticket as {url?: string}).url === 'https://iris.example/tickets/1284',
  (withOwner.ticket as {url?: string}).url);
check('links.ticket still present for existing workflows',
  (withOwner as {links?: {ticket: string}}).links?.ticket === 'https://iris.example/tickets/1284');

section('Ticket snapshot');
const snap = created.ticket as Record<string, unknown>;
check('includes the identifying fields', snap.id === 1284 && snap.ticketNumber === 'P57-01284' && snap.status === 'assigned');
check('excludes description', !('description' in snap));
check('excludes customFields', !('customFields' in snap));
check('excludes momenceContext', !('momenceContext' in snap));
check('serialises dates as ISO strings', snap.createdAt === '2026-09-28T06:00:00.000Z', snap.createdAt);
check('keeps nulls as null, not dropped', 'resolvedAt' in snap && snap.resolvedAt === null);
check('keeps tags as an array', Array.isArray(snap.tags), snap.tags);

section('Change diffs');
const moved = buildTicketEvent({type: 'ticket.status_changed', ticket: ticket({status: 'in_progress'}), cfg: allOn, actor: {name: 'Jane'}, changes: {status: {from: 'assigned', to: 'in_progress'}}});
check('status_changed carries the diff', JSON.stringify((moved as {changes?: unknown}).changes) === '{"status":{"from":"assigned","to":"in_progress"}}', (moved as {changes?: unknown}).changes);
check('escalated carries no diff', !('changes' in buildTicketEvent({type: 'ticket.escalated', ticket: ticket(), cfg: allOn})));
check('an empty diff is omitted, not sent as {}', !('changes' in buildTicketEvent({type: 'ticket.overdue', ticket: ticket(), cfg: allOn, changes: {}})));

/* ── Toggles ───────────────────────────────────────────────────────────── */

section('Toggles');
const allOff = config();
check('every event is off by default', TICKET_EVENTS.every(t => !eventEnabled(allOff, t)));
check('every event can be switched on', TICKET_EVENTS.every(t => eventEnabled(allOn, t)));
check('one toggle enables only its own event', (() => {
  const only = config({n8nEvents: {...allOff.n8nEvents, overdue: true}});
  return eventEnabled(only, 'ticket.overdue') && !eventEnabled(only, 'ticket.created');
})());
check('the superseded webhookOnCreate still enables created', eventEnabled(config({webhookOnCreate: true}), 'ticket.created'));
check('webhookOnCreate does not enable anything else', !eventEnabled(config({webhookOnCreate: true}), 'ticket.resolved'));

/* ── Enqueue ───────────────────────────────────────────────────────────── */

section('Outbox enqueue');
async function enqueueChecks() {
  const on = stubTx(true);
  const queued = await emitTicketEvent(on.tx, {type: 'ticket.created', ticket: ticket(), cfg: allOn, actor: {name: 'IRIS'}});
  check('enqueues when enabled and switched on', queued === true && on.inserted.length === 1, on.inserted.length);
  const row = on.inserted[0] ?? {};
  check('targets the n8n webhook action', row.integrationId === 'n8n' && row.action === 'webhook', row);
  check('sets nextAttemptAt so an interrupted send is retried', row.nextAttemptAt instanceof Date, row.nextAttemptAt);
  check('payload is the event envelope', (row.payload as {event?: string})?.event === 'ticket.created', row.payload);

  const off = stubTx(true);
  const skipped = await emitTicketEvent(off.tx, {type: 'ticket.created', ticket: ticket(), cfg: allOff});
  check('enqueues nothing when the toggle is off', skipped === false && off.inserted.length === 0, off.inserted.length);

  const disabled = stubTx(false);
  const blocked = await emitTicketEvent(disabled.tx, {type: 'ticket.created', ticket: ticket(), cfg: allOn});
  check('enqueues nothing when the n8n connection is disabled', blocked === false && disabled.inserted.length === 0, disabled.inserted.length);

  const missing = stubTx(undefined);
  const none = await emitTicketEvent(missing.tx, {type: 'ticket.created', ticket: ticket(), cfg: allOn});
  check('enqueues nothing when n8n was never connected', none === false && missing.inserted.length === 0, missing.inserted.length);
}

enqueueChecks().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
});

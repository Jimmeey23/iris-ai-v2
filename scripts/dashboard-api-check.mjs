/**
 * The server side of the board: preferences really persisting, the new workspace settings
 * saving and taking effect, and the re-label action.
 */
import 'dotenv/config';
import {randomBytes, scryptSync, randomUUID} from 'node:crypto';
import {eq, inArray, like} from 'drizzle-orm';
import {db, pool} from '../src/db/index.ts';
import {appUsers, appSettings, auditLogs, tickets, ticketResolutions} from '../src/db/schema.ts';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + '   got: ' + JSON.stringify(d)); } };
const section = (t) => console.log('\n' + t);

function client() {
  const cookies = new Map();
  return async (path, method = 'GET', body) => {
    const res = await fetch(base + path, {
      method,
      headers: {'Content-Type': 'application/json', Origin: base, Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; ')},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const part = line.split(';')[0], i = part.indexOf('=');
      cookies.set(part.slice(0, i), part.slice(i + 1));
    }
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = {raw: text}; }
    return {status: res.status, body: parsed};
  };
}

const admin = client(), agent = client(), viewer = client();
const userIds = [], createdTickets = [];
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const passwordHash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
const originalSettings = await db.select().from(appSettings).where(eq(appSettings.key, 'workspace'));

try {
  const used = await db.select({staffId: appUsers.staffId}).from(appUsers);
  const staffId = [31, 24, 19, 3, 16, 9].find((id) => !used.some((u) => u.staffId === id));
  const stamp = Date.now();
  for (const [role, sid] of [['admin', null], ['agent', staffId], ['viewer', null]]) {
    const email = `iris-dash-${role}-${stamp}@example.invalid`;
    const [u] = await db.insert(appUsers).values({name: 'IRIS DASH ' + role, email, passwordHash, role, staffId: sid}).returning();
    userIds.push(u.id);
    const c = role === 'admin' ? admin : role === 'agent' ? agent : viewer;
    await c('/api/auth', 'POST', {action: 'login', email, password});
  }

  section('Board preferences live in the database, not the browser');
  const first = await agent('/api/preferences');
  check('preferences come back with a dashboard block', Boolean(first.body.dashboard), first.body);
  check('it has the default columns', Array.isArray(first.body.dashboard?.columns) && first.body.dashboard.columns.length > 0, first.body.dashboard?.columns);

  await agent('/api/preferences', 'PATCH', {dashboard: {groupBy: 'studio', density: 'compact', pageSize: 50}});
  let read = await agent('/api/preferences');
  check('grouping persists', read.body.dashboard.groupBy === 'studio', read.body.dashboard.groupBy);
  check('density persists', read.body.dashboard.density === 'compact', read.body.dashboard.density);
  check('page size persists', read.body.dashboard.pageSize === 50, read.body.dashboard.pageSize);

  // The bug this guards: a partial save replacing the whole nested object.
  await agent('/api/preferences', 'PATCH', {dashboard: {sortKey: 'priority'}});
  read = await agent('/api/preferences');
  check('a later partial save keeps the earlier one', read.body.dashboard.groupBy === 'studio' && read.body.dashboard.pageSize === 50, read.body.dashboard);
  check('and applies the new value', read.body.dashboard.sortKey === 'priority', read.body.dashboard.sortKey);

  await agent('/api/preferences', 'PATCH', {dashboard: {filters: {studio: 'Supreme HQ, Bandra'}}});
  await agent('/api/preferences', 'PATCH', {dashboard: {filters: {priorities: ['high']}}});
  read = await agent('/api/preferences');
  check('filters merge rather than replace', read.body.dashboard.filters.studio === 'Supreme HQ, Bandra' && read.body.dashboard.filters.priorities.length === 1, read.body.dashboard.filters);

  check('an invalid column is refused', (await agent('/api/preferences', 'PATCH', {dashboard: {columns: ['nonsense']}})).status === 400);
  check('an absurd page size is refused', (await agent('/api/preferences', 'PATCH', {dashboard: {pageSize: 9999}})).status === 400);

  section('Preferences are per person');
  const mine = await viewer('/api/preferences');
  check('another user does not inherit them', mine.body.dashboard.groupBy !== 'studio', mine.body.dashboard.groupBy);

  section('Saved views persist');
  await agent('/api/preferences', 'PATCH', {views: [{name: 'Bandra high', filters: {studio: 'Supreme HQ, Bandra', priorities: ['high']}, groupBy: 'status', view: 'list'}]});
  read = await agent('/api/preferences');
  check('a saved view comes back', read.body.views?.[0]?.name === 'Bandra high', read.body.views);
  check('it carries its filters', read.body.views[0].filters.studio === 'Supreme HQ, Bandra', read.body.views[0].filters);

  section('The new workspace settings save');
  const settings = (await admin('/api/settings')).body;
  check('the new keys are present', settings.config.labelStyle !== undefined && settings.config.staleTicketDays !== undefined, Object.keys(settings.config).length);
  const cfg = {...settings.config, staleTicketDays: 7, defaultGroupBy: 'category', defaultDensity: 'compact', labelMaxLength: 90, allowReopen: false, requireResolutionNotes: true};
  const saved = await admin('/api/settings', 'PUT', {config: cfg, version: settings.version});
  check('they save', saved.status === 200, saved.body);
  const after = (await admin('/api/settings')).body;
  check('and read back', after.config.staleTicketDays === 7 && after.config.defaultGroupBy === 'category', after.config.staleTicketDays);
  check('the board defaults reach the public scope', (await viewer('/api/settings?scope=public')).body.staleTicketDays === 7);
  check('an out-of-range value is refused', (await admin('/api/settings', 'PUT', {config: {...cfg, staleTicketDays: 900}, version: after.version})).status === 400);

  section('The workspace default seeds a new person');
  const fresh = client();
  const freshEmail = `iris-dash-fresh-${stamp}@example.invalid`;
  const [fu] = await db.insert(appUsers).values({name: 'IRIS DASH fresh', email: freshEmail, passwordHash, role: 'agent'}).returning();
  userIds.push(fu.id);
  await fresh('/api/auth', 'POST', {action: 'login', email: freshEmail, password});
  const freshPrefs = await fresh('/api/preferences');
  check('a new person starts on the workspace default', freshPrefs.body.dashboard.groupBy === 'category', freshPrefs.body.dashboard.groupBy);
  check('and their own choice then overrides it', await (async () => {
    await fresh('/api/preferences', 'PATCH', {dashboard: {groupBy: 'owner'}});
    return (await fresh('/api/preferences')).body.dashboard.groupBy === 'owner';
  })());

  section('Reopening and resolution policy actually apply');
  const made = await agent('/api/tickets', 'POST', {
    description: 'Dashboard check: the front desk microphone cuts out halfway through every class.',
    category: 'Tech Issues', subcategory: 'Mic Not Working', kind: 'issue',
    studio: 'Kwality House, Kemps Corner', memberName: 'QA Member', memberEmail: 'qa-dash@example.invalid',
    incidentAt: 'Today', source: 'manual', submissionKey: randomUUID(),
  });
  if (made.status !== 201) {
    check('a ticket could be logged', false, made.body);
  } else {
    const t = made.body.ticket;
    createdTickets.push(t.id);
    check('the new ticket got a descriptive label', /microphone|cuts out/i.test(t.title), t.title);
    check('the label is not the old taxonomy format', !t.title.includes(' · '), t.title);

    const assigned = await admin('/api/tickets/' + t.id, 'PATCH', {assignedStaffId: staffId, version: t.version});
    const v1 = assigned.body.ticket.version;
    await agent('/api/tickets/' + t.id + '/resolution', 'PUT', {rootCause: '', actionTaken: 'Swapped the mic', preventiveAction: '', memberOutcome: 'Class continued'});
    const blocked = await agent('/api/tickets/' + t.id, 'PATCH', {status: 'resolved', version: v1});
    check('resolving is blocked without a root cause when required', blocked.status === 400 && /root cause/i.test(blocked.body.error || ''), blocked.body);

    await agent('/api/tickets/' + t.id + '/resolution', 'PUT', {rootCause: 'Loose connector', actionTaken: 'Swapped the mic', preventiveAction: 'Monthly cable check', memberOutcome: 'Class continued'});
    const resolved = await agent('/api/tickets/' + t.id, 'PATCH', {status: 'resolved', version: v1});
    check('resolving succeeds once the record is complete', resolved.status === 200, resolved.body);

    const reopen = await agent('/api/tickets/' + t.id, 'PATCH', {status: 'in_progress', version: resolved.body.ticket.version});
    check('reopening is refused when the workspace forbids it', reopen.status === 409, reopen.body);

    await admin('/api/settings', 'PUT', {config: {...cfg, allowReopen: true, staleTicketDays: 7}, version: (await admin('/api/settings')).body.version});
    const reopened = await agent('/api/tickets/' + t.id, 'PATCH', {status: 'in_progress', version: resolved.body.ticket.version});
    check('and allowed once it is switched back on', reopened.status === 200, reopened.body);
  }

  section('Re-labelling historical tickets');
  check('a viewer cannot run it', (await viewer('/api/settings', 'POST', {action: 'relabel'})).status === 403);
  check('an agent cannot run it', (await agent('/api/settings', 'POST', {action: 'relabel'})).status === 403);
  const dry = await admin('/api/settings', 'POST', {action: 'relabel'});
  check('an administrator gets a preview', dry.status === 200 && dry.body.applied === false, dry.body?.applied);
  check('the preview reports what it scanned', typeof dry.body.scanned === 'number' && dry.body.scanned > 0, dry.body.scanned);
  check('the preview shows before and after', !dry.body.samples.length || (dry.body.samples[0].from !== undefined && dry.body.samples[0].to !== undefined), dry.body.samples?.[0]);
  check('a preview writes nothing', await (async () => {
    const before = (await db.select({t: tickets.title}).from(tickets).limit(1))[0].t;
    await admin('/api/settings', 'POST', {action: 'relabel'});
    return (await db.select({t: tickets.title}).from(tickets).limit(1))[0].t === before;
  })());

  console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed`);
} finally {
  if (createdTickets.length) {
    await db.delete(ticketResolutions).where(inArray(ticketResolutions.ticketId, createdTickets));
    await db.delete(tickets).where(inArray(tickets.id, createdTickets));
  }
  await db.delete(appSettings).where(eq(appSettings.key, 'workspace'));
  for (const s of originalSettings) await db.insert(appSettings).values(s);
  if (userIds.length) {
    await db.delete(appSettings).where(inArray(appSettings.key, userIds.map((id) => 'preferences:user:' + id)));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
    await db.delete(appUsers).where(inArray(appUsers.id, userIds));
  }
  await pool.end();
}
if (fail) process.exit(1);

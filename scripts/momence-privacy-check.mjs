/**
 * The Momence directory: who may browse it, and when contact details are visible.
 *
 * The assertions that matter are the negative ones — masked data must be masked *in the
 * response*, not merely hidden in the UI, and the ticket-form lookup must keep working for
 * staff who cannot browse the directory.
 *
 * Run: TEST_BASE_URL=http://localhost:3000 npm run check:momence
 */
import 'dotenv/config';
import {db, pool} from '../src/db/index.ts';
import {appUsers, appSettings, auditLogs, staff} from '../src/db/schema.ts';
import {eq, inArray} from 'drizzle-orm';
import {createTestUser, deleteTestAuthUsers} from './lib/test-auth.mjs';
import {maskEmail, maskPhone, maskText} from '../src/lib/momence-privacy.ts';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const mk = () => { const c = new Map(); return async (p, m = 'GET', b) => {
  const r = await fetch(base + p, {method: m, headers: {'Content-Type': 'application/json', Origin: base, Cookie: [...c].map(([k, v]) => k + '=' + v).join('; ')}, body: b === undefined ? undefined : JSON.stringify(b)});
  for (const l of r.headers.getSetCookie()) { const q = l.split(';')[0], i = q.indexOf('='); c.set(q.slice(0, i), q.slice(i + 1)); }
  return {status: r.status, body: await r.json().catch(() => ({}))};
}; };

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fail++; };
const ids = [], auth = [];
try {
  // masking is pure, so check it directly first
  ok(maskEmail('priya.mehta@example.com') === 'p••••••••••@example.com', 'email keeps only the first letter and the domain: ' + maskEmail('priya.mehta@example.com'));
  ok(maskPhone('+91 98765 43210') === '••••••••••10', 'phone keeps the last two digits: ' + maskPhone('+91 98765 43210'));
  ok(!maskText('reach me on priya@example.com or +91 98765 43210').includes('priya@example.com'), 'a free-text line is masked too');

  const t = Date.now();
  const used = await db.select({staffId: appUsers.staffId}).from(appUsers);
  const taken = new Set(used.map(u => u.staffId).filter(Boolean));
  const opsStaff = (await db.select().from(staff)).filter(s => !taken.has(s.id) && /operations|training|accounts/i.test(s.department))[0];

  const admin = mk(), ops = mk(), salesAgent = mk();
  // Each account is registered for cleanup the moment it exists: a failure creating the
  // second one must not strand the first.
  const make = async (opts) => { const u = await createTestUser(opts); ids.push(u.id); auth.push(u.supabaseUserId); return u; };
  const A = await make({name: 'QA Admin ' + t, email: `iris-mom-a-${t}@example.invalid`, role: 'admin'});
  const B = await make({name: 'QA Ops ' + t, email: `iris-mom-b-${t}@example.invalid`, role: 'agent', staffId: opsStaff?.id ?? null});
  await db.update(appUsers).set({department: 'Operations'}).where(eq(appUsers.id, B.id));
  // Sales staff are the interesting negative case: they work with members daily and still
  // may not browse the directory, because only administrators may.
  const C = await make({name: 'QA Sales ' + t, email: `iris-mom-c-${t}@example.invalid`, role: 'agent'});
  await db.update(appUsers).set({department: 'Sales & Client Servicing', studio: 'Kwality House, Kemps Corner'}).where(eq(appUsers.id, C.id));
  await admin('/api/auth', 'POST', {action: 'login', email: A.email, password: A.password});
  await ops('/api/auth', 'POST', {action: 'login', email: B.email, password: B.password});
  await salesAgent('/api/auth', 'POST', {action: 'login', email: C.email, password: C.password});

  // access: administrators only
  ok((await ops('/api/momence?module=members&surface=browse')).status === 403, 'operations staff cannot browse the member directory');
  ok((await ops('/api/momence?module=sales&surface=browse')).status === 403, 'nor the sales directory');
  ok((await salesAgent('/api/momence?module=memberships&surface=browse')).status === 403, 'nor the membership ledger');
  const salesMembers = await salesAgent('/api/momence?module=members&surface=browse');
  ok(salesMembers.status === 200, 'the client-servicing team CAN browse members');
  // …but only their own city: a Mumbai agent asking for Bengaluru gets Mumbai, not an error.
  const asked = await salesAgent('/api/momence?module=members&surface=browse&studio=' + encodeURIComponent('Kenkere House, Bengaluru'));
  ok(asked.status === 200, 'asking for another city does not error');
  ok(JSON.stringify(asked.body.items || []) === JSON.stringify(salesMembers.body.items || []),
    'and returns their own city regardless of the studio in the query');
  ok((await ops('/api/momence?module=sessions&surface=browse')).status === 200, 'but sessions stay open to everyone');
  ok((await ops('/api/momence?module=studios&surface=browse')).status === 200, 'and so do studios');
  const salesList = await admin('/api/momence?module=members&surface=browse');
  ok(salesList.status === 200, 'an administrator can browse members');

  // the lookup inside a ticket form must keep working for everyone
  const lookup = await ops('/api/momence?module=members');
  ok(lookup.status === 200, 'the ticket-form member lookup still works for operations staff');
  const lookupText = JSON.stringify(lookup.body);
  ok(!lookupText.includes('•'), 'and it is NOT masked — intake needs the real contact details to file a ticket');

  // masking on the browsing surface
  const masked = JSON.stringify(salesList.body);
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.test(masked.replace(/example\.invalid/g, ''));
  ok(!hasEmail, 'browsing without the passcode returns no readable email address');

  ok((await admin('/api/momence/unlock', 'POST', {code: '0000'})).status === 403, 'a wrong passcode is refused');
  ok((await admin('/api/momence/unlock', 'POST', {code: '9818'})).status === 200, 'the right passcode unlocks');
  const revealed = await admin('/api/momence?module=members&surface=browse');
  ok(JSON.stringify(revealed.body) !== masked, 'and the same request now returns different (unmasked) data');
  ok((await admin('/api/momence/unlock')).body.unlocked === true, 'the unlock is reported as active');
  await admin('/api/momence/unlock', 'DELETE');
  ok((await admin('/api/momence/unlock')).body.unlocked === false, 'and can be locked again');

  // the unlock belongs to one person
  ok((await ops('/api/momence/unlock')).body.unlocked === false, 'one person unlocking does not unlock it for anybody else');
  console.log(fail ? `\n${fail} FAILED` : '\nall passed');
} finally {
  await deleteTestAuthUsers(auth);
  if (ids.length) {
    await db.delete(appSettings).where(inArray(appSettings.key, ids.map(i => 'preferences:user:' + i)));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, ids));
    await db.delete(appUsers).where(inArray(appUsers.id, ids));
  }
  await pool.end();
}
process.exit(fail ? 1 : 0);

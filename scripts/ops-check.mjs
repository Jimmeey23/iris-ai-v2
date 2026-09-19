/**
 * Checks the operational fixes that have no UI of their own: the rate limiter on the
 * endpoints that spend OpenAI credit, and attachment storage actually storing bytes.
 */
import 'dotenv/config';
import {randomBytes, scryptSync} from 'node:crypto';
import {eq, inArray, like} from 'drizzle-orm';
import {db, pool} from '../src/db/index.ts';
import {appUsers, auditLogs, chatAttachments, chatMessages, chatSessions, rateLimits} from '../src/db/schema.ts';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + '   got: ' + JSON.stringify(d)); } };
const section = (t) => console.log('\n' + t);

const cookies = new Map();
const cookieHeader = () => [...cookies].map(([k, v]) => k + '=' + v).join('; ');
function absorb(res) {
  for (const line of res.headers.getSetCookie()) {
    const part = line.split(';')[0], i = part.indexOf('=');
    cookies.set(part.slice(0, i), part.slice(i + 1));
  }
}
async function call(path, method = 'GET', body) {
  const res = await fetch(base + path, {
    method,
    headers: {'Content-Type': 'application/json', Origin: base, Cookie: cookieHeader()},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  absorb(res);
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = {raw: text}; }
  return {status: res.status, body: parsed};
}
async function upload(form) {
  const res = await fetch(base + '/api/iris/upload', {method: 'POST', headers: {Origin: base, Cookie: cookieHeader()}, body: form});
  absorb(res);
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = {raw: text}; }
  return {status: res.status, body: parsed};
}

const userIds = [];
const sessionIds = [];
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const passwordHash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
const stamp = Date.now();

try {
  const email = `iris-ops-${stamp}@example.invalid`;
  const [u] = await db.insert(appUsers).values({name: 'IRIS OPS', email, passwordHash, role: 'agent'}).returning();
  userIds.push(u.id);
  await call('/api/auth', 'POST', {action: 'login', email, password});

  section('The AI endpoints are rate limited');
  // /api/iris/speak allows 20 a minute. An empty `text` is rejected before the OpenAI call
  // is made, so the burst costs nothing and — just as importantly — stays fast enough to
  // land inside a single 60-second window. Sending real text made each call take a second
  // or two of speech synthesis, which spread 26 calls across more than one window and let
  // the counter legitimately reset before the limit was reached.
  let limited = null, statuses = [];
  for (let i = 0; i < 26; i++) {
    const r = await call('/api/iris/speak', 'POST', {text: ''});
    statuses.push(r.status);
    if (r.status === 429) { limited = r; break; }
  }
  check('a burst is eventually refused with 429', limited?.status === 429, statuses);
  check('the refusal says when to retry', /try again in \d+ second/i.test(limited?.body?.error || ''), limited?.body);
  check('the limit is not hit on the first call', statuses[0] !== 429, statuses[0]);
  check('the calls before the limit were let through', statuses.filter((c) => c !== 429).length === 20, statuses);
  const stored = await db.select().from(rateLimits).where(like(rateLimits.key, 'speak:%'));
  check('the counter is in the database, not in memory', stored.length > 0, stored.length);

  section('Attachments are actually stored');
  const started = await call('/api/iris/chat', 'POST', {preset: {category: 'Tech Issues', subcategory: 'Laptops Not Working'}});
  const sessionId = started.body?.sessionId;
  if (!sessionId) {
    check('a conversation could be started for the upload check', false, started.body);
  } else {
    sessionIds.push(sessionId);
    const bytes = Buffer.from('IRIS upload check ' + stamp);
    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('file', new File([bytes], 'check.txt', {type: 'text/plain'}));
    const up = await upload(form);
    check('the upload succeeds', up.status === 200, up.body);
    const att = up.body?.attachments?.[0];
    check('it reports the real byte length', att?.fileSize === bytes.byteLength, att);
    const [row] = await db.select().from(chatAttachments).where(eq(chatAttachments.id, att?.id || 'none'));
    check('the bytes reached the database', Boolean(row?.data) && Buffer.from(row.data).equals(bytes), row?.data ? Buffer.from(row.data).toString() : null);
    check('a checksum is recorded', Boolean(row?.checksum), row?.checksum);
    check('the stored url is not the old placeholder', !String(att?.storageUrl || '').startsWith('/uploads/'), att?.storageUrl);

    const fetched = await fetch(base + att.storageUrl, {headers: {Cookie: cookieHeader()}});
    const back = Buffer.from(await fetched.arrayBuffer());
    check('the file can be read back', fetched.status === 200 && back.equals(bytes), {status: fetched.status, back: back.toString()});
    check('it is served as its own content type', fetched.headers.get('content-type') === 'text/plain', fetched.headers.get('content-type'));
    check('it is not served to a shared cache', /private/.test(fetched.headers.get('cache-control') || ''), fetched.headers.get('cache-control'));

    const stranger = await fetch(base + att.storageUrl);
    check('someone else cannot read it', stranger.status === 404 || stranger.status === 401, stranger.status);

    const badForm = new FormData();
    badForm.set('sessionId', 'not-a-session-of-mine');
    badForm.set('file', new File([bytes], 'check.txt', {type: 'text/plain'}));
    const badUp = await upload(badForm);
    check('a file cannot be attached to a conversation you do not own', badUp.status === 404, badUp.body);

    const badType = new FormData();
    badType.set('sessionId', sessionId);
    badType.set('file', new File([bytes], 'x.exe', {type: 'application/x-msdownload'}));
    check('a disallowed type is refused', (await upload(badType)).status === 400);
  }

  console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed`);
} finally {
  if (sessionIds.length) {
    await db.delete(chatAttachments).where(inArray(chatAttachments.sessionId, sessionIds));
    await db.delete(chatMessages).where(inArray(chatMessages.sessionId, sessionIds));
    await db.delete(chatSessions).where(inArray(chatSessions.id, sessionIds));
  }
  await db.delete(rateLimits).where(like(rateLimits.key, '%user:' + (userIds[0] ?? 0)));
  if (userIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
    await db.delete(appUsers).where(inArray(appUsers.id, userIds));
  }
  await pool.end();
}
if (fail) process.exit(1);

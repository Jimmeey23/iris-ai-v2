/**
 * End-to-end check for the equipment register.
 *
 * Exercises the whole management surface against a running server: locations, adding one
 * item with its full detail, bulk import including the rows that should fail, editing,
 * per-type ticket counts, the retire-rather-than-delete rule for equipment with history,
 * and the authorisation on every one of them. Everything it creates, it removes.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomBytes, scryptSync, randomUUID} from 'node:crypto';
import {eq, inArray, like} from 'drizzle-orm';
import {db, pool} from '../src/db/index.ts';
import {appUsers, assets, assetLocations, auditLogs, tickets} from '../src/db/schema.ts';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const STUDIO = 'Kwality House, Kemps Corner';
const TAG = 'EQCHK-' + Date.now();

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

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); } };
const section = (t) => console.log('\n' + t);

const admin = client(), agent = client(), viewer = client(), anon = client();
const userIds = [], createdTickets = [];
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const passwordHash = salt + ':' + scryptSync(password, salt, 64).toString('hex');

try {
  const used = await db.select({staffId: appUsers.staffId}).from(appUsers);
  const staffId = [31, 24, 19, 3, 16, 9].find((id) => !used.some((u) => u.staffId === id));
  assert.ok(staffId, 'A spare staff profile is needed');
  const stamp = Date.now();
  for (const [role, sid] of [['admin', null], ['agent', staffId], ['viewer', null]]) {
    const email = `iris-eq-${role}-${stamp}@example.invalid`;
    const [u] = await db.insert(appUsers).values({name: 'IRIS EQ ' + role, email, passwordHash, role, staffId: sid}).returning();
    userIds.push(u.id);
    const c = role === 'admin' ? admin : role === 'agent' ? agent : viewer;
    assert.equal((await c('/api/auth', 'POST', {action: 'login', email, password})).status, 200);
  }

  section('The register is not readable by anyone who asks');
  check('anonymous cannot read the register', (await anon('/api/assets?view=fleet')).status === 401, await anon('/api/assets?view=fleet'));
  check('anonymous cannot read locations', (await anon('/api/assets/locations')).status === 401, (await anon('/api/assets/locations')).status);
  check('a signed-in viewer can read it', (await viewer('/api/assets?view=fleet&studio=' + encodeURIComponent(STUDIO))).status === 200);

  section('Locations are administrator-owned');
  check('a viewer cannot create a location', (await viewer('/api/assets/locations', 'POST', {studio: STUDIO, name: TAG + ' room'})).status === 403);
  check('an agent cannot create a location', (await agent('/api/assets/locations', 'POST', {studio: STUDIO, name: TAG + ' room'})).status === 403);
  const madeLocation = await admin('/api/assets/locations', 'POST', {studio: STUDIO, name: TAG + ' room', description: 'check fixture'});
  check('an administrator can', madeLocation.status === 200, madeLocation.body);
  const locationId = madeLocation.body.location?.id;
  check('the same location twice is a conflict, not a duplicate', (await admin('/api/assets/locations', 'POST', {studio: STUDIO, name: TAG + ' room'})).status === 409);
  check('seeding the studio plan rooms is idempotent', (await admin('/api/assets/locations', 'POST', {action: 'seed'})).status === 200);

  section('Adding one item with its details');
  const viewerAdd = await viewer('/api/assets', 'POST', {studio: STUDIO, type: 'Laptop', label: TAG});
  check('a viewer cannot add equipment', viewerAdd.status === 403, viewerAdd);
  const made = await agent('/api/assets', 'POST', {
    studio: STUDIO, type: 'Laptop', label: TAG, locationId,
    serial: 'SN-' + TAG, assetTag: 'TAG-' + TAG, manufacturer: 'Apple', model: 'MacBook Air',
    vendor: 'Reseller Ltd', quantity: 1, condition: 'good', purchaseCost: '94999.50',
    acquiredAt: '2025-01-15', warrantyUntil: '2027-01-15', notes: 'front desk machine',
  });
  check('an agent can add equipment', made.status === 200, made.body);
  const laptopId = made.body.asset?.id;
  check('the serial number is stored', made.body.asset?.serial === 'SN-' + TAG, made.body.asset?.serial);
  check('the cost is stored as a number', made.body.asset?.purchaseCost === '94999.50', made.body.asset?.purchaseCost);
  check('the warranty date is stored', String(made.body.asset?.warrantyUntil || '').startsWith('2027-01-15'), made.body.asset?.warrantyUntil);
  check('it is filed under its catalogue category', made.body.asset?.category === 'IT & systems', made.body.asset?.category);
  check('it is named from its type and label', made.body.asset?.name === `Laptop ${TAG}`, made.body.asset?.name);
  check('it is placed in the location', made.body.asset?.locationId === locationId, made.body.asset?.locationId);
  check('the same item twice is a conflict', (await agent('/api/assets', 'POST', {studio: STUDIO, type: 'Laptop', label: TAG})).status === 409);
  check('a type outside the catalogue is refused', (await agent('/api/assets', 'POST', {studio: STUDIO, type: 'Hovercraft', label: TAG + 'x'})).status === 400);

  section('Editing it');
  const edited = await agent('/api/assets', 'PATCH', {id: laptopId, model: 'MacBook Pro', condition: 'fair', quantity: 2});
  check('an edit saves', edited.status === 200, edited.body);
  check('the model changed', edited.body.asset?.model === 'MacBook Pro', edited.body.asset?.model);
  check('the quantity changed', edited.body.asset?.quantity === 2, edited.body.asset?.quantity);
  check('an untouched field is not blanked', edited.body.asset?.serial === 'SN-' + TAG, edited.body.asset?.serial);
  check('the status is untouched by a detail edit', edited.body.asset?.status === 'in-service', edited.body.asset?.status);
  const statusOnly = await agent('/api/assets', 'PATCH', {id: laptopId, status: 'in-repair', note: 'screen flicker'});
  check('a status-only change still works', statusOnly.body.asset?.status === 'in-repair', statusOnly.body.asset?.status);
  check('the status note is kept', statusOnly.body.asset?.statusNote === 'screen flicker', statusOnly.body.asset?.statusNote);
  check('the detail survived the status change', statusOnly.body.asset?.model === 'MacBook Pro', statusOnly.body.asset?.model);

  section('Bulk upload');
  const bulk = await agent('/api/assets', 'POST', {
    mode: 'skip',
    rows: [
      {studio: STUDIO, type: 'Weight 5 kg', label: TAG + '-w1', quantity: 12, condition: 'good'},
      {studio: STUDIO, type: 'Microwave', label: TAG + '-m1', area: 'Pantry'},
      {studio: STUDIO, type: 'Biometric machine', label: TAG + '-b1', serial: 'BIO-1'},
      {studio: STUDIO, type: 'Speaker', label: TAG + '-s1'},
      // A label whose digits exceed an integer: this used to 500 the whole register listing.
      {studio: STUDIO, type: 'Printer', label: TAG + '-20240815001234567'},
      {studio: STUDIO, type: 'Laptop', label: TAG},
      {studio: STUDIO, type: 'Teleporter', label: TAG + '-bad'},
    ],
  });
  check('the sheet is accepted', bulk.status === 200, bulk.body);
  check('the good rows are created', bulk.body.created === 5, bulk.body);
  check('a row already in the register is skipped, not failed', bulk.body.skipped === 1, bulk.body);
  check('a row with an unknown type fails on its own', bulk.body.errors === 1, bulk.body);
  check('the failure names the problem', /not a type in the equipment catalogue/.test(bulk.body.results?.find((r) => r.status === 'error')?.message || ''), bulk.body.results?.find((r) => r.status === 'error'));
  check('the other rows still went in', bulk.body.results?.filter((r) => r.status === 'created').length === 5, bulk.body.results);
  const bulkUpdate = await agent('/api/assets', 'POST', {mode: 'update', rows: [{studio: STUDIO, type: 'Microwave', label: TAG + '-m1', manufacturer: 'Samsung'}]});
  check('update mode fills an existing row in', bulkUpdate.body.updated === 1, bulkUpdate.body);

  section('Counts come from the tickets');
  const fleet = await agent(`/api/assets?view=fleet&studio=${encodeURIComponent(STUDIO)}`);
  check('a long numeric label does not break the listing', fleet.status === 200 && Array.isArray(fleet.body.assets), fleet.body);
  check('the fleet view returns the catalogue for its pickers', Array.isArray(fleet.body.catalogue) && fleet.body.catalogue.length > 30, fleet.body.catalogue?.length);
  check('the fleet view returns the locations', Array.isArray(fleet.body.locations), typeof fleet.body.locations);
  check('every item carries a ticket count', fleet.body.assets?.every((a) => typeof a.faults === 'number' && typeof a.openFaults === 'number'), fleet.body.assets?.[0]);
  check('the location name is resolved for display', fleet.body.assets?.find((a) => a.id === laptopId)?.locationName === TAG + ' room', fleet.body.assets?.find((a) => a.id === laptopId)?.locationName);
  const weights = fleet.body.assets?.find((a) => a.label === TAG + '-w1');
  check('a countable item keeps its quantity', weights?.quantity === 12, weights?.quantity);

  // A real ticket against the laptop, so the count is measured rather than assumed.
  const ticketed = await agent('/api/tickets', 'POST', {
    description: 'Equipment register check: the front desk laptop will not boot after the update.',
    category: 'Tech Issues', subcategory: 'Laptops Not Functioning', kind: 'issue', studio: STUDIO,
    memberName: 'QA Member', memberEmail: 'qa-eq@example.invalid', incidentAt: 'Today',
    source: 'manual', submissionKey: randomUUID(),
  });
  if (ticketed.status === 201) {
    createdTickets.push(ticketed.body.ticket.id);
    await db.update(tickets).set({assetId: laptopId}).where(eq(tickets.id, ticketed.body.ticket.id));
    const after = await agent(`/api/assets?view=fleet&studio=${encodeURIComponent(STUDIO)}`);
    const row = after.body.assets?.find((a) => a.id === laptopId);
    check('the ticket is counted against the item', row?.faults >= 1, row);
    check('it is counted as open', row?.openFaults >= 1, row);
    const typeRow = after.body.summary?.find((s) => s.type === 'Laptop');
    check('the per-type summary counts it too', typeRow?.faults >= 1, typeRow);
    check('the per-type summary counts the units', typeRow?.units >= 2, typeRow);
  } else {
    check('a ticket could be logged for the count check', false, ticketed.body);
  }

  section('Removing equipment');
  const speaker = fleet.body.assets?.find((a) => a.label === TAG + '-s1');
  check('an agent cannot delete', (await agent(`/api/assets?id=${speaker?.id}`, 'DELETE')).status === 403);
  const deleted = await admin(`/api/assets?id=${speaker?.id}`, 'DELETE');
  check('an administrator can delete equipment with no history', deleted.body.deleted === true, deleted.body);
  const retired = await admin(`/api/assets?id=${laptopId}`, 'DELETE');
  check('equipment with a ticket is retired, not deleted', retired.body.retired === true && retired.body.deleted === false, retired.body);
  check('the response says why', /retired rather than deleted/.test(retired.body.message || ''), retired.body.message);
  const stillThere = await db.select().from(assets).where(eq(assets.id, laptopId));
  check('its fault history survives', stillThere.length === 1 && stillThere[0].status === 'retired', stillThere[0]?.status);

  section('Deleting a location does not delete what stands in it');
  const microwave = (await agent(`/api/assets?view=fleet&studio=${encodeURIComponent(STUDIO)}`)).body.assets?.find((a) => a.label === TAG + '-m1');
  await admin('/api/assets', 'PATCH', {id: microwave.id, locationId});
  const removedLocation = await admin(`/api/assets/locations?id=${locationId}`, 'DELETE');
  check('the location is removed', removedLocation.status === 200, removedLocation.body);
  const orphan = await db.select().from(assets).where(eq(assets.id, microwave.id));
  check('the equipment is still registered', orphan.length === 1, orphan.length);
  check('it simply has no location now', orphan[0]?.locationId === null, orphan[0]?.locationId);

  console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed`);
} finally {
  if (createdTickets.length) await db.delete(tickets).where(inArray(tickets.id, createdTickets));
  await db.delete(assets).where(like(assets.label, TAG + '%'));
  await db.delete(assetLocations).where(like(assetLocations.name, TAG + '%'));
  if (userIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
    await db.delete(appUsers).where(inArray(appUsers.id, userIds));
  }
  await pool.end();
}
if (fail) process.exit(1);

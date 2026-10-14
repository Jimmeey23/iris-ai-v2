import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { summarize, type MetricTicket } from '../../src/lib/metrics';

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('signup cannot mint a confirmed account or accept caller-controlled scope', () => {
  const route = source('src/app/api/auth/route.ts');
  const signup = route.slice(route.indexOf('if (b.action === "signup")'), route.indexOf('// `setup`'));
  assert.match(signup, /supabase\.auth\.signUp\(/);
  assert.doesNotMatch(signup, /email_confirm:\s*true|signInWithPassword|\.insert\(appUsers\)|b\.(studio|department|staffId|role|reportingManager)/);
  assert.match(signup, /directoryEntry\?\.isActive/);
  assert.match(signup, /if \(data.session\)/);
  assert.match(signup, /await logout\(\)/);
});

test('verified self-provisioning requires active directory scope, including OAuth', () => {
  const auth = source('src/lib/auth.ts');
  const profile = auth.slice(auth.indexOf('export async function resolveProfile'), auth.indexOf('export async function profileFor'));
  assert.match(profile, /if \(!confirmed\)/);
  assert.match(profile, /directoryEntry\?\.isActive/);
  for (const field of ['staffId: directoryEntry.id', 'studio: directoryEntry.location', 'department: directoryEntry.department']) assert.ok(profile.includes(field));
});

test('overview uses shared SLA denominator, including late resolutions and excluding record-only tickets', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const base: MetricTicket = { status: 'open', createdAt: '2026-10-13T00:00:00Z', slaDueAt: '2026-10-14T13:00:00Z', resolutionRequired: true };
  const tickets = [base, { ...base, status: 'resolved', resolvedAt: '2026-10-14T14:00:00Z' }, { ...base, status: 'recorded', resolutionRequired: false }, { ...base, slaDueAt: null }];
  assert.equal(summarize(tickets, now).slaCompliance, 50);
  assert.equal(summarize([], now).slaCompliance, null);
  const overview = source('src/components/overview-canvas.tsx');
  assert.match(overview, /summarize\(tickets, mountedAt\)/);
  assert.match(overview, /const compliance = slaMetrics\.slaCompliance/);
});

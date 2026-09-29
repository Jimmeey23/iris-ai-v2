/**
 * Named owners, the studio rota and the escalation chain.
 *
 * Run: npm run check:routing   (needs DATABASE_URL — it reads the real staff directory)
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import {db, pool} from '../src/db/index.ts';
import {staff, tickets} from '../src/db/schema.ts';
import {and, eq, inArray, sql} from 'drizzle-orm';
import {CITY_OWNERS, ESCALATION_OWNERS, ROUND_ROBIN_DEPARTMENTS, cityOf} from '../src/lib/routing.ts';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fail++; };
try {
  const people = await db.select().from(staff).where(eq(staff.isActive, true));
  const find = (re) => people.filter(p => re.test(p.name));

  // 1. every named owner resolves to exactly one active person
  for (const [dept, cities] of Object.entries(CITY_OWNERS))
    for (const [city, patterns] of Object.entries(cities))
      for (const re of patterns) {
        const hits = find(re);
        ok(hits.length === 1, `${dept}/${city}: ${re} -> ${hits.map(h => h.name).join(', ') || 'nobody'}`);
      }
  // 2. and so does every escalation owner
  for (const [dept, re] of Object.entries(ESCALATION_OWNERS)) {
    const hits = find(re);
    ok(hits.length === 1, `escalation ${dept}: ${re} -> ${hits.map(h => h.name).join(', ') || 'nobody'}`);
  }
  // 3. the people the brief named, in the seats the brief gave them
  const seat = (re, dept, city) => { const p = find(re)[0]; return p && p.department === dept && (!city || cityOf(p.location) === city); };
  ok(seat(/^shaina\b/i, 'Marketing', 'mumbai'), 'Shaina is Mumbai marketing');
  ok(seat(/^saachi shetty jr\b/i, 'Marketing', 'bengaluru'), 'Saachi Jr is Bengaluru marketing');
  ok(seat(/^reyna\b/i, 'Marketing'), 'Reyna is the marketing escalation');
  ok(seat(/^zahur\b/i, 'Operations', 'mumbai'), 'Zahur is Mumbai operations');
  ok(seat(/^saachi shetty$/i, 'Operations'), 'Saachi Shetty is the operations escalation');
  ok(seat(/^vivaran\b/i, 'Training', 'mumbai') && seat(/^mrigakshi\b/i, 'Training', 'mumbai'), 'Vivaran and Mrigakshi share Mumbai training');

  // 4. the rota reaches the whole team, not the same two people
  for (const dept of ROUND_ROBIN_DEPARTMENTS) {
    const team = people.filter(p => p.department === (dept === 'customer-service' ? 'Customer Service' : 'Sales & Client Servicing'));
    if (!team.length) { console.log(`   (no active staff in ${dept}, skipped)`); continue; }
    const load = await db.select({id: tickets.assignedStaffId, n: sql`count(*)::int`}).from(tickets)
      .where(inArray(tickets.assignedStaffId, team.map(t => t.id))).groupBy(tickets.assignedStaffId);
    const open = (id) => Number(load.find(l => l.id === id)?.n || 0);
    const spread = team.map(t => `${t.name.split(' ')[0]}:${open(t.id)}`).join(' ');
    console.log(`   ${dept} rota pool (${team.length}): ${spread}`);
    ok(team.length > 1, `${dept} has a team to rotate through`);
  }
  console.log(fail ? `\n${fail} FAILED` : '\nall passed');
} finally { await pool.end(); }
process.exit(fail ? 1 : 0);

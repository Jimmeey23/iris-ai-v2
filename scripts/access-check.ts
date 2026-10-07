/**
 * Who may open which ticket. `canAccessTicket` judges one row and `ticketScope`
 * turns the same rule into SQL; they must never disagree, so both are exercised
 * against the same fixtures here.
 */
process.env.DATABASE_URL ||= 'postgres://check:check@127.0.0.1:5432/check';

import {canAccessTicket, coveredStudios, type Identity} from '../src/lib/auth';
import {ticketScope} from '../src/lib/tickets';
import {existsSync, readFileSync} from 'fs';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); }
};
const section = (t: string) => console.log('\n' + t);

const KWALITY = 'Kwality House, Kemps Corner';
const SUPREME = 'Supreme HQ, Bandra';
const COURTSIDE = 'Courtside, Mumbai';
const KENKERE = 'Kenkere House, Bengaluru';

const user = (over: Partial<Identity> = {}): Identity => ({
  id: 1, name: 'An Associate', email: 'a@example.com', role: 'agent',
  staffId: 10, department: null, studio: null, studios: [],
  avatarUrl: null, mustChangePassword: false, ...over,
});
const ticket = (over: Record<string, unknown> = {}) => ({
  assignedStaffId: 99, createdByUserId: 999, departmentName: 'Operations', studio: KWALITY, ...over,
});

section('Covered studios');
check('an explicit list is used as given',
  coveredStudios(user({studios: [KWALITY, SUPREME]})).length === 2);
check('a legacy single studio still counts',
  coveredStudios(user({studio: KENKERE})).join() === KENKERE);
check('the list wins over the legacy field',
  coveredStudios(user({studio: KENKERE, studios: [KWALITY]})).join() === KWALITY);
check('no studio at all reads empty', coveredStudios(user()).length === 0);
check('blank entries are ignored',
  coveredStudios(user({studios: ['', '  ', KWALITY]})).join() === KWALITY);

section('An associate sees their whole studio');
const associate = user({studios: [SUPREME]});
check('a ticket at their studio, assigned to someone else',
  canAccessTicket(associate, ticket({studio: SUPREME})));
check('a ticket at their studio, unassigned',
  canAccessTicket(associate, ticket({studio: SUPREME, assignedStaffId: null})));
check('an old ticket at their studio, already closed — no date limit exists',
  canAccessTicket(associate, ticket({studio: SUPREME, assignedStaffId: null, createdByUserId: null})));
check('a ticket at another studio is refused',
  !canAccessTicket(associate, ticket({studio: KWALITY})));
check('their own ticket at another studio is still theirs',
  canAccessTicket(associate, ticket({studio: KWALITY, assignedStaffId: 10})));
check('a ticket they raised at another studio is still theirs',
  canAccessTicket(associate, ticket({studio: KWALITY, createdByUserId: 1})));

section('Multi-studio cover');
const trainer = user({studios: [KWALITY, SUPREME, COURTSIDE]});
check('every covered studio is visible',
  [KWALITY, SUPREME, COURTSIDE].every(s => canAccessTicket(trainer, ticket({studio: s}))));
check('a studio outside the list is refused',
  !canAccessTicket(trainer, ticket({studio: KENKERE})));

section('Edges');
check('an associate with no studio sees only their own work',
  !canAccessTicket(user(), ticket({studio: SUPREME})) &&
  canAccessTicket(user(), ticket({assignedStaffId: 10})));
check('a ticket with no studio is not matched by studio cover',
  !canAccessTicket(associate, ticket({studio: null, assignedStaffId: null, createdByUserId: null})));
check('an admin sees everything',
  canAccessTicket(user({role: 'admin', staffId: null}), ticket({studio: KENKERE})));
check('a manager needs department and studio to agree',
  canAccessTicket(user({role: 'manager', department: 'Operations', studios: [SUPREME]}), ticket({studio: SUPREME})) &&
  !canAccessTicket(user({role: 'manager', department: 'Operations', studios: [SUPREME]}), ticket({studio: KWALITY})));
check('a manager with neither department nor studio sees nothing',
  !canAccessTicket(user({role: 'manager'}), ticket({})));

section('Owner and direct-report access across scopes');
const reportingManager = user({role: 'manager', staffId: 10, managedStaffIds: [99]});
check('a reporting manager can open direct-report tickets outside their scope', canAccessTicket(reportingManager, ticket()));
check('an assigned manager can open their own ticket without studio cover', canAccessTicket(user({role: 'manager'}), ticket({assignedStaffId: 10})));
check('an unrelated manager has no extra access', !canAccessTicket(reportingManager, ticket({assignedStaffId: 88})));

section('The SQL twin agrees');
check('an admin gets no filter', ticketScope(user({role: 'admin'})) === undefined);
check('an anonymous caller gets no filter', ticketScope(undefined) === undefined);
/** The literal values bound into a scope's SQL. Drizzle's SQL objects reference their
 *  table and are circular, so walk the query chunks rather than serialising them. */
function boundValues(node: unknown, seen = new Set<unknown>(), depth = 0): string[] {
  if (depth > 16 || node === null || node === undefined) return [];
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return [String(node)];
  if (typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);
  const o = node as Record<string, unknown>;
  if (Array.isArray(node)) return node.flatMap(v => boundValues(v, seen, depth + 1));
  // Only descend through the chunk/param structure, never into table columns.
  return ['queryChunks', 'value'].flatMap(k => (k in o ? boundValues(o[k], seen, depth + 1) : []));
}
const sqlFor = (u: Identity) => {
  const scope = ticketScope(u);
  return scope ? boundValues(scope).join(' | ') : 'null';
};
check('an associate with studios produces a filter', sqlFor(associate) !== 'null');
check('an associate with no studio still filters to their own rows', sqlFor(user()) !== 'null');
check('a multi-studio associate filters on every studio',
  [KWALITY, SUPREME, COURTSIDE].every(s => sqlFor(trainer).includes(s)), sqlFor(trainer));
check('a manager with nothing set produces a filter that excludes everything',
  sqlFor(user({role: 'manager'})).includes('false'), sqlFor(user({role: 'manager'})));

check('a reporting manager list binds the direct-report staff id', sqlFor(reportingManager).includes('99'));
check('a manager list includes their own assigned staff id', sqlFor(user({role: 'manager'})).includes('10'));

section('Route protection is actually wired up');
// Next resolves the proxy only when it sits beside `app`. This project keeps its app
// at src/app, so the file must be src/proxy.ts. At the repo root it is silently
// ignored and every page answers 200 to a signed-out request.
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
{
  const root = new URL('../', import.meta.url);
  const at = (p: string) => existsSync(new URL(p, root));
  check('the app lives at src/app', at('src/app'));
  check('proxy.ts sits beside app, at src/proxy.ts', at('src/proxy.ts'));
  check('no stray proxy.ts at the repo root, which Next would ignore', !at('proxy.ts'));
  check('no stray middleware.ts either', !at('middleware.ts') && !at('src/middleware.ts'));
  const proxy = readFileSync(new URL('src/proxy.ts', root), 'utf8');
  check('signed-out page requests are redirected to /login',
    /redirect\(new URL\("\/login"/.test(proxy));
  check('API routes are left to answer 401 themselves, not redirected',
    /path\.startsWith\("\/api\/"\)/.test(proxy));
  check('the login page is public, or the redirect would loop',
    /"\/login"/.test(proxy));
  check('the OAuth handshake is exempt from session refresh',
    /\/auth\/callback/.test(proxy));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

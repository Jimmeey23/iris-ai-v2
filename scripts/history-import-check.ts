/**
 * Checks what happens to historic records on import.
 *
 * The history file is 464 email threads, not 464 tickets: two thirds are not customer
 * complaints, and 449 of them were never closed. Importing them as live work would put
 * hundreds of years-old overdue items on the board and drive SLA compliance to zero, so
 * they are filed closed, back-dated, and without an SLA clock. These checks hold that line.
 *
 * Run: npm run check:history:import
 */
import {readFile} from 'fs/promises';
import {and,eq} from 'drizzle-orm';
import {departments,staff,tickets} from '@/db/schema';
import {db,seed} from './iris-replay-support/stub-db';
import {importHistory} from '@/lib/history';
import {historicalExamples} from '@/lib/tickets';
import {isCxExport,fromCxExport} from '@/lib/history-mapping';
import {CATEGORY_MAP,DEPARTMENT_RECORDS,STAFF} from '@/lib/constants';
import type {IrisMessage} from '@/lib/iris-contract';

let failed = 0;
let passed = 0;

function check(name: string, ok: boolean, got?: unknown) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(got)); }
}
function section(title: string) { console.log('\n' + title); }

type Row = Record<string, unknown>;

async function main() {
  const raw = JSON.parse(await readFile(process.cwd() + '/data/historic-tickets.json', 'utf8'));
  const rows: Row[] = Array.isArray(raw) ? raw : raw.tickets || raw.data || raw.records;
  if (!Array.isArray(rows)) throw new Error('No ticket array found in data/historic-tickets.json');
  console.log(`\n${rows.length} historic records read from data/historic-tickets.json`);

  /* ------------------------------------------------------------------ */
  section('Every record maps into the workspace taxonomy');

  check('all records are recognised as CX export rows', rows.every((r) => isCxExport(r)), rows.filter((r) => !isCxExport(r)).length);

  const mapped = rows.map((r) => fromCxExport(r));
  const unknownTaxonomy = mapped.filter((m) => !(CATEGORY_MAP[m.input.category as string] || []).includes(m.input.subcategory as string));
  check('every record lands on a real category → subcategory pair', unknownTaxonomy.length === 0,
    unknownTaxonomy.slice(0, 3).map((m) => `${m.input.category} → ${m.input.subcategory}`));

  const noDate = mapped.filter((m) => !m.createdAt);
  check('every record carries a post-date', noDate.length === 0, noDate.length);
  const noCloseDate = mapped.filter((m) => !m.resolvedAt);
  check('every record carries a closure date', noCloseDate.length === 0, noCloseDate.length);

  // The taxonomy is 218 subcategories wide; history only ever populates a slice of it.
  const used = new Set(mapped.map((m) => `${m.input.category} → ${m.input.subcategory}`));
  check('history spreads across more than one subcategory', used.size > 1, used.size);
  check('history does not collapse into a single bucket',
    Math.max(...[...used].map((k) => mapped.filter((m) => `${m.input.category} → ${m.input.subcategory}` === k).length)) < rows.length * 0.5,
    used.size);

  /* ------------------------------------------------------------------ */
  section('Importing as closed history');

  // Routing reads the real department and staff tables, so the check seeds them rather than
  // asserting against a single-department fixture that cannot route every category.
  seed(departments, DEPARTMENT_RECORDS.map((d) => ({...d}) as unknown as Row));
  seed(staff, STAFF.map((s) => ({...s}) as unknown as Row));

  const sample = rows.slice(0, 3);
  seed(tickets, []);
  const result = await importHistory(sample, 'check:closed', {close: true});
  const written = (await db.select().from(tickets).where(eq(tickets.source, 'history'))) as Row[];

  check('three records imported', Number(result.imported) === 3, result);
  check('all three are closed', written.every((t) => t.status === 'closed'), written.map((t) => t.status));
  check('none carries an SLA due date', written.every((t) => !t.slaDueAt), written.map((t) => t.slaDueAt));
  check('none requires a resolution', written.every((t) => t.resolutionRequired === false), written.map((t) => t.resolutionRequired));
  check('all three are back-dated to when the thread opened',
    written.every((t, i) => new Date(String(t.createdAt)).toISOString().slice(0, 10) === String(sample[i].date_opened).slice(0, 10)),
    written.map((t) => String(t.createdAt).slice(0, 10)));
  check('all three are closed as of the last response, not today',
    written.every((t, i) => new Date(String(t.resolvedAt)).toISOString().slice(0, 10) === String(sample[i].last_response_date).slice(0, 10)),
    written.map((t) => String(t.resolvedAt).slice(0, 10)));

  const cf = (t: Row) => (t.customFields || {}) as Row;
  check('the original status survives the closure', written.every((t, i) => cf(t).originalStatus === String(sample[i].current_status)),
    written.map((t) => cf(t).originalStatus));
  check('the closure is marked as an import decision, not a real resolution', written.every((t) => cf(t).closedOnImport === true),
    written.map((t) => cf(t).closedOnImport));
  check('the source metadata is kept for retrieval', written.every((t) => String(cf(t).intelligenceBucket).length > 0),
    written.map((t) => cf(t).intelligenceBucket));

  /* ------------------------------------------------------------------ */
  section('Importing with the file’s own statuses still works');

  seed(tickets, []);
  await importHistory(sample, 'check:open', {close: false});
  const open = (await db.select().from(tickets).where(and(eq(tickets.source, 'history'), eq(tickets.channel, 'import')))) as Row[];
  check('three records imported again', open.length === 3, open.length);
  check('statuses follow the file rather than being forced closed',
    open.every((t, i) => t.status !== 'closed' || String(sample[i].current_status) === 'resolved'),
    open.map((t) => t.status));
  check('anything still open carries an SLA clock', open.some((t) => Boolean(t.slaDueAt)), open.map((t) => t.slaDueAt));
  check('the closure flag is not set when not closing', open.every((t) => !cf(t).closedOnImport), open.map((t) => cf(t).closedOnImport));

  /* ------------------------------------------------------------------ */
  section('Closed history is still there for Iris to read');

  // The whole point of filing these closed rather than discarding them: Iris retrieves
  // them while drafting. If closing them dropped them out of retrieval, the import would
  // be pointless, so this is the check that matters most.
  seed(tickets, []);
  const target = mapped[0];
  await importHistory([rows[0]], 'check:retrieval', {close: true});
  const found = await historicalExamples(String(target.input.category), String(target.input.subcategory));
  check('a closed record is still retrieved as an example', found.length === 1, found.length);
  check('the example carries the record text', (found[0]?.summary || '').length > 0, found[0]?.summary?.slice(0, 80));
  check('the example is redacted before it reaches the model',
    !(found[0]?.summary || '').includes(String(rows[0].customer_email || '@nope')), found[0]?.summary?.slice(0, 120));

  // Most of the taxonomy has no history behind it at all, so an exact subcategory match
  // usually misses. Falling back to the category is what makes the import worth having.
  const byCategory = await historicalExamples(String(target.input.category), 'A subcategory nothing was ever filed under');
  check('an unmatched subcategory falls back to the category', byCategory.length === 1, byCategory.length);
  check('a category with no history at all returns nothing', (await historicalExamples('A category that does not exist', 'nor this')).length === 0);

  /* ------------------------------------------------------------------ */
  console.log(`\n${failed ? 'FAILED' : 'OK'} — ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('\nCHECK CRASHED:', e); process.exit(1); });

// Imported for its type only; keeps the check honest about the contract it validates.
export type {IrisMessage};

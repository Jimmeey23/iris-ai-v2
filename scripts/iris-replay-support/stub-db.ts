/**
 * An in-memory stand-in for Postgres, so the Iris flow can be replayed in a test without a
 * database. Only the reads the flow performs are populated; everything else returns nothing,
 * which is the same as an empty table for the flow's purposes.
 *
 * `where()` is evaluated rather than ignored. Ignoring it works right up until a test wants
 * to prove that a duplicate is found only at the same studio, or that a resolved ticket is
 * not offered — at which point the test proves nothing at all.
 */
import {departments, staff, assets, tickets} from '@/db/schema';

type Row = Record<string, unknown>;

const ROWS = new Map<unknown, Row[]>([
  [departments, [{id: 'operations', name: 'Operations', active: true}]],
  [staff, [{
    id: 1, name: 'Saachi Shetty', email: 'saachi@example.com', role: 'Ops Executive',
    department: 'Operations', isActive: true, categories: [], studioId: null, manager: null,
  }]],
  [assets, []],
  [tickets, []],
]);

/* ------------------------------------------------------------------ */
/* Reading the where clause                                            */
/* ------------------------------------------------------------------ */

const isColumn = (x: unknown): boolean => Boolean(x && typeof x === 'object' && (x as Row).name && (x as Row).table);
/** Unwraps a Drizzle bound value. Literal SQL fragments arrive as single-element arrays. */
const valueOf = (x: unknown): unknown => {
  let v = x && typeof x === 'object' && 'value' in (x as Row) ? (x as Row).value : x;
  while (Array.isArray(v) && v.length === 1) v = v[0];
  return v;
};
const CONNECTORS = new Set(['and', 'or']);
/** Bound values are `Param`s; everything else in a chunk list is literal SQL text. */
const isSqlText = (x: unknown): boolean =>
  typeof x === 'string' || Boolean(x && typeof x === 'object' && !isColumn(x) && !('encoder' in (x as object)));

/** Drizzle nests conditions inside `queryChunks`; flatten to columns, operators, values. */
function flatten(cond: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === 'object' && (x as Row).queryChunks) return walk((x as Row).queryChunks);
    out.push(x);
  };
  walk(cond);
  return out;
}

type Predicate = {col: any; op: string; vals: unknown[]};

export function predicates(cond: unknown): Predicate[] {
  const flat = flatten(cond);
  const out: Predicate[] = [];
  let i = 0;
  while (i < flat.length) {
    if (!isColumn(flat[i])) { i++; continue; }
    const col = flat[i] as Row;
    let j = i + 1;
    const ops: string[] = [];
    const vals: unknown[] = [];
    while (j < flat.length) {
      if (isColumn(flat[j])) break;
      // Operators, parentheses and connectors are literal SQL; a value is a bound param.
      // Reading them apart by type rather than by shape is what keeps `eq(studio, 'and')`
      // from being parsed as a conjunction.
      if (isSqlText(flat[j])) {
        const t = String(valueOf(flat[j]) ?? '').trim();
        if (CONNECTORS.has(t) || t === '(' || t === ')') { if (ops.length && vals.length) break; }
        else if (t) ops.push(t);
        j++;
        continue;
      }
      vals.push(valueOf(flat[j]));
      j++;
    }
    if (ops.length) out.push({col, op: ops.join(' ').trim(), vals});
    i = j;
  }
  return out;
}

const cell = (row: Row, col: Row): unknown => {
  const n = String(col.name);
  return n in row ? row[n] : row[n.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())];
};

const isEmpty = (v: unknown): boolean => v === null || v === undefined;
const same = (a: unknown, b: unknown): boolean => (isEmpty(a) && isEmpty(b) ? true : String(a) === String(b));

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return Date.parse(v);
  return Number(v);
}

function like(actual: unknown, pattern: unknown): boolean {
  if (isEmpty(actual)) return false;
  const re = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
  return re.test(String(actual));
}

export function matches(row: Row, cond: unknown): boolean {
  if (!cond) return true;
  for (const p of predicates(cond)) {
    const actual = cell(row, p.col);
    const op = p.op;
    const v = p.vals[0];
    let ok = true;
    if (op === '=' || op === 'is') ok = p.vals.length ? same(actual, v) : isEmpty(actual);
    else if (op === '<>' || op === '!=' || op === 'is not') ok = p.vals.length ? !same(actual, v) : !isEmpty(actual);
    else if (op === '>=') ok = toNum(actual) >= toNum(v);
    else if (op === '<=') ok = toNum(actual) <= toNum(v);
    else if (op === '>') ok = toNum(actual) > toNum(v);
    else if (op === '<') ok = toNum(actual) < toNum(v);
    else if (op === 'in') ok = p.vals.some((x) => same(actual, x));
    else if (op === 'not in') ok = !p.vals.some((x) => same(actual, x));
    else if (op === 'like') ok = like(actual, v);
    if (!ok) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* The query builder                                                   */
/* ------------------------------------------------------------------ */

let nextId = 1000;

function query(initial: any[] = []): any {
  let rows = initial;
  let table: unknown = undefined;
  let limit: number | undefined;
  const self: any = {
    from(t: unknown) { table = t; rows = [...(ROWS.get(t) ?? [])]; return self; },
    where(cond: unknown) { rows = rows.filter((r) => matches(r, cond)); return self; },
    orderBy() { return self; },
    groupBy() { return self; },
    limit(n: number) { limit = n; return self; },
    returning() { return insertReturning(table, pendingValues ?? [], conflict === 'nothing'); },
    onConflictDoNothing() { conflict = 'nothing'; return self; },
    values(v: unknown) { pendingValues = Array.isArray(v) ? v : [v]; return self; },
    set(v: any) { pendingSet = v; return self; },
    then(res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const out = limit === undefined ? rows : rows.slice(0, limit);
      return Promise.resolve(out).then(res, rej);
    },
    catch(rej?: (e: unknown) => unknown) { return Promise.resolve(rows).catch(rej); },
    finally(f?: () => void) { return Promise.resolve(rows).finally(f); },
  };
  let pendingValues: any[] | undefined;
  let pendingSet: any;
  let conflict: string | undefined;
  const applyUpdate = () => {
    if (!table || !pendingSet) return;
    const list = ROWS.get(table) ?? [];
    ROWS.set(table, list.map((r) => (rows.includes(r) || rows.some((x) => x === r) ? {...r, ...pendingSet} : r)));
  };
  // `update().set().where()` never awaits a `then` in Drizzle, so the write is applied as
  // soon as the statement is built rather than when it is awaited.
  queueMicrotask(() => applyUpdate());
  return self;
}

/** A row that already exists under the assets unique index is left alone. */
function insertReturning(table: unknown, values: any[], doNothing: boolean) {
  const list = ROWS.get(table) ?? [];
  const out: Row[] = [];
  for (const v of values) {
    const clash = list.some(
      (r) =>
        (!isEmpty(v.id) && same(r.id, v.id)) ||
        (!isEmpty(v.studio) && !isEmpty(v.type) && !isEmpty(v.label) &&
          same(r.studio, v.studio) && same(r.type, v.type) && same(r.label, v.label)),
    );
    if (clash && doNothing) continue;
    const row = {id: v.id ?? ++nextId, createdAt: new Date(), updatedAt: new Date(), ...v};
    list.push(row);
    out.push(row);
  }
  ROWS.set(table, list);
  return Promise.resolve(out);
}

export const db: any = {
  select: () => query(),
  insert: (t: unknown) => query().from(t),
  update: (t: unknown) => query().from(t),
  transaction: (fn: (d: unknown) => unknown) => fn(db),
  execute: () => Promise.resolve([]),
};
export const pool: any = {};

/** Test helpers: put rows in, and read them back out again. */
export function seed(table: unknown, rows: Row[]) {
  ROWS.set(table, rows.map((r) => ({...r})));
}
export function rowsOf(table: unknown): Row[] {
  return ROWS.get(table) ?? [];
}

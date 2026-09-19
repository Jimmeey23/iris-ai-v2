/**
 * An in-memory stand-in for Postgres, so the Iris flow can be replayed in a test without a
 * database. Only the reads `makeDraft()` performs are populated; everything else returns
 * nothing, which is the same as an empty table for the flow's purposes.
 */
import {departments, staff} from '@/db/schema';

const ROWS = new Map<unknown, Record<string, unknown>[]>([
  [departments, [{id: 'operations', name: 'Operations', active: true}]],
  [staff, [{
    id: 1, name: 'Saachi Shetty', email: 'saachi@example.com', role: 'Ops Executive',
    department: 'Operations', isActive: true, categories: [], studioId: null, manager: null,
  }]],
]);

function query(initial: Record<string, unknown>[] = []): any {
  let rows = initial;
  const self: any = {
    from(table: unknown) { rows = ROWS.get(table) ?? []; return self; },
    where() { return self; },
    orderBy() { return self; },
    limit() { return self; },
    then(res?: any, rej?: any) { return Promise.resolve(rows).then(res, rej); },
    catch(rej?: any) { return Promise.resolve(rows).catch(rej); },
    finally(f?: any) { return Promise.resolve(rows).finally(f); },
  };
  return self;
}

export const db: any = {select: () => query(), transaction: (fn: any) => fn(db), execute: () => Promise.resolve([])};
export const pool: any = {};

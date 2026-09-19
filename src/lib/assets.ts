import {and,asc,desc,eq,inArray,sql} from 'drizzle-orm';
import {db} from '@/db';
import {assetLocations,assets,tickets} from '@/db/schema';
import {EQUIPMENT_BY_TYPE,EQUIPMENT_CATALOGUE,EQUIPMENT_TYPES,STUDIO_LAYOUTS} from './constants';

/**
 * The equipment register.
 *
 * Before this existed, "bike 6" was a free-text string typed fresh on every ticket, so the
 * app could not answer how many times a bike had failed, whether it was currently rideable,
 * or which bike in the fleet was the problem. Every one of those questions is the same
 * question: which asset is this, and what do we already know about it.
 */
export type AssetStatus = 'in-service' | 'out-of-rotation' | 'in-repair' | 'retired';

export const ASSET_STATUSES: AssetStatus[] = ['in-service', 'out-of-rotation', 'in-repair', 'retired'];

/** Every type the register accepts, from the shared catalogue. It started as bikes alone;
 *  a studio's failures are not confined to its bikes. */
export const ASSET_TYPES: string[] = EQUIPMENT_TYPES;
export type AssetType = string;

export function isAssetType(value: string): boolean {
  return EQUIPMENT_BY_TYPE.has(value);
}

export function categoryOf(type: string): string | null {
  return EQUIPMENT_BY_TYPE.get(type)?.category ?? null;
}

export type AssetRow = typeof assets.$inferSelect;

/** How the floor says it. "cycle no 6", "bike 12", "bike #3" all mean one bike. */
const BIKE_REF =
  /\b(?:bike|cycle|powercycle)\b(?:\s*(?:no\.?|number|num|#))?\s*(\d{1,2})\b(?!\s*(?:min|mins|minute|minutes|pax|people|members|riders))/i;
const HASH_REF = /#\s*(\d{1,2})\b/;

const escape = (v: string) => v.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Alias patterns for the rest of the catalogue, longest alias first so "portable mic"
 *  is not swallowed by "mic". Each needs an explicit number or a bare mention; a number is
 *  optional because a studio has one washing machine and nobody calls it washing machine 1. */
const TYPE_REFS: {type: string; re: RegExp; numbered: RegExp}[] = EQUIPMENT_CATALOGUE
  .filter((e) => e.type !== 'PowerCycle bike')
  .flatMap((e) => (e.aliases || [e.type]).map((a) => ({type: e.type, alias: a})))
  .sort((a, b) => b.alias.length - a.alias.length)
  .map(({type, alias}) => ({
    type,
    re: new RegExp(`\\b${escape(alias)}\\b`, 'i'),
    numbered: new RegExp(`\\b${escape(alias)}\\b(?:\\s*(?:no\\.?|number|num|#))?\\s*(\\d{1,3})\\b`, 'i'),
  }));

/** Reads an equipment reference out of a message. Returns the type and the normalised
 *  label, which together identify the asset within a studio.
 *
 *  Bikes are matched first and kept exactly as they were: the Iris intake flow depends on
 *  that behaviour, and widening it is not worth a regression on the one path that is in
 *  daily use. Everything else only matches on its own alias, so "45 minute class" cannot
 *  become a piece of equipment. */
export function parseAssetReference(text: string): {type: AssetType; label: string} | undefined {
  if (!text) return undefined;
  const bike = text.match(BIKE_REF);
  if (bike) return {type: 'PowerCycle bike', label: String(Number(bike[1]))};
  for (const ref of TYPE_REFS) {
    const numbered = text.match(ref.numbered);
    if (numbered) return {type: ref.type, label: String(Number(numbered[1]))};
  }
  for (const ref of TYPE_REFS) {
    if (ref.re.test(text)) return {type: ref.type, label: '1'};
  }
  const hash = text.match(HASH_REF);
  if (hash) return {type: 'PowerCycle bike', label: String(Number(hash[1]))};
  return undefined;
}

export function assetName(type: AssetType, label: string): string {
  if (type === 'PowerCycle bike') return `Bike #${label}`;
  // A numeric label is an item number; anything else is already a name ("Front desk").
  return /^\d+$/.test(label) ? `${type} #${label}` : `${type} ${label}`;
}

/** Finds the asset, creating it the first time the floor names one.
 *
 *  It is created rather than rejected because the register will never be complete: a bike
 *  is first mentioned at the moment it breaks, and refusing to record it then is how the
 *  register stays empty. */
export async function resolveAsset(input: {
  studio: string;
  type: AssetType;
  label: string;
  area?: string | null;
}): Promise<AssetRow | undefined> {
  const studio = input.studio?.trim();
  const label = String(input.label || '').trim();
  if (!studio || !label) return undefined;
  const [existing] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.studio, studio), eq(assets.type, input.type), eq(assets.label, label)))
    .limit(1);
  if (existing) {
    if (!existing.area && input.area) {
      const [updated] = await db
        .update(assets)
        .set({area: input.area, updatedAt: new Date()})
        .where(eq(assets.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }
  try {
    const [created] = await db
      .insert(assets)
      .values({
        studio,
        area: input.area ?? null,
        type: input.type,
        label,
        name: assetName(input.type, label),
        status: 'in-service',
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  } catch {
    // A concurrent insert won the race; read it back rather than failing the turn.
  }
  const [raced] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.studio, studio), eq(assets.type, input.type), eq(assets.label, label)))
    .limit(1);
  return raced;
}

export async function getAsset(id: number): Promise<AssetRow | undefined> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return row;
}

export async function listAssets(filter: {studio?: string; type?: AssetType; status?: AssetStatus; category?: string; locationId?: number} = {}): Promise<AssetRow[]> {
  const clauses = [];
  if (filter.studio) clauses.push(eq(assets.studio, filter.studio));
  if (filter.type) clauses.push(eq(assets.type, filter.type));
  if (filter.status) clauses.push(eq(assets.status, filter.status));
  if (filter.category) clauses.push(eq(assets.category, filter.category));
  if (filter.locationId) clauses.push(eq(assets.locationId, filter.locationId));
  return db
    .select()
    .from(assets)
    .where(clauses.length ? and(...clauses) : undefined)
    // Numeric labels sort as numbers so bike 2 precedes bike 10. The cast is to `numeric`,
    // not `int`: a label like "Laptop 20240815001" strips to more digits than an integer
    // holds, and the overflow took down the whole register listing with a 500 rather than
    // mis-sorting one row.
    .orderBy(asc(assets.type), sql`nullif(regexp_replace(${assets.label}, '\\D', '', 'g'), '')::numeric`, asc(assets.label));
}

export async function setAssetStatus(id: number, status: AssetStatus, note?: string): Promise<void> {
  await db
    .update(assets)
    .set({status, statusNote: note ?? null, statusChangedAt: new Date(), updatedAt: new Date()})
    .where(eq(assets.id, id));
}

/** What the system already knows about one asset, for the moment a fault is reported. */
export async function assetBrief(id: number): Promise<{
  asset: AssetRow;
  faults: number;
  faultsLast30: number;
  faultsLast90: number;
  openFaults: number;
  lastFaultAt: string | null;
  lastTicketNumber: string | null;
} | undefined> {
  const asset = await getAsset(id);
  if (!asset) return undefined;
  const rows = await db
    .select({id: tickets.id, ticketNumber: tickets.ticketNumber, status: tickets.status, createdAt: tickets.createdAt})
    .from(tickets)
    .where(eq(tickets.assetId, id))
    .orderBy(desc(tickets.createdAt));
  const now = Date.now();
  const day = 86400000;
  const open = rows.filter((r) => !['resolved', 'closed'].includes(String(r.status)));
  return {
    asset,
    faults: rows.length,
    faultsLast30: rows.filter((r) => now - new Date(r.createdAt).getTime() < 30 * day).length,
    faultsLast90: rows.filter((r) => now - new Date(r.createdAt).getTime() < 90 * day).length,
    openFaults: open.length,
    lastFaultAt: rows[0]?.createdAt ? new Date(rows[0].createdAt).toISOString() : null,
    lastTicketNumber: rows[0]?.ticketNumber ?? null,
  };
}

/** Records the fault against the asset and moves it out of service when the reporter says
 *  they took it out of rotation — the one answer that must change the floor, not the ticket. */
export async function registerAssetFault(input: {
  assetId: number;
  takenOutOfRotation: boolean;
  note?: string;
}): Promise<void> {
  const asset = await getAsset(input.assetId);
  if (!asset) return;
  const current = (ASSET_STATUSES as string[]).includes(String(asset.status))
    ? (asset.status as AssetStatus)
    : 'in-service';
  const nextStatus: AssetStatus = input.takenOutOfRotation && current === 'in-service' ? 'out-of-rotation' : current;
  await db
    .update(assets)
    .set({
      faultCount: sql`${assets.faultCount} + 1`,
      lastFaultAt: new Date(),
      updatedAt: new Date(),
      ...(nextStatus !== asset.status
        ? {status: nextStatus, statusChangedAt: new Date(), statusNote: input.note ?? null}
        : {}),
    })
    .where(eq(assets.id, input.assetId));
}

/** Every asset at a site with its fault counts — the fleet view, in one query. */
export async function fleetHealth(studio?: string, filter: {type?: string; status?: AssetStatus; category?: string; locationId?: number} = {}) {
  const rows = await listAssets({...(studio ? {studio} : {}), ...filter});
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({assetId: tickets.assetId, total: sql<number>`count(*)::int`})
    .from(tickets)
    .where(inArray(tickets.assetId, ids))
    .groupBy(tickets.assetId);
  const openCounts = await db
    .select({assetId: tickets.assetId, open: sql<number>`count(*)::int`})
    .from(tickets)
    .where(and(inArray(tickets.assetId, ids), sql`${tickets.status} not in ('resolved','closed')`))
    .groupBy(tickets.assetId);
  // One lookup for the whole page rather than a join that would repeat the location row
  // against every asset standing in it.
  const locations = await listLocations(studio);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const byId = new Map(counts.map((c) => [c.assetId, Number(c.total) || 0]));
  const openById = new Map(openCounts.map((c) => [c.assetId, Number(c.open) || 0]));
  return rows.map((r) => ({
    ...r,
    locationName: r.locationId ? locationName.get(r.locationId) ?? null : null,
    category: r.category || categoryOf(r.type) || 'Uncategorised',
    // The counter is maintained on write; counting the tickets is the safety net for
    // anything recorded before the two agreed.
    faults: Math.max(r.faultCount || 0, byId.get(r.id) || 0),
    openFaults: openById.get(r.id) || 0,
    available: r.status === 'in-service',
  }));
}

/** The bikes each studio should have, read off the room plan. Seed only — the register is
 *  allowed to hold more than this (a bike bought later) or fewer (one retired). */
export function plannedAssetCounts(): {studio: string; area: string; type: AssetType; count: number}[] {
  const out: {studio: string; area: string; type: AssetType; count: number}[] = [];
  for (const layout of Object.values(STUDIO_LAYOUTS)) {
    for (const room of layout.rooms) {
      if (!/powercycle/i.test(room.name) || !room.capacity) continue;
      out.push({studio: layout.studioName, area: room.name, type: 'PowerCycle bike', count: room.capacity});
    }
  }
  return out;
}

/** Idempotent: an existing register is only topped up, never rewritten — a bike retired on
 *  purpose must not be quietly brought back by a re-seed. */
export async function seedAssets(): Promise<number> {
  await seedLocations();
  const plans = plannedAssetCounts();
  if (!plans.length) return 0;
  // Read once, then insert only what is missing: this runs on every cold start, and one
  // query beats a query per bike.
  const existing = await db
    .select({studio: assets.studio, label: assets.label})
    .from(assets)
    .where(inArray(assets.studio, [...new Set(plans.map((p) => p.studio))]));
  const have = new Set(existing.map((e) => `${e.studio}|${e.label}`));
  const missing = [];
  for (const plan of plans) {
    for (let n = 1; n <= plan.count; n++) {
      const label = String(n);
      if (have.has(`${plan.studio}|${label}`)) continue;
      missing.push({
        studio: plan.studio,
        area: plan.area,
        type: plan.type,
        label,
        name: assetName(plan.type, label),
        category: categoryOf(plan.type),
        status: 'in-service' as const,
      });
    }
  }
  if (!missing.length) return 0;
  const rows = await db.insert(assets).values(missing).onConflictDoNothing().returning({id: assets.id});
  return rows.length;
}

/* ------------------------------------------------------------------------ *
 * Managing the register
 *
 * `resolveAsset` above exists for the moment a fault is reported, where the only thing
 * known is "bike 6" and refusing the ticket to protect the register would be the wrong
 * trade. The functions below are the other half: somebody sitting down with the studio's
 * inventory and recording what is actually there, with serial numbers, locations and
 * everything else that makes a row worth keeping.
 * ------------------------------------------------------------------------ */

export interface AssetInput {
  studio: string;
  type: string;
  label: string;
  name?: string | null;
  area?: string | null;
  locationId?: number | null;
  serial?: string | null;
  assetTag?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  vendor?: string | null;
  quantity?: number | null;
  condition?: string | null;
  imageUrl?: string | null;
  purchaseCost?: string | number | null;
  warrantyUntil?: string | Date | null;
  acquiredAt?: string | Date | null;
  status?: AssetStatus | null;
  notes?: string | null;
}

const trimOrNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s ? s : null;
};

/** Dates arrive as "2025-03-01" from a form and as a Date from an importer. An
 *  unreadable one is dropped rather than stored as Invalid Date. */
const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const asCost = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replaceAll(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : null;
};

/** The column set shared by create and update, so the two cannot drift apart. */
function assetFields(input: AssetInput) {
  const type = input.type.trim();
  const label = String(input.label ?? '').trim();
  return {
    studio: input.studio.trim(),
    type,
    label,
    name: trimOrNull(input.name) || assetName(type, label),
    category: categoryOf(type),
    // `area` is the fallback for anywhere that is not a defined location. Once a location
    // is set it is the answer, so the free text is dropped rather than left to contradict
    // it — otherwise a row carries two competing answers to "where is it?" and the counts
    // per location cannot be trusted.
    area: input.locationId ? null : trimOrNull(input.area),
    locationId: input.locationId ?? null,
    serial: trimOrNull(input.serial),
    assetTag: trimOrNull(input.assetTag),
    manufacturer: trimOrNull(input.manufacturer),
    model: trimOrNull(input.model),
    vendor: trimOrNull(input.vendor),
    quantity: Math.max(1, Number(input.quantity) || 1),
    condition: trimOrNull(input.condition),
    imageUrl: trimOrNull(input.imageUrl),
    purchaseCost: asCost(input.purchaseCost),
    warrantyUntil: asDate(input.warrantyUntil),
    acquiredAt: asDate(input.acquiredAt),
    notes: trimOrNull(input.notes),
  };
}

export class AssetConflict extends Error {}

export async function createAsset(input: AssetInput): Promise<AssetRow> {
  const fields = assetFields(input);
  if (!fields.studio || !fields.type || !fields.label) throw new AssetConflict('Studio, type and label are all required.');
  const [row] = await db
    .insert(assets)
    .values({...fields, status: input.status ?? 'in-service'})
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AssetConflict(`${assetName(fields.type, fields.label)} already exists at ${fields.studio}.`);
  return row;
}

/** A partial edit. Only the keys present are written, so a form that renders six fields
 *  cannot blank the other ten. Status changes keep their own timestamp and note. */
export async function updateAsset(id: number, patch: Partial<AssetInput>): Promise<AssetRow | undefined> {
  const existing = await getAsset(id);
  if (!existing) return undefined;
  const merged = assetFields({
    studio: patch.studio ?? existing.studio,
    type: patch.type ?? existing.type,
    label: patch.label ?? existing.label,
    name: patch.name !== undefined ? patch.name : existing.name,
    area: patch.area !== undefined ? patch.area : existing.area,
    locationId: patch.locationId !== undefined ? patch.locationId : existing.locationId,
    serial: patch.serial !== undefined ? patch.serial : existing.serial,
    assetTag: patch.assetTag !== undefined ? patch.assetTag : existing.assetTag,
    manufacturer: patch.manufacturer !== undefined ? patch.manufacturer : existing.manufacturer,
    model: patch.model !== undefined ? patch.model : existing.model,
    vendor: patch.vendor !== undefined ? patch.vendor : existing.vendor,
    quantity: patch.quantity !== undefined ? patch.quantity : existing.quantity,
    condition: patch.condition !== undefined ? patch.condition : existing.condition,
    imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
    purchaseCost: patch.purchaseCost !== undefined ? patch.purchaseCost : existing.purchaseCost,
    warrantyUntil: patch.warrantyUntil !== undefined ? patch.warrantyUntil : existing.warrantyUntil,
    acquiredAt: patch.acquiredAt !== undefined ? patch.acquiredAt : existing.acquiredAt,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  });
  // The name follows the type and label unless somebody has deliberately named it.
  const renamed = patch.name === undefined && existing.name === assetName(existing.type, existing.label)
    ? assetName(merged.type, merged.label)
    : merged.name;
  const statusChanged = patch.status && patch.status !== existing.status;
  const [row] = await db
    .update(assets)
    .set({
      ...merged,
      name: renamed,
      ...(statusChanged ? {status: patch.status!, statusChangedAt: new Date(), retiredAt: patch.status === 'retired' ? new Date() : null} : {}),
      updatedAt: new Date(),
    })
    .where(eq(assets.id, id))
    .returning();
  return row;
}

/** Removing a row from the register.
 *
 *  Tickets keep pointing at the asset, so deleting one would either orphan its fault
 *  history or cascade the tickets away with it. Neither is acceptable: a fault happened
 *  whether or not the studio still owns the thing. Equipment with history is retired
 *  instead, and the caller is told which of the two happened. */
export async function deleteAsset(id: number): Promise<{deleted: boolean; retired: boolean; faults: number}> {
  const [{count}] = await db
    .select({count: sql<number>`count(*)::int`})
    .from(tickets)
    .where(eq(tickets.assetId, id));
  const faults = Number(count) || 0;
  if (faults > 0) {
    await db
      .update(assets)
      .set({status: 'retired', statusChangedAt: new Date(), retiredAt: new Date(), updatedAt: new Date()})
      .where(eq(assets.id, id));
    return {deleted: false, retired: true, faults};
  }
  await db.delete(assets).where(eq(assets.id, id));
  return {deleted: true, retired: false, faults: 0};
}

export interface BulkRowResult {
  row: number;
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
}

/**
 * Bulk import.
 *
 * Rows are validated and applied one at a time rather than in a single transaction, and
 * every outcome is reported. A spreadsheet of two hundred items will have a typo in it;
 * rejecting the whole file over row 147 means the other 199 items never get recorded, and
 * whoever is doing the counting gives up. `mode` decides what an existing row means:
 * `skip` leaves it alone, `update` fills in what the sheet knows.
 */
export async function bulkUpsertAssets(
  rows: AssetInput[],
  mode: 'skip' | 'update' = 'skip',
): Promise<{results: BulkRowResult[]; created: number; updated: number; skipped: number; errors: number}> {
  const results: BulkRowResult[] = [];
  for (const [i, input] of rows.entries()) {
    const rowNo = i + 1;
    const type = String(input.type || '').trim();
    const label = String(input.label ?? '').trim();
    const studio = String(input.studio || '').trim();
    const name = type && label ? assetName(type, label) : `Row ${rowNo}`;
    if (!studio || !type || !label) {
      results.push({row: rowNo, name, status: 'error', message: 'Studio, type and label are all required.'});
      continue;
    }
    if (!isAssetType(type)) {
      results.push({row: rowNo, name, status: 'error', message: `"${type}" is not a type in the equipment catalogue.`});
      continue;
    }
    try {
      const [existing] = await db
        .select({id: assets.id})
        .from(assets)
        .where(and(eq(assets.studio, studio), eq(assets.type, type), eq(assets.label, label)))
        .limit(1);
      if (existing) {
        if (mode === 'skip') {
          results.push({row: rowNo, name, status: 'skipped', message: 'Already in the register.'});
          continue;
        }
        await updateAsset(existing.id, input);
        results.push({row: rowNo, name, status: 'updated'});
        continue;
      }
      await createAsset({...input, studio, type, label});
      results.push({row: rowNo, name, status: 'created'});
    } catch (e) {
      results.push({row: rowNo, name, status: 'error', message: e instanceof Error ? e.message : 'Could not save this row.'});
    }
  }
  const tally = (s: BulkRowResult['status']) => results.filter((r) => r.status === s).length;
  return {results, created: tally('created'), updated: tally('updated'), skipped: tally('skipped'), errors: tally('error')};
}

/* ----------------------------- Locations ----------------------------- */

export type LocationRow = typeof assetLocations.$inferSelect;

export async function listLocations(studio?: string): Promise<LocationRow[]> {
  return db
    .select()
    .from(assetLocations)
    .where(studio ? eq(assetLocations.studio, studio) : undefined)
    .orderBy(asc(assetLocations.studio), asc(assetLocations.name));
}

export async function createLocation(input: {studio: string; name: string; description?: string | null}): Promise<LocationRow> {
  const [row] = await db
    .insert(assetLocations)
    .values({studio: input.studio.trim(), name: input.name.trim(), description: trimOrNull(input.description)})
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AssetConflict(`${input.name} already exists at ${input.studio}.`);
  return row;
}

export async function updateLocation(id: number, patch: {name?: string; description?: string | null; active?: boolean}): Promise<LocationRow | undefined> {
  const [row] = await db
    .update(assetLocations)
    .set({
      ...(patch.name !== undefined ? {name: patch.name.trim()} : {}),
      ...(patch.description !== undefined ? {description: trimOrNull(patch.description)} : {}),
      ...(patch.active !== undefined ? {active: patch.active} : {}),
    })
    .where(eq(assetLocations.id, id))
    .returning();
  return row;
}

/** Equipment keeps its row and loses its location: the schema's `set null` does that on
 *  delete, so nothing is orphaned and nothing is destroyed on the way through. */
export async function deleteLocation(id: number): Promise<{deleted: boolean; reassigned: number}> {
  const [{count}] = await db
    .select({count: sql<number>`count(*)::int`})
    .from(assets)
    .where(eq(assets.locationId, id));
  await db.delete(assetLocations).where(eq(assetLocations.id, id));
  return {deleted: true, reassigned: Number(count) || 0};
}

/** The rooms already described in the studio plans, so an administrator starts with the
 *  real rooms rather than an empty list. Idempotent. */
export async function seedLocations(): Promise<number> {
  const wanted: {studio: string; name: string; description: string | null}[] = [];
  for (const layout of Object.values(STUDIO_LAYOUTS)) {
    for (const room of layout.rooms) {
      wanted.push({studio: layout.studioName, name: room.name, description: room.description ?? null});
    }
  }
  if (!wanted.length) return 0;
  const rows = await db.insert(assetLocations).values(wanted).onConflictDoNothing().returning({id: assetLocations.id});
  return rows.length;
}

/* ----------------------------- Reporting ----------------------------- */

/** Ticket counts rolled up per equipment type, for the "what keeps breaking" question at
 *  the level of a category rather than one bike. */
export async function typeSummary(studio?: string) {
  const rows = await db
    .select({
      type: assets.type,
      category: assets.category,
      items: sql<number>`count(distinct ${assets.id})::int`,
      units: sql<number>`coalesce(sum(${assets.quantity}),0)::int`,
      outOfService: sql<number>`count(distinct ${assets.id}) filter (where ${assets.status} <> 'in-service')::int`,
      faults: sql<number>`count(${tickets.id})::int`,
      openFaults: sql<number>`count(${tickets.id}) filter (where ${tickets.status} not in ('resolved','closed'))::int`,
    })
    .from(assets)
    .leftJoin(tickets, eq(tickets.assetId, assets.id))
    .where(studio ? eq(assets.studio, studio) : undefined)
    .groupBy(assets.type, assets.category)
    .orderBy(asc(assets.category), asc(assets.type));
  return rows.map((r) => ({...r, category: r.category || categoryOf(r.type) || 'Uncategorised'}));
}

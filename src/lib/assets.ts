import {and,asc,desc,eq,inArray,sql} from 'drizzle-orm';
import {db} from '@/db';
import {assets,tickets} from '@/db/schema';
import {STUDIO_LAYOUTS} from './constants';

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

/** Only numbered cycles are identified on the floor today; the shape is open to the rest. */
export const ASSET_TYPES = ['PowerCycle bike'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export type AssetRow = typeof assets.$inferSelect;

/** How the floor says it. "cycle no 6", "bike 12", "bike #3" all mean one bike. */
const BIKE_REF =
  /\b(?:bike|cycle|powercycle)\b(?:\s*(?:no\.?|number|num|#))?\s*(\d{1,2})\b(?!\s*(?:min|mins|minute|minutes|pax|people|members|riders))/i;
const HASH_REF = /#\s*(\d{1,2})\b/;

/** Reads an equipment reference out of a message. Returns the type and the normalised
 *  label, which together identify the asset within a studio. */
export function parseAssetReference(text: string): {type: AssetType; label: string} | undefined {
  if (!text) return undefined;
  const bike = text.match(BIKE_REF);
  if (bike) return {type: 'PowerCycle bike', label: String(Number(bike[1]))};
  const hash = text.match(HASH_REF);
  if (hash) return {type: 'PowerCycle bike', label: String(Number(hash[1]))};
  return undefined;
}

export function assetName(type: AssetType, label: string): string {
  return type === 'PowerCycle bike' ? `Bike #${label}` : `${type} ${label}`;
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

export async function listAssets(filter: {studio?: string; type?: AssetType; status?: AssetStatus} = {}): Promise<AssetRow[]> {
  const clauses = [];
  if (filter.studio) clauses.push(eq(assets.studio, filter.studio));
  if (filter.type) clauses.push(eq(assets.type, filter.type));
  if (filter.status) clauses.push(eq(assets.status, filter.status));
  return db
    .select()
    .from(assets)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(asc(assets.type), sql`nullif(regexp_replace(${assets.label}, '\\D', '', 'g'), '')::int`, asc(assets.label));
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
export async function fleetHealth(studio?: string) {
  const rows = await listAssets(studio ? {studio} : {});
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
  const byId = new Map(counts.map((c) => [c.assetId, Number(c.total) || 0]));
  const openById = new Map(openCounts.map((c) => [c.assetId, Number(c.open) || 0]));
  return rows.map((r) => ({
    ...r,
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
        status: 'in-service' as const,
      });
    }
  }
  if (!missing.length) return 0;
  const rows = await db.insert(assets).values(missing).onConflictDoNothing().returning({id: assets.id});
  return rows.length;
}

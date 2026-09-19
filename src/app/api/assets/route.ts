import {z} from 'zod';
import {db} from '@/db';
import {assets} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {ApiError,errorResponse,requireAdmin,requireAgent,requireWorkspace,sameOrigin} from '@/lib/auth';
import {audit} from '@/lib/config';
import {EQUIPMENT_CATALOGUE,EQUIPMENT_CATEGORIES,EQUIPMENT_CONDITIONS} from '@/lib/constants';
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  AssetConflict,
  assetBrief,
  bulkUpsertAssets,
  createAsset,
  deleteAsset,
  fleetHealth,
  getAsset,
  isAssetType,
  listAssets,
  listLocations,
  setAssetStatus,
  typeSummary,
  updateAsset,
} from '@/lib/assets';

export const dynamic = 'force-dynamic';

/** Zod's own message for an enum of 33 values prints all 33. Say the useful thing instead. */
const assetType = z.string().refine(isAssetType, 'Choose a type from the equipment catalogue.');

/** The equipment register: what a studio owns, what state it is in, and its fault history. */
export async function GET(req: Request) {
  try {
    await requireWorkspace();
    const sp = new URL(req.url).searchParams;
    const id = sp.get('id');
    if (id) {
      const parsed = z.coerce.number().int().positive().safeParse(id);
      if (!parsed.success) throw new ApiError('Invalid asset id');
      const asset = await getAsset(parsed.data);
      if (!asset) throw new ApiError('Asset not found', 404);
      return Response.json({asset, brief: await assetBrief(parsed.data)});
    }
    const studio = sp.get('studio') || undefined;
    const type = sp.get('type') || undefined;
    const status = sp.get('status') || undefined;
    const category = sp.get('category') || undefined;
    const locationParam = sp.get('locationId');
    const locationId = locationParam ? z.coerce.number().int().positive().parse(locationParam) : undefined;
    if (type && !isAssetType(type)) throw new ApiError('Unknown asset type');
    if (status && !(ASSET_STATUSES as string[]).includes(status)) throw new ApiError('Unknown asset status');
    if (category && !(EQUIPMENT_CATEGORIES as string[]).includes(category)) throw new ApiError('Unknown equipment category');

    const view = sp.get('view');
    // The catalogue and the location list are what the management screen needs to render
    // its pickers; sending them with the fleet saves the page three more round-trips.
    if (view === 'fleet') {
      const [rows, locations, summary] = await Promise.all([
        fleetHealth(studio, {type, status: status as never, category, locationId}),
        listLocations(studio),
        typeSummary(studio),
      ]);
      return Response.json({
        assets: rows,
        locations,
        summary,
        catalogue: EQUIPMENT_CATALOGUE,
        categories: EQUIPMENT_CATEGORIES,
        conditions: EQUIPMENT_CONDITIONS,
        statuses: ASSET_STATUSES,
      });
    }
    if (view === 'summary') return Response.json({summary: await typeSummary(studio)});
    if (view === 'locations') return Response.json({locations: await listLocations(studio)});
    if (view === 'catalogue') {
      return Response.json({catalogue: EQUIPMENT_CATALOGUE, categories: EQUIPMENT_CATEGORIES, conditions: EQUIPMENT_CONDITIONS, types: ASSET_TYPES});
    }
    return Response.json({assets: await listAssets({studio, type, status: status as never, category, locationId})});
  } catch (e) {
    return errorResponse(e);
  }
}

const detailSchema = {
  area: z.string().max(80).nullable().optional(),
  locationId: z.number().int().positive().nullable().optional(),
  serial: z.string().max(120).nullable().optional(),
  assetTag: z.string().max(60).nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  vendor: z.string().max(120).nullable().optional(),
  quantity: z.number().int().min(1).max(10000).nullable().optional(),
  condition: z.enum(EQUIPMENT_CONDITIONS).nullable().optional(),
  purchaseCost: z.union([z.number(), z.string().max(30)]).nullable().optional(),
  warrantyUntil: z.string().max(40).nullable().optional(),
  acquiredAt: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  name: z.string().max(160).nullable().optional(),
};

const createSchema = z.object({
  studio: z.string().min(2).max(120),
  type: assetType,
  label: z.string().min(1).max(40),
  status: z.enum(ASSET_STATUSES as [string, ...string[]]).optional(),
  ...detailSchema,
});

/** One row of the import sheet. Every field but studio/type/label is optional, because a
 *  studio counting its 2 kg weights has a count and nothing else. */
const bulkSchema = z.object({
  mode: z.enum(['skip', 'update']).default('skip'),
  rows: z.array(z.object({
    studio: z.string().min(2).max(120),
    type: z.string().min(1).max(120),
    label: z.string().min(1).max(40),
    status: z.enum(ASSET_STATUSES as [string, ...string[]]).optional(),
    ...detailSchema,
  })).min(1).max(2000),
});

/** Adding equipment — one item, or a whole sheet of them. */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    const body = await req.json();

    if (Array.isArray((body as {rows?: unknown}).rows)) {
      const b = bulkSchema.parse(body);
      const outcome = await bulkUpsertAssets(b.rows as never, b.mode);
      await audit(actor, 'assets.bulk_import', 'assets', {
        submitted: b.rows.length,
        created: outcome.created,
        updated: outcome.updated,
        skipped: outcome.skipped,
        errors: outcome.errors,
      });
      return Response.json(outcome);
    }

    const b = createSchema.parse(body);
    const asset = await createAsset(b as never);
    await audit(actor, 'assets.create', 'assets', {id: asset.id, studio: b.studio, type: b.type, label: b.label});
    return Response.json({asset, created: true});
  } catch (e) {
    if (e instanceof AssetConflict) return Response.json({error: e.message}, {status: 409});
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  id: z.coerce.number().int().positive(),
  studio: z.string().min(2).max(120).optional(),
  type: assetType.optional(),
  label: z.string().min(1).max(40).optional(),
  status: z.enum(ASSET_STATUSES as [string, ...string[]]).optional(),
  /** Kept from the status-only version of this endpoint, which the floor still calls. */
  note: z.string().max(280).optional(),
  ...detailSchema,
});

/**
 * Editing a piece of equipment.
 *
 * A status-only body is still the common case — taking a bike out of rotation is what stops
 * the morning brief scheduling a class onto equipment that cannot be ridden — so that path
 * keeps its dedicated handling and its note. Anything else is a register edit.
 */
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    const b = patchSchema.parse(await req.json());
    const existing = await getAsset(b.id);
    if (!existing) throw new ApiError('Asset not found', 404);

    const {id, note, ...patch} = b;
    const editedKeys = Object.keys(patch).filter((k) => k !== 'status' && patch[k as keyof typeof patch] !== undefined);

    if (!editedKeys.length && b.status) {
      await setAssetStatus(id, b.status as never, note);
      await audit(actor, 'assets.status', 'assets', {id, from: existing.status, to: b.status, note});
      return Response.json({asset: await getAsset(id)});
    }

    const asset = await updateAsset(id, patch as never);
    await audit(actor, 'assets.updated', 'assets', {id, fields: editedKeys, status: b.status});
    return Response.json({asset});
  } catch (e) {
    if (e instanceof AssetConflict) return Response.json({error: e.message}, {status: 409});
    return errorResponse(e);
  }
}

/**
 * Removing equipment from the register.
 *
 * Restricted to administrators, and refused outright for anything that has ever been the
 * subject of a ticket — that equipment is retired instead, and the response says so, so the
 * caller is never told something was deleted when it was not.
 */
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    const id = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('id'));
    const [existing] = await db.select().from(assets).where(eq(assets.id, id));
    if (!existing) throw new ApiError('Asset not found', 404);
    const outcome = await deleteAsset(id);
    await audit(actor, outcome.deleted ? 'assets.deleted' : 'assets.retired', 'assets', {
      id,
      name: existing.name,
      faults: outcome.faults,
    });
    return Response.json({
      ...outcome,
      message: outcome.deleted
        ? `${existing.name} removed from the register.`
        : `${existing.name} has ${outcome.faults} ticket${outcome.faults === 1 ? '' : 's'} against it, so it was retired rather than deleted. Its fault history is intact.`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

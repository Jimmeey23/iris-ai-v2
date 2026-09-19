import {z} from 'zod';
import {db} from '@/db';
import {assets} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {ApiError,browserKey,errorResponse,requireAgent,requireWorkspace,sameOrigin} from '@/lib/auth';
import {audit} from '@/lib/config';
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  assetBrief,
  assetName,
  fleetHealth,
  getAsset,
  listAssets,
  resolveAsset,
  setAssetStatus,
} from '@/lib/assets';

export const dynamic = 'force-dynamic';

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
    if (type && !(ASSET_TYPES as readonly string[]).includes(type)) throw new ApiError('Unknown asset type');
    if (status && !(ASSET_STATUSES as string[]).includes(status)) throw new ApiError('Unknown asset status');
    if (sp.get('view') === 'fleet') return Response.json({assets: await fleetHealth(studio)});
    return Response.json({
      assets: await listAssets({
        studio,
        type: type as (typeof ASSET_TYPES)[number] | undefined,
        status: status as (typeof ASSET_STATUSES)[number] | undefined,
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  studio: z.string().min(2).max(120),
  type: z.enum(ASSET_TYPES),
  label: z.string().min(1).max(20),
  area: z.string().max(80).optional(),
  serial: z.string().max(80).optional(),
});

/** Adding one piece of equipment. Re-adding an existing one returns it rather than failing:
 *  the register grows at the moment something breaks, and a duplicate insert is not an
 *  error worth surfacing to someone holding a broken pedal. */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    const b = createSchema.parse(await req.json());
    const asset = await resolveAsset({studio: b.studio, type: b.type, label: b.label.trim(), area: b.area});
    if (!asset) throw new ApiError('Could not create that asset.');
    await audit(actor, 'assets.create', 'assets', {id: asset.id, studio: b.studio, type: b.type, label: b.label});
    return Response.json({asset, created: asset.name === assetName(b.type, b.label.trim())});
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(ASSET_STATUSES),
  note: z.string().max(280).optional(),
});

/** Taking a bike out of rotation, putting it back, retiring it. The status is what stops
 *  the morning brief scheduling a class onto equipment that cannot be ridden. */
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    const b = patchSchema.parse(await req.json());
    const [existing] = await db.select().from(assets).where(eq(assets.id, b.id));
    if (!existing) throw new ApiError('Asset not found', 404);
    await setAssetStatus(b.id, b.status, b.note);
    await audit(actor, 'assets.status', 'assets', {id: b.id, from: existing.status, to: b.status, note: b.note});
    return Response.json({asset: await getAsset(b.id)});
  } catch (e) {
    return errorResponse(e);
  }
}

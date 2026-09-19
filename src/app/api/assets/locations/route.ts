import {z} from 'zod';
import {ApiError,errorResponse,requireAdmin,requireWorkspace,sameOrigin} from '@/lib/auth';
import {audit} from '@/lib/config';
import {AssetConflict,createLocation,deleteLocation,listLocations,seedLocations,updateLocation} from '@/lib/assets';

export const dynamic = 'force-dynamic';

/**
 * Named places inside a site.
 *
 * Equipment kept a free-text `area` before this, which meant "Studio 1", "studio 1" and
 * "Studio1" were three different rooms and no count could be trusted. Locations are managed
 * by administrators for the same reason departments are: they are the thing everything else
 * groups by, so anyone being able to invent one defeats the grouping.
 */
export async function GET(req: Request) {
  try {
    await requireWorkspace();
    const studio = new URL(req.url).searchParams.get('studio') || undefined;
    return Response.json({locations: await listLocations(studio)});
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    const body = await req.json();
    // Bringing back the rooms from the studio plans, for a workspace that has cleared them.
    if ((body as {action?: string}).action === 'seed') {
      const added = await seedLocations();
      await audit(actor, 'asset_locations.seeded', 'asset_locations', {added});
      return Response.json({added, locations: await listLocations()});
    }
    const b = z.object({
      studio: z.string().min(2).max(120),
      name: z.string().min(1).max(120),
      description: z.string().max(400).nullable().optional(),
    }).parse(body);
    const location = await createLocation(b);
    await audit(actor, 'asset_locations.created', 'asset_locations', {id: location.id, studio: b.studio, name: b.name});
    return Response.json({location});
  } catch (e) {
    if (e instanceof AssetConflict) return Response.json({error: e.message}, {status: 409});
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    const b = z.object({
      id: z.coerce.number().int().positive(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(400).nullable().optional(),
      active: z.boolean().optional(),
    }).parse(await req.json());
    const {id, ...patch} = b;
    const location = await updateLocation(id, patch);
    if (!location) throw new ApiError('Location not found', 404);
    await audit(actor, 'asset_locations.updated', 'asset_locations', {id, fields: Object.keys(patch)});
    return Response.json({location});
  } catch (e) {
    return errorResponse(e);
  }
}

/** Equipment standing in a deleted location keeps its row and loses its location, rather
 *  than disappearing with the room. The response says how many were affected. */
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    const id = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('id'));
    const outcome = await deleteLocation(id);
    await audit(actor, 'asset_locations.deleted', 'asset_locations', {id, reassigned: outcome.reassigned});
    return Response.json({
      ...outcome,
      message: outcome.reassigned
        ? `Location removed. ${outcome.reassigned} item${outcome.reassigned === 1 ? '' : 's'} now have no location set.`
        : 'Location removed.',
    });
  } catch (e) {
    return errorResponse(e);
  }
}

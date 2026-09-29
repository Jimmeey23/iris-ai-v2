import {z} from 'zod';
import {sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings} from '@/db/schema';
import {errorResponse, requireAdmin, requireWorkspace, sameOrigin} from '@/lib/auth';
import {getSetting} from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Where the rooms sit on each studio's plan, when somebody has moved them.
 *
 * Workspace-wide rather than per person: a floor plan is a shared description of a real
 * building, so a correction one manager makes should be the plan everyone sees. Reading is
 * open to the workspace; only an administrator may rearrange it.
 *
 * Absent keys fall back to the plan compiled into the app, so this stores corrections only
 * — an empty record is the normal state. */
const KEY = 'radar:layout';
/** The AI-rendered plan that matches the layout above, when one has been generated.
 *  Reset alongside the layout so a stale render can never outlive the arrangement it drew. */
const IMAGE_KEY = 'radar:layout-image';

const spot = z.object({
  x: z.number().min(-5).max(105), y: z.number().min(-5).max(105),
  w: z.number().min(2).max(100), h: z.number().min(2).max(100),
});
const payload = z.object({
  studio: z.string().min(1).max(60),
  rooms: z.record(z.string().min(1).max(80), spot).refine(r => Object.keys(r).length <= 40, 'Too many rooms'),
});

export async function GET() {
  try {
    await requireWorkspace();
    const [layout, images] = await Promise.all([getSetting(KEY), getSetting(IMAGE_KEY)]);
    return Response.json({layout: layout?.value ?? {}, images: images?.value ?? {}});
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    await requireAdmin();
    const body = payload.parse(await req.json());
    const current = ((await getSetting(KEY))?.value ?? {}) as Record<string, unknown>;
    const next = {...current, [body.studio]: body.rooms};
    await db
      .insert(appSettings)
      .values({key: KEY, value: next})
      .onConflictDoUpdate({target: appSettings.key, set: {value: next, updatedAt: new Date()}});
    return Response.json({ok: true, layout: next});
  } catch (e) {
    return errorResponse(e);
  }
}

/** Reset one studio back to the plan that ships with the app. */
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    await requireAdmin();
    const {studio} = z.object({studio: z.string().min(1).max(60)}).parse(await req.json());
    const current = ((await getSetting(KEY))?.value ?? {}) as Record<string, unknown>;
    delete current[studio];
    const currentImages = ((await getSetting(IMAGE_KEY))?.value ?? {}) as Record<string, unknown>;
    delete currentImages[studio];
    await db
      .insert(appSettings)
      .values({key: KEY, value: current})
      .onConflictDoUpdate({target: appSettings.key, set: {value: current, updatedAt: new Date(), version: sql`${appSettings.version} + 1`}});
    await db
      .insert(appSettings)
      .values({key: IMAGE_KEY, value: currentImages})
      .onConflictDoUpdate({target: appSettings.key, set: {value: currentImages, updatedAt: new Date(), version: sql`${appSettings.version} + 1`}});
    return Response.json({ok: true, layout: current, images: currentImages});
  } catch (e) {
    return errorResponse(e);
  }
}

import {z} from 'zod';
import OpenAI, {toFile} from 'openai';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings} from '@/db/schema';
import {errorResponse, requireAdmin, sameOrigin, ApiError} from '@/lib/auth';
import {getSetting, credentials} from '@/lib/config';
import {enforceRateLimit} from '@/lib/rate-limit';
import {FLOORPLANS, type FloorplanSpot} from '@/lib/radar-floorplans';

export const dynamic = 'force-dynamic';

/** Rendered floor-plan images the AI has drawn to match an admin's rearranged layout,
 *  keyed by studio id. Absent keys fall back to the reference photo shipped with the app. */
const IMAGE_KEY = 'radar:layout-image';

const spot = z.object({
  x: z.number().min(-5).max(105), y: z.number().min(-5).max(105),
  w: z.number().min(2).max(100), h: z.number().min(2).max(100),
});
const payload = z.object({
  studio: z.string().min(1).max(60),
  studioName: z.string().min(1).max(120),
  changedRooms: z.array(z.object({room: z.string().min(1).max(80), before: spot, after: spot})).min(1).max(10),
  allRooms: z.array(z.string().min(1).max(80)).max(40),
});

/** A room's coarse position on the plan, in words a model can draw from — the exact
 *  percentages mean nothing to it, but "top-left" next to "centre" reliably does. */
function zoneOf(s: FloorplanSpot): string {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const h = cx < 34 ? 'left' : cx > 66 ? 'right' : 'centre';
  const v = cy < 34 ? 'top' : cy > 66 ? 'bottom' : 'middle';
  return v === 'middle' && h === 'centre' ? 'centre' : `${v}-${h}`;
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireAdmin();
    await enforceRateLimit('radarLayoutImage');
    const {studio, studioName, changedRooms, allRooms} = payload.parse(await req.json());
    const c = await credentials('chatgpt');
    if (!c.api_key) throw new ApiError('Connect OpenAI in Integrations to regenerate the floor plan.', 503);

    const base = FLOORPLANS[studio] || FLOORPLANS.kwality;
    const images = ((await getSetting(IMAGE_KEY))?.value ?? {}) as Record<string, string>;
    const currentSrc = images[studio];
    // Edit whatever is on screen right now — a previous AI render if one exists, otherwise
    // the shipped reference photo — so a second move never throws away the first one.
    const imageBuffer = currentSrc?.startsWith('data:')
      ? Buffer.from(currentSrc.slice(currentSrc.indexOf(',') + 1), 'base64')
      : await readFile(path.join(process.cwd(), 'public', base.src));

    const moved = changedRooms
      .filter(({before, after}) => zoneOf(before) !== zoneOf(after))
      .map(({room, before, after}) => `- "${room}": move from the ${zoneOf(before)} to the ${zoneOf(after)} of the plan, keeping its footprint, label style and finish exactly as drawn`);
    if (!moved.length) throw new ApiError('None of the moved rooms changed position enough to redraw.', 400);

    const unchanged = allRooms.filter(r => !changedRooms.some(c => c.room === r));
    const prompt = `This is the existing architectural floor plan render for "${studioName}". Make the smallest possible edit: relocate ONLY the following room(s), nothing else:\n${moved.join('\n')}\n\nEvery other room — ${unchanged.join(', ')} — must stay in exactly the same place, size, shape and appearance as in the source image. Do not change the camera angle, perspective, lighting, color palette, wall style, flooring texture, or any label on an unlisted room. Do not add or remove any room. This is a targeted edit of a real building's plan, not a new design.`;

    const client = new OpenAI({apiKey: c.api_key, timeout: 90000, maxRetries: 1});
    const file = await toFile(imageBuffer, 'floorplan.png', {type: 'image/png'});
    const image = await client.images.edit({
      model: 'gpt-image-1',
      image: file,
      prompt,
      size: '1536x1024',
      n: 1,
    });
    const b64 = image.data?.[0]?.b64_json;
    if (!b64) throw new ApiError('The image model did not return a render. Try again.', 502);
    const dataUrl = `data:image/png;base64,${b64}`;

    const next = {...images, [studio]: dataUrl};
    await db
      .insert(appSettings)
      .values({key: IMAGE_KEY, value: next})
      .onConflictDoUpdate({target: appSettings.key, set: {value: next, updatedAt: new Date(), version: sql`${appSettings.version} + 1`}});

    return Response.json({ok: true, imageUrl: dataUrl});
  } catch (e) {
    return errorResponse(e);
  }
}

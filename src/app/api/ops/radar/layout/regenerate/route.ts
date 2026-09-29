import {z} from 'zod';
import OpenAI from 'openai';
import {sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings} from '@/db/schema';
import {errorResponse, requireAdmin, sameOrigin, ApiError} from '@/lib/auth';
import {getSetting, credentials} from '@/lib/config';
import {enforceRateLimit} from '@/lib/rate-limit';

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
  rooms: z.record(z.string().min(1).max(80), spot).refine(r => Object.keys(r).length >= 1 && Object.keys(r).length <= 40, 'Need at least one room'),
});

/** A room's coarse position on the plan, in words a model can draw from — the exact
 *  percentages mean nothing to it, but "top-left" next to "centre" reliably does. */
function zoneOf(s: z.infer<typeof spot>): string {
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
    const {studio, studioName, rooms} = payload.parse(await req.json());
    const c = await credentials('chatgpt');
    if (!c.api_key) throw new ApiError('Connect OpenAI in Integrations to regenerate the floor plan.', 503);

    const roomLines = Object.entries(rooms)
      .map(([name, s]) => `- ${name}: ${zoneOf(s)} of the plan`)
      .join('\n');
    const prompt = `A clean bird's-eye architectural floor plan rendering of a boutique fitness studio named "${studioName}", isometric perspective, warm wood-toned flooring, soft interior lighting, no people, no text watermarks. Label each room clearly with its name printed on the floor. Arrange the rooms at these positions on the plan:\n${roomLines}\nKeep walls, doorways and circulation paths architecturally plausible given this arrangement. Style: realistic 3D architectural visualization, top-down isometric, consistent line weight, neutral cream and wood palette.`;

    const client = new OpenAI({apiKey: c.api_key, timeout: 60000, maxRetries: 1});
    const image = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1536x1024',
      n: 1,
    });
    const b64 = image.data?.[0]?.b64_json;
    if (!b64) throw new ApiError('The image model did not return a render. Try again.', 502);
    const dataUrl = `data:image/png;base64,${b64}`;

    const current = ((await getSetting(IMAGE_KEY))?.value ?? {}) as Record<string, string>;
    const next = {...current, [studio]: dataUrl};
    await db
      .insert(appSettings)
      .values({key: IMAGE_KEY, value: next})
      .onConflictDoUpdate({target: appSettings.key, set: {value: next, updatedAt: new Date(), version: sql`${appSettings.version} + 1`}});

    return Response.json({ok: true, imageUrl: dataUrl});
  } catch (e) {
    return errorResponse(e);
  }
}

import {lt, sql} from 'drizzle-orm';
import {db} from '@/db';
import {rateLimits} from '@/db/schema';
import {ApiError, browserKey} from './auth';

/**
 * Fixed-window request counters.
 *
 * The three endpoints that call OpenAI — chat, speech, transcription — are reachable by
 * anonymous studio staff by design, because intake has to work for someone who has never
 * signed in. That design only holds if a caller cannot spend the workspace's API budget in
 * a loop, and before this there was no limit of any kind on any route.
 *
 * The counter lives in the database rather than in a module-scope Map because the next
 * request is not guaranteed to reach the same process; an in-memory limiter would be a
 * limit per instance, which is not a limit.
 */
export interface Limit {
  /** Requests allowed inside one window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const LIMITS = {
  /** A conversation turn. Generous enough to type quickly, tight enough to stop a script. */
  irisChat: {max: 30, windowSeconds: 60},
  /** Whisper, billed by audio length — the expensive one. */
  transcribe: {max: 10, windowSeconds: 60},
  /** Text to speech, billed per character. */
  speak: {max: 20, windowSeconds: 60},
  /** File uploads, which cost storage rather than tokens. */
  upload: {max: 20, windowSeconds: 60},
} satisfies Record<string, Limit>;

/**
 * Counts one request against `bucket` for the current caller and throws once the window is
 * full. Returns what is left, so a caller can surface it in a header.
 *
 * The whole thing is one statement: the insert either creates the window or, on conflict,
 * increments it — resetting the count when the previous window has expired. Read-then-write
 * would let two concurrent requests both read 29 and both proceed.
 */
export async function enforceRateLimit(bucket: keyof typeof LIMITS, identity?: string): Promise<{remaining: number}> {
  const limit = LIMITS[bucket];
  const who = identity ?? (await browserKey());
  const key = `${bucket}:${who}`;
  const windowMs = limit.windowSeconds * 1000;
  const [row] = await db
    .insert(rateLimits)
    .values({key, count: 1, windowStart: new Date()})
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < now() - (${limit.windowSeconds} * interval '1 second') then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < now() - (${limit.windowSeconds} * interval '1 second') then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({count: rateLimits.count, windowStart: rateLimits.windowStart});

  // The table would otherwise grow a permanent row per caller per bucket. Sweeping on
  // roughly one call in two hundred keeps it bounded without putting a delete on the hot
  // path of every request; anything older than a day is a window nobody is inside.
  if (Math.random() < 0.005) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 86400000)));
  }

  const used = Number(row?.count ?? 1);
  if (used > limit.max) {
    const resetsIn = Math.max(1, Math.ceil((new Date(row!.windowStart).getTime() + windowMs - Date.now()) / 1000));
    throw new ApiError(`Too many requests. Try again in ${resetsIn} second${resetsIn === 1 ? '' : 's'}.`, 429);
  }
  return {remaining: Math.max(0, limit.max - used)};
}

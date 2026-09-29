import {z} from 'zod';
import {errorResponse, requireWorkspace, sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';
import {PII_COOKIE, PII_TTL_SECONDS, passcodeMatches, piiUnlocked, unlockToken} from '@/lib/momence-privacy';

export const dynamic = 'force-dynamic';

/** Whether this person's contact details are currently revealed, and for how much longer. */
export async function GET() {
  try {
    const user = await requireWorkspace();
    return Response.json({unlocked: await piiUnlocked(user.id), ttlSeconds: PII_TTL_SECONDS});
  } catch (e) {
    return errorResponse(e);
  }
}

/** Reveal contact details for a while. Rate-limited per person: a four-digit code is only
 *  worth anything if it cannot be tried ten thousand times. */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireWorkspace();
    await enforceRateLimit('momencePii', `momence-pii:${user.id}`);
    const {code} = z.object({code: z.string().min(1).max(16)}).parse(await req.json());
    if (!passcodeMatches(code)) return Response.json({error: 'That passcode is not right.'}, {status: 403});
    const res = Response.json({unlocked: true, ttlSeconds: PII_TTL_SECONDS});
    res.headers.append(
      'Set-Cookie',
      `${PII_COOKIE}=${unlockToken(user.id)}; Path=/; Max-Age=${PII_TTL_SECONDS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

/** Hide them again — for locking the screen before walking away. */
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    await requireWorkspace();
    const res = Response.json({unlocked: false});
    res.headers.append('Set-Cookie', `${PII_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

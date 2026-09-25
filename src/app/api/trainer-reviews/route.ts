import {syncTrainerReviews,reviewSources} from '@/lib/trainer-reviews';
import {errorResponse,requireAdmin,requireWorkspace,sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';

export const dynamic='force-dynamic';
export const maxDuration=300;

/** The configured assessment sources. */
export async function GET(){try{
  await requireWorkspace();
  return Response.json({sources:reviewSources()});
}catch(e){return errorResponse(e);}}

/** Pulls every source immediately, ignoring the throttle. That is an expensive fan-out
 *  to external sources, so it is administrators only and rate limited. */
export async function POST(req:Request){try{
  sameOrigin(req);
  const user=await requireAdmin();
  await enforceRateLimit('trainerSync','trainer-sync:user:'+user.id);
  return Response.json(await syncTrainerReviews());
}catch(e){return errorResponse(e);}}

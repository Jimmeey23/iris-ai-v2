import {syncTrainerReviews,reviewSources} from '@/lib/trainer-reviews';
import {errorResponse,requireAgent,requireWorkspace,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export const maxDuration=300;

/** The configured assessment sources. */
export async function GET(){try{
  await requireWorkspace();
  return Response.json({sources:reviewSources()});
}catch(e){return errorResponse(e);}}

/** Pulls every source immediately, ignoring the throttle. */
export async function POST(req:Request){try{
  sameOrigin(req);
  await requireAgent();
  return Response.json(await syncTrainerReviews());
}catch(e){return errorResponse(e);}}

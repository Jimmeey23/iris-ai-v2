import {z} from 'zod';
import {db} from '@/db';
import {ticketResolutions,ticketActivities} from '@/db/schema';
import {ApiError,errorResponse,requireWorkspace,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace} from '@/lib/tickets';

export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};

/** Readable by anyone signed into the workspace. Writing it is another matter —
 *  every mutating handler below goes through requireResolutionAccess. */
export async function GET(_req:Request,ctx:Ctx){try{
  const id=z.coerce.number().int().positive().parse((await ctx.params).id);
  const user=await requireWorkspace();
  if(!user)throw new ApiError('Sign in to view this ticket.',401);
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

export async function PUT(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=z.coerce.number().int().positive().parse((await ctx.params).id);
  const{user}=await requireResolutionAccess(id);
  const b=z.object({rootCause:z.string().max(5000),actionTaken:z.string().max(5000),preventiveAction:z.string().max(5000),memberOutcome:z.string().max(5000),followUpAt:z.string().max(100).optional()}).parse(await req.json());
  await db.transaction(async tx=>{
    await tx.insert(ticketResolutions).values({ticketId:id,authorUserId:user.id,...b}).onConflictDoUpdate({target:ticketResolutions.ticketId,set:{...b,authorUserId:user.id,updatedAt:new Date()}});
    await tx.insert(ticketActivities).values({ticketId:id,actorName:user.name,action:'resolution.updated',detail:'Private owner-only resolution updated.'});
  });
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

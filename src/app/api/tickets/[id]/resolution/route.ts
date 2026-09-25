import {z} from 'zod';
import {db} from '@/db';
import {ticketResolutions,ticketActivities} from '@/db/schema';
import {errorResponse,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace} from '@/lib/tickets';

export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};

/** The resolution workspace holds private owner notes and member contact details, so
 *  reading it is gated exactly like writing it: the caller must have access to the ticket. */
export async function GET(_req:Request,ctx:Ctx){try{
  const id=z.coerce.number().int().positive().parse((await ctx.params).id);
  await requireResolutionAccess(id);
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

import {z} from 'zod';
import {db} from '@/db';
import {ticketResolutions,ticketActivities,tickets} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {ApiError,errorResponse,requireTicketAccess,requireWorkspace,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace,canResolveTicket} from '@/lib/tickets';

export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};

/** The resolution is visible to anyone who can open the ticket — only writing it is
 *  restricted to the assigned owner and their reporting manager (see PUT below). */
export async function GET(_req:Request,ctx:Ctx){try{
  const id=z.coerce.number().int().positive().parse((await ctx.params).id);
  const user=await requireWorkspace();
  const[ticket]=await db.select().from(tickets).where(eq(tickets.id,id));
  if(!ticket)throw new ApiError('Ticket not found',404);
  if(!ticket.resolutionRequired)throw new ApiError('This ticket does not require a resolution.');
  requireTicketAccess(user,ticket);
  const canResolve=await canResolveTicket(user,ticket.assignedStaffId,ticket.resolutionRequired);
  return Response.json({...await getResolutionWorkspace(id),canResolve});
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

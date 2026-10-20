import {z} from 'zod';
import {db} from '@/db';
import {ticketResolutions,ticketActivities,tickets} from '@/db/schema';
import {eq,sql} from 'drizzle-orm';
import {ApiError,errorResponse,requireTicketAccess,requireWorkspace,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace,canResolveTicket} from '@/lib/tickets';
import {after} from 'next/server';
import {signalChanged} from '@/lib/realtime';

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
  const canResolve=await canResolveTicket(user,ticket.assignedStaffId,ticket.resolutionRequired,ticket.additionalOwners);
  return Response.json({...await getResolutionWorkspace(id),canResolve});
}catch(e){return errorResponse(e);}}

export async function PUT(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=z.coerce.number().int().positive().parse((await ctx.params).id);
  const{user}=await requireResolutionAccess(id);
  const b=z.object({rootCause:z.string().max(5000),actionTaken:z.string().max(5000),preventiveAction:z.string().max(5000),memberOutcome:z.string().max(5000),followUpAt:z.string().max(100).optional(),expectedUpdatedAt:z.string().datetime().nullable()}).parse(await req.json());
  const {expectedUpdatedAt,...content}=b;
  await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(578106,${id})`);
    const [previous]=await tx.select().from(ticketResolutions).where(eq(ticketResolutions.ticketId,id));
    if((previous?.updatedAt.toISOString()||null)!==expectedUpdatedAt)throw new ApiError('The resolution was edited elsewhere. Refresh and review the latest text before saving.',409);
    const at=new Date();
    await tx.insert(ticketResolutions).values({ticketId:id,authorUserId:user.id,...content,updatedAt:at}).onConflictDoUpdate({target:ticketResolutions.ticketId,set:{...content,authorUserId:user.id,updatedAt:at}});
    await tx.insert(ticketActivities).values({ticketId:id,actorName:user.name,action:'resolution.updated',detail:JSON.stringify({message:'Resolution write-up updated.',previous:previous?{rootCause:previous.rootCause,actionTaken:previous.actionTaken,preventiveAction:previous.preventiveAction,memberOutcome:previous.memberOutcome}:null})});
  });
  // The write landed: tell the other open boards, so a teammate sees this without
  // waiting for their poll. Advisory only — see lib/realtime.
  after(() => signalChanged('tickets'));
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

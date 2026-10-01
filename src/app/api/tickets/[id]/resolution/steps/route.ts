import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {ticketResolutionSteps,ticketActivities} from '@/db/schema';
import {ApiError,errorResponse,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace} from '@/lib/tickets';
import {notifyMentions,resolveMentions} from '@/lib/mentions';

export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
const idOf=async(ctx:Ctx)=>z.coerce.number().int().positive().parse((await ctx.params).id);

export async function POST(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user,ticket}=await requireResolutionAccess(id);
  const b=z.object({body:z.string().trim().min(3,'Describe the step in a few words.').max(4000),mentionUserIds:z.array(z.number().int().positive()).max(20).default([])}).parse(await req.json());
  // The work log is private to the resolution workspace, so a tag here is internal by definition.
  const people=await resolveMentions(b.body,b.mentionUserIds,user.id);
  await db.transaction(async tx=>{
    await tx.insert(ticketResolutionSteps).values({ticketId:id,authorUserId:user.id,authorName:user.name,body:b.body});
    await tx.insert(ticketActivities).values({ticketId:id,actorName:user.name,action:'resolution.step',detail:b.body.slice(0,180)});
    await notifyMentions(tx,{people,ticketId:id,ticketNumber:ticket.ticketNumber,actorName:user.name,body:b.body,context:'in the work log'});
  });
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

export async function DELETE(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user}=await requireResolutionAccess(id);
  const stepId=z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('stepId'));
  const[step]=await db.select().from(ticketResolutionSteps).where(and(eq(ticketResolutionSteps.id,stepId),eq(ticketResolutionSteps.ticketId,id)));
  if(!step)throw new ApiError('That step is no longer here.',404);
  // A step is somebody's account of what they did. Only its author, or an admin,
  // may strike it from the log.
  if(step.authorUserId!==user.id&&user.role!=='admin')throw new ApiError('Only the person who logged this step can remove it.',403);
  await db.delete(ticketResolutionSteps).where(eq(ticketResolutionSteps.id,stepId));
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

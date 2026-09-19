import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {ticketFollowUps,ticketActivities,staff} from '@/db/schema';
import {ApiError,errorResponse,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace} from '@/lib/tickets';

export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
const idOf=async(ctx:Ctx)=>z.coerce.number().int().positive().parse((await ctx.params).id);

export async function POST(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user,ticket}=await requireResolutionAccess(id);
  const b=z.object({
    note:z.string().trim().min(3,'Say what the follow-up is for.').max(2000),
    dueAt:z.string().min(1,'Pick a date.'),
    ownerStaffId:z.number().int().positive().nullable().optional(),
  }).parse(await req.json());
  const due=new Date(b.dueAt);
  if(Number.isNaN(due.getTime()))throw new ApiError('That follow-up date could not be read.');
  let ownerStaffId=b.ownerStaffId??ticket.assignedStaffId,ownerName=ticket.assignedStaffName||'';
  if(ownerStaffId){
    const[p]=await db.select({id:staff.id,name:staff.name}).from(staff).where(and(eq(staff.id,ownerStaffId),eq(staff.isActive,true)));
    if(!p)throw new ApiError('Choose an active owner for the follow-up.');
    ownerStaffId=p.id;ownerName=p.name;
  }
  await db.transaction(async tx=>{
    await tx.insert(ticketFollowUps).values({ticketId:id,note:b.note,dueAt:due,ownerStaffId:ownerStaffId??null,ownerName,createdByUserId:user.id,createdByName:user.name});
    await tx.insert(ticketActivities).values({ticketId:id,actorName:user.name,action:'resolution.followup',detail:`Follow-up due ${due.toISOString().slice(0,10)}: ${b.note.slice(0,140)}`});
  });
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

export async function PATCH(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user}=await requireResolutionAccess(id);
  const b=z.object({followUpId:z.number().int().positive(),done:z.boolean()}).parse(await req.json());
  const[row]=await db.select().from(ticketFollowUps).where(and(eq(ticketFollowUps.id,b.followUpId),eq(ticketFollowUps.ticketId,id)));
  if(!row)throw new ApiError('That follow-up is no longer here.',404);
  await db.update(ticketFollowUps).set({done:b.done,completedAt:b.done?new Date():null}).where(eq(ticketFollowUps.id,b.followUpId));
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

export async function DELETE(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user}=await requireResolutionAccess(id);
  const followUpId=z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('followUpId'));
  const[row]=await db.select().from(ticketFollowUps).where(and(eq(ticketFollowUps.id,followUpId),eq(ticketFollowUps.ticketId,id)));
  if(!row)throw new ApiError('That follow-up is no longer here.',404);
  if(row.createdByUserId!==user.id&&user.role!=='admin')throw new ApiError('Only the person who raised this follow-up can remove it.',403);
  await db.delete(ticketFollowUps).where(eq(ticketFollowUps.id,followUpId));
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

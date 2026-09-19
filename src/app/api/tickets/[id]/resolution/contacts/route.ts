import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {ticketContactLog,ticketActivities} from '@/db/schema';
import {ApiError,errorResponse,sameOrigin} from '@/lib/auth';
import {requireResolutionAccess,getResolutionWorkspace} from '@/lib/tickets';

export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
const idOf=async(ctx:Ctx)=>z.coerce.number().int().positive().parse((await ctx.params).id);

export const CONTACT_CHANNELS=['call','whatsapp','email','sms','in_person'] as const;
export const CONTACT_OUTCOMES=['reached','no_answer','left_message','awaiting_reply','declined'] as const;

export async function POST(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user}=await requireResolutionAccess(id);
  const b=z.object({
    channel:z.enum(CONTACT_CHANNELS),
    outcome:z.enum(CONTACT_OUTCOMES),
    note:z.string().trim().max(2000).default(''),
    contactedAt:z.string().optional(),
  }).parse(await req.json());
  const when=b.contactedAt?new Date(b.contactedAt):new Date();
  if(Number.isNaN(when.getTime()))throw new ApiError('That contact time could not be read.');
  await db.transaction(async tx=>{
    await tx.insert(ticketContactLog).values({ticketId:id,channel:b.channel,outcome:b.outcome,note:b.note,contactedAt:when,authorUserId:user.id,authorName:user.name});
    await tx.insert(ticketActivities).values({ticketId:id,actorName:user.name,action:'resolution.contact',detail:`${b.channel} · ${b.outcome}`});
  });
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

export async function DELETE(req:Request,ctx:Ctx){try{
  sameOrigin(req);
  const id=await idOf(ctx);
  const{user}=await requireResolutionAccess(id);
  const contactId=z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('contactId'));
  const[row]=await db.select().from(ticketContactLog).where(and(eq(ticketContactLog.id,contactId),eq(ticketContactLog.ticketId,id)));
  if(!row)throw new ApiError('That contact entry is no longer here.',404);
  if(row.authorUserId!==user.id&&user.role!=='admin')throw new ApiError('Only the person who logged this contact can remove it.',403);
  await db.delete(ticketContactLog).where(eq(ticketContactLog.id,contactId));
  return Response.json(await getResolutionWorkspace(id));
}catch(e){return errorResponse(e);}}

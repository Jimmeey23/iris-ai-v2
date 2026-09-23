import {NextRequest} from 'next/server';
import {and,desc,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {ticketDrafts} from '@/db/schema';
import {ApiError,errorResponse,requireWorkspace,sameOrigin} from '@/lib/auth';

export const dynamic='force-dynamic';
const payloadSchema=z.record(z.string(),z.unknown());
const createSchema=z.object({
  title:z.string().trim().min(1).max(180),templateId:z.string().max(180).nullable().optional(),
  category:z.string().min(1).max(180),subcategory:z.string().min(1).max(180),payload:payloadSchema,
});
const updateSchema=createSchema.partial().extend({id:z.number().int().positive()});

export async function GET(){try{const user=await requireWorkspace();const drafts=await db.select().from(ticketDrafts).where(eq(ticketDrafts.userId,user.id)).orderBy(desc(ticketDrafts.updatedAt));return Response.json({drafts,limit:3});}catch(e){return errorResponse(e);}}

export async function POST(req:NextRequest){try{sameOrigin(req);const user=await requireWorkspace();const body=createSchema.parse(await req.json());const draft=await db.transaction(async tx=>{
  // Serialize draft creation for one user so parallel requests cannot both pass the cap.
  await tx.execute(sql`select pg_advisory_xact_lock(${user.id}, 573)`);
  const [{count}]=await tx.select({count:sql<number>`count(*)::int`}).from(ticketDrafts).where(eq(ticketDrafts.userId,user.id));
  if(count>=3)throw new ApiError('You already have 3 saved drafts. Resume or delete one before saving another.',409);
  const[created]=await tx.insert(ticketDrafts).values({...body,userId:user.id,templateId:body.templateId||null}).returning();return created;
});return Response.json({draft},{status:201});}catch(e){return errorResponse(e);}}

export async function PATCH(req:NextRequest){try{sameOrigin(req);const user=await requireWorkspace();const body=updateSchema.parse(await req.json());const{id,...changes}=body;const[draft]=await db.update(ticketDrafts).set({...changes,templateId:changes.templateId===undefined?undefined:changes.templateId||null,updatedAt:new Date()}).where(and(eq(ticketDrafts.id,id),eq(ticketDrafts.userId,user.id))).returning();if(!draft)throw new ApiError('Draft not found.',404);return Response.json({draft});}catch(e){return errorResponse(e);}}

export async function DELETE(req:NextRequest){try{sameOrigin(req);const user=await requireWorkspace();const id=Number(req.nextUrl.searchParams.get('id'));if(!Number.isInteger(id)||id<1)throw new ApiError('A valid draft is required.');const[removed]=await db.delete(ticketDrafts).where(and(eq(ticketDrafts.id,id),eq(ticketDrafts.userId,user.id))).returning({id:ticketDrafts.id});if(!removed)throw new ApiError('Draft not found.',404);return Response.json({ok:true});}catch(e){return errorResponse(e);}}

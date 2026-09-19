import {z} from 'zod';import {and,eq} from 'drizzle-orm';import {db} from '@/db';import {chatSessions,chatMessages} from '@/db/schema';
import {browserKey,intakeActor,errorResponse,ApiError,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{sameOrigin(req);await intakeActor();const owner=await browserKey();const {sessionId}=z.object({sessionId:z.string()}).parse(await req.json());
const[s]=await db.select().from(chatSessions).where(and(eq(chatSessions.id,sessionId),eq(chatSessions.ownerKey,owner)));
if(!s)return Response.json({discarded:false});
if(s.ticketId)throw new ApiError('This conversation already created a ticket, so its draft cannot be discarded.',409);
await db.transaction(async tx=>{await tx.delete(chatMessages).where(eq(chatMessages.sessionId,s.id));await tx.delete(chatSessions).where(eq(chatSessions.id,s.id));});
return Response.json({discarded:true});}catch(e){return errorResponse(e);}}

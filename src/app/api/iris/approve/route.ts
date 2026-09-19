import {after} from 'next/server';
import {deliverPending} from '@/lib/integrations';
import {z} from 'zod';import {and,eq} from 'drizzle-orm';import {db} from '@/db';import {chatSessions} from '@/db/schema';
import {makeDraft,createTicketFromDraft,linkTickets} from '@/lib/tickets';
import {registerAssetFault} from '@/lib/assets';import {browserKey,intakeActor,errorResponse,ApiError,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{sameOrigin(req);await intakeActor();const owner=await browserKey();const {sessionId}=z.object({sessionId:z.string()}).parse(await req.json());const[s]=await db.select().from(chatSessions).where(and(eq(chatSessions.id,sessionId),eq(chatSessions.ownerKey,owner)));if(!s)throw new ApiError('Conversation not found',404);if(s.ticketId)return Response.json({ticket:{id:s.ticketId,ticketNumber:s.ticketNumber}});if(!s.draft||s.phase!=='draft')throw new ApiError('Complete and review the draft first.');const draft=await makeDraft({...s.draft,submissionKey:'iris:'+sessionId});const ticket=await createTicketFromDraft(draft,'iris','chat');
// The fault now belongs on the asset's history, and the bike is off the floor if the
// reporter took it out of rotation. Done here rather than mid-conversation so a discarded
// draft cannot leave a rideable bike marked as broken.
const collected=(s.collected||{}) as Record<string,unknown>;
const assetId=Number(collected.assetId||0);
if(assetId>0)await registerAssetFault({assetId,takenOutOfRotation:String(collected.cycleReporterAction||'')==='Took bike out of rotation',note:`Logged on ${ticket.ticketNumber}`});
// Logged separately from a possible duplicate: keep the two readable together.
const relatedId=Number(collected._relatedTicketId||0);
if(relatedId>0)await linkTickets(ticket.id,relatedId);await db.update(chatSessions).set({phase:'complete',ticketId:ticket.id,ticketNumber:ticket.ticketNumber,updatedAt:new Date()}).where(eq(chatSessions.id,s.id));after(()=>deliverPending());return Response.json({ticket:{id:ticket.id,ticketNumber:ticket.ticketNumber}});}catch(e){return errorResponse(e);}}

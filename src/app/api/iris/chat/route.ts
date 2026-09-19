import {z} from 'zod';import {and,eq,desc,sql} from 'drizzle-orm';
import {db} from '@/db';import {chatSessions,chatMessages} from '@/db/schema';
import {browserKey,errorResponse,ApiError,intakeActor,sameOrigin,requireIntegrationAccess} from '@/lib/auth';import {enforceRateLimit} from '@/lib/rate-limit';
import {irisWelcome,runIris} from '@/lib/iris';import {detailMomence,populateMember,populateSession,momenceConfigured} from '@/lib/momence';
import type {IrisMessage,IrisTurn} from '@/lib/iris-contract';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await intakeActor();const owner=await browserKey();const id=new URL(req.url).searchParams.get('sessionId');if(!id)throw new ApiError('Session ID required');const[s]=await db.select().from(chatSessions).where(and(eq(chatSessions.id,id),eq(chatSessions.ownerKey,owner)));if(!s)throw new ApiError('Conversation not found',404);const messages=await db.select().from(chatMessages).where(eq(chatMessages.sessionId,id)).orderBy(chatMessages.createdAt);const latest=[...messages].reverse().find(m=>m.role==='assistant'&&m.meta);const lastMsg=[...messages].reverse().find(m=>m.role==='assistant');const meta=(latest?.meta||{})as Record<string,unknown>;return Response.json({sessionId:s.id,message:String(meta.message||lastMsg?.content||'Resumed conversation.'),phase:s.ticketId?'complete':(s.phase||meta.phase||'collect'),fieldKey:meta.fieldKey||undefined,lookup:meta.lookup||undefined,lookupFilters:meta.lookupFilters||undefined,options:meta.options||[],collected:(s.collected as Record<string,unknown>)||{},draft:s.draft||meta.draft||undefined,progress:meta.progress||{done:4,total:8},engine:meta.engine||'openai',notice:meta.notice,history:messages.map(m=>({role:m.role,content:m.content})),...(s.ticketId?{ticket:{id:s.ticketId,ticketNumber:s.ticketNumber||`TICK-${s.ticketId}`}}:{})});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);await intakeActor();await enforceRateLimit('irisChat');const owner=await browserKey();const b=z.object({sessionId:z.string().optional(),message:z.string().max(20000).optional(),preset:z.object({category:z.string().optional(),subcategory:z.string().optional()}).optional(),selection:z.object({module:z.enum(['members','sessions']),id:z.string().regex(/^\d+$/)}).optional(),patch:z.record(z.string(),z.unknown()).optional(),attachmentIds:z.array(z.string()).optional(),stream:z.boolean().optional()}).parse(await req.json());
if(!b.sessionId){const id=crypto.randomUUID();const turn=await irisWelcome(id,b.preset);const expiresAt=new Date();expiresAt.setDate(expiresAt.getDate()+7);await db.insert(chatSessions).values({id,ownerKey:owner,phase:turn.phase,collected:turn.collected,missing:[],expiresAt});await db.insert(chatMessages).values({sessionId:id,role:'assistant',content:turn.message,meta:turn as unknown as Record<string,unknown>});return Response.json(turn);}
const[s]=await db.select().from(chatSessions).where(and(eq(chatSessions.id,b.sessionId),eq(chatSessions.ownerKey,owner)));if(!s)throw new ApiError('Conversation not found. Start a new conversation.',404);if(s.ticketId)throw new ApiError('This conversation already created a ticket. Start a new one.',409);
let c={...s.collected};let selectionName:string|undefined;if(b.selection){const detail=await detailMomence(b.selection.module,b.selection.id);c={...c,...(b.selection.module==='members'?populateMember(detail):populateSession(detail))};selectionName=detail.item.name;}
const messages=await db.select().from(chatMessages).where(eq(chatMessages.sessionId,s.id)).orderBy(desc(chatMessages.createdAt)).limit(18);const history=messages.reverse().map(m=>({role:m.role as IrisMessage['role'],content:m.content}));
const allowedPatch=['description','title','category','subcategory','studio','memberName','memberEmail','memberPhone','incidentAt','classFormat','trainer','membership','impact','requestedResolution','preferredContact','kind','sentiment','area','isClassImpacted','isImmediateDanger'];const patch=b.patch?Object.fromEntries(Object.entries(b.patch).filter(([k,v])=>allowedPatch.includes(k)&&typeof v==='string')):undefined;
const answer=async(onAckDelta?:(text:string)=>void)=>{
  const turn=await runIris({sessionId:s.id,collected:c,message:b.message,fieldKey:typeof c._fieldKey==='string'?c._fieldKey:s.phase==='welcome'?'description':undefined,history,selectionApplied:Boolean(b.selection),patch,onAckDelta});
  await db.transaction(async tx=>{const[updated]=await tx.update(chatSessions).set({collected:turn.collected,phase:turn.phase,draft:turn.draft as unknown as Record<string,unknown>||null,version:sql`${chatSessions.version}+1`,updatedAt:new Date()}).where(and(eq(chatSessions.id,s.id),eq(chatSessions.version,s.version))).returning({id:chatSessions.id});if(!updated)throw new ApiError('Another answer was received. Refresh and try again.',409);if(b.message||selectionName||(b.attachmentIds&&b.attachmentIds.length))await tx.insert(chatMessages).values({sessionId:s.id,role:'user',content:selectionName||b.message||'(Attachment sent)',attachmentIds:b.attachmentIds||[]});await tx.insert(chatMessages).values({sessionId:s.id,role:'assistant',content:turn.message,meta:turn as unknown as Record<string,unknown>});});
  return turn;
};
if(!b.stream)return Response.json(await answer());

// Streamed reply. The model writes its acknowledgement first, so those characters go out
// while it is still deciding the field, the question and the options. The turn itself — the
// part the UI renders chips and state from — is sent once, whole, at the end.
const encoder=new TextEncoder();
const body=new ReadableStream<Uint8Array>({
  async start(controller){
    const send=(event:string,data:unknown)=>{
      try{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{/* client went away */}
    };
    try{
      const turn=await answer(text=>send('ack',{text}));
      send('turn',turn);
    }catch(e){
      // A stream has already sent its 200, so a failure has to travel as an event.
      send('error',{error:e instanceof ApiError?e.message:e instanceof Error?e.message:'Request failed'});
    }finally{
      try{controller.close();}catch{}
    }
  },
});
return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'}});
}catch(e){return errorResponse(e);}}

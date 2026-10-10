import {NextRequest,after} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {deliverPending} from '@/lib/integrations';
import {makeDraft,createTicketFromDraft,listTicketsPage,searchTickets,maskMemberName,DEFAULT_LIST_LIMIT} from '@/lib/tickets';
import {getConfig} from '@/lib/config';
import {ensureSeeded} from '@/lib/seed';
import {errorResponse,intakeActor,requireWorkspace,sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';
import {signalChanged} from '@/lib/realtime';
import {runDueWorkThrottled} from '@/lib/sweeps';
export const dynamic='force-dynamic';
/** `GET /api/tickets` — `{tickets, nextCursor}`, newest first. `?limit=` (default 500, max 2000)
 *  and `?cursor=` (the previous page's `nextCursor`) page through the list; `nextCursor` is
 *  null on the last page. `?q=` is the link-ticket picker's search: up to 20 rows matching a
 *  ticket number, id or title, with `nextCursor` always null. */
export async function GET(req:NextRequest){try{
  const[user,cfg]=await Promise.all([requireWorkspace(),getConfig(),ensureSeeded()]);
  const params=req.nextUrl.searchParams;const q=params.get('q');
  // Escalation, the SLA warnings, the outbox drain and the morning digest ride on this
  // request — claimed and throttled in lib/sweeps, and run after the response. The Vercel
  // Hobby plan gives two cron jobs a day, which is the backstop rather than the mechanism.
  if(q===null)after(()=>runDueWorkThrottled().catch(()=>{}));
  const page=q!==null?{tickets:await searchTickets(user,q,Number(params.get('limit'))||20),nextCursor:null}:await listTicketsPage(user,{limit:Number(params.get('limit'))||DEFAULT_LIST_LIMIT,cursor:params.get('cursor')});
  // Masking hides a member's full name from everyone below administrator in list payloads.
  // The ticket itself still carries the real record for whoever can open it.
  const rows=cfg.maskMemberContact&&user.role!=='admin'?page.tickets.map(t=>({...t,memberName:maskMemberName(t.memberName)})):page.tickets;
  return Response.json({tickets:rows,nextCursor:page.nextCursor});
}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{sameOrigin(req);const actor=await intakeActor();await enforceRateLimit('ticketCreate');await ensureSeeded();const body=await req.json();
// Untrusted: the public schema refuses `history`/`system` sources, reserved customFields are
// stripped and a supplied priority can only raise the inferred one — see makeDraft.
const draft=await makeDraft(body);if(req.nextUrl.searchParams.get('preview')==='true')return Response.json({draft});// The form-based intake files through here too; `channel` only labels the row — routing,
// SLA and idempotency are identical whichever surface filed it.
const channel=req.nextUrl.searchParams.get('channel');let ticket=await createTicketFromDraft(draft,draft.source,channel==='form'||channel==='chat'?channel:'workspace');if(actor.id){const[owned]=await db.update(tickets).set({createdByUserId:actor.id,createdByName:actor.name}).where(eq(tickets.id,ticket.id)).returning();ticket=owned||ticket;}after(()=>deliverPending());after(()=>signalChanged('tickets'));return Response.json({ticket},{status:201});}catch(e){return errorResponse(e);}}

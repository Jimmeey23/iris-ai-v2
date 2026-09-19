import {NextRequest,after} from 'next/server';
import {deliverPending} from '@/lib/integrations';
import {makeDraft,createTicketFromDraft,listTickets,applyEscalations,maskMemberName} from '@/lib/tickets';
import {getConfig} from '@/lib/config';
import {ensureSeeded} from '@/lib/seed';
import {errorResponse,intakeActor,requireWorkspace,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(){try{
  const[user]=await Promise.all([requireWorkspace(),ensureSeeded()]);
  // Escalation has no scheduler to run it, so it rides on the list request — guarded so it
  // does no work more than once every few minutes. See applyEscalations.
  after(()=>applyEscalations().catch(()=>{}));
  const cfg=await getConfig();
  const rows=await listTickets();
  // Masking hides a member's full name from everyone below administrator in list payloads.
  // The ticket itself still carries the real record for whoever can open it.
  if(cfg.maskMemberContact&&user.role!=='admin'){
    return Response.json({tickets:rows.map(t=>({...t,memberName:maskMemberName(t.memberName)}))});
  }
  return Response.json({tickets:rows});
}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{sameOrigin(req);await intakeActor();await ensureSeeded();const body=await req.json();const draft=await makeDraft(body);if(req.nextUrl.searchParams.get('preview')==='true')return Response.json({draft});const ticket=await createTicketFromDraft(draft);after(()=>deliverPending());return Response.json({ticket},{status:201});}catch(e){return errorResponse(e);}}

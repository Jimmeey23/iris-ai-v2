import {NextRequest,after} from 'next/server';
import {deliverPending} from '@/lib/integrations';
import {makeDraft,createTicketFromDraft,listTickets} from '@/lib/tickets';
import {ensureSeeded} from '@/lib/seed';
import {errorResponse,requireAgent,requireWorkspace,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(){try{await requireWorkspace();await ensureSeeded();return Response.json({tickets:await listTickets()});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{sameOrigin(req);await requireAgent();await ensureSeeded();const body=await req.json();const draft=await makeDraft(body);if(req.nextUrl.searchParams.get('preview')==='true')return Response.json({draft});const ticket=await createTicketFromDraft(draft);after(()=>deliverPending());return Response.json({ticket},{status:201});}catch(e){return errorResponse(e);}}

import {NextRequest} from 'next/server';
import {z} from 'zod';
import catalogue from '@/lib/momence-catalogue.json';
import {listMomence,detailMomence,momenceConfigured,executeMomence,getAccessToken,momenceLocationFor} from '@/lib/momence';
import {errorResponse,requireIntegrationAccess,requireWorkspace,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{await requireWorkspace();const action=req.nextUrl.searchParams.get('action');const configured=await momenceConfigured();if(action==='status')return Response.json({configured,source:configured?'configured':'demo',tools:catalogue.length});if(action==='catalogue')return Response.json({operations:catalogue});const module=z.enum(['members','sessions','memberships','studios','sales']).parse(req.nextUrl.searchParams.get('module')||'members');const page=z.coerce.number().int().min(0).max(10000).parse(req.nextUrl.searchParams.get('page')||0);const pageSize=z.coerce.number().int().min(1).max(200).parse(req.nextUrl.searchParams.get('pageSize')||24);const id=req.nextUrl.searchParams.get('id');if(id)return Response.json(await detailMomence(module,id,page));const sp=req.nextUrl.searchParams;
// A studio name is resolved to its Momence location id server-side; a studio with no Momence
// location resolves to undefined and the listing stays unfiltered rather than coming back empty.
const locationId=sp.get('locationId')||(momenceLocationFor(sp.get('studio'))?.toString());
const sessionTypes=z.array(z.enum(['private','special-event','special-event-new','retreat','fitness','course','course-class','semester','recital'])).optional().parse(sp.getAll('type').length?sp.getAll('type'):undefined);
return Response.json(await listMomence(module,{query:sp.get('q')||'',page,pageSize,startAfter:sp.get('startAfter')||undefined,startBefore:sp.get('startBefore')||undefined,locationId,sessionTypes,upcoming:sp.get('upcoming')==='true'}));}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);const user=await requireIntegrationAccess(true);const b=z.object({operationId:z.string(),params:z.record(z.string(),z.string()).default({}),body:z.unknown().optional(),confirmed:z.boolean().default(false)}).parse(await req.json());if(b.operationId==='authenticate'){await getAccessToken(true);return Response.json({ok:true,message:'Authenticated successfully. Token is held on the server.'});}const result=await executeMomence(b.operationId,b.params,b.body,b.confirmed,user);return Response.json({ok:true,result});}catch(e){return errorResponse(e);}}

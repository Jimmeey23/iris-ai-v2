import {z} from 'zod';
import {backfillFillout,listFilloutForms,configuredFilloutForms} from '@/lib/fillout';
import {errorResponse,requireAdmin,requireWorkspace,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export const maxDuration=300;

/** Lists the forms on the connected account plus the ones configured for import. */
export async function GET(){try{
  await requireWorkspace();
  const [forms,configured]=await Promise.all([listFilloutForms().catch(()=>[]),configuredFilloutForms()]);
  return Response.json({forms,configured});
}catch(e){return errorResponse(e);}}

/** Pulls historic submissions into tickets. Writes live records, so administrators only. */
export async function POST(req:Request){try{
  sameOrigin(req);
  await requireAdmin();
  const body=await req.json().catch(()=>({}));
  const b=z.object({formIds:z.array(z.string().min(1)).max(20).optional(),templateId:z.string().optional()}).parse(body);
  return Response.json(await backfillFillout(b.formIds,b.templateId));
}catch(e){return errorResponse(e);}}

import {desc} from 'drizzle-orm';
import {db} from '@/db';import {importRuns} from '@/db/schema';import {importHistory} from '@/lib/history';import {requireAdmin,errorResponse,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(){try{await requireAdmin();return Response.json({runs:await db.select().from(importRuns).orderBy(desc(importRuns.createdAt)).limit(20)});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);await requireAdmin();if(Number(req.headers.get('content-length')||0)>20000000)return Response.json({error:'File exceeds 20 MB'},{status:413});const b=await req.json();return Response.json(await importHistory(b.records,b.filename||'data/historic-tickets.json'));}catch(e){return errorResponse(e);}}

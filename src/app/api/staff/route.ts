import {db} from '@/db';import {staff,departments} from '@/db/schema';import {ensureSeeded} from '@/lib/seed';import {requireWorkspace,errorResponse} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(){try{await requireWorkspace();await ensureSeeded();return Response.json({staff:await db.select().from(staff),departments:await db.select().from(departments)});}catch(e){return errorResponse(e);}}

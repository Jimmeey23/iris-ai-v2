import {db} from '@/db';import {staff,departments} from '@/db/schema';import {ensureSeeded} from '@/lib/seed';import {optionalUser,errorResponse} from '@/lib/auth';
export const dynamic='force-dynamic';
/**
 * The staff directory.
 *
 * Signed-in users get the full record. Anonymous callers get only what the two surfaces
 * that legitimately run signed-out actually need — the first-run setup dialog, which asks
 * the founding admin which staff member they are, and intake routing, which shows the name
 * a ticket will land with. Everything else on the row (email, phone, manager, external id)
 * is internal directory data and was previously served to anyone who asked.
 */
export async function GET(){try{
  await ensureSeeded();
  const user=await optionalUser();
  if(user)return Response.json({staff:await db.select().from(staff),departments:await db.select().from(departments)});
  const roster=await db.select({id:staff.id,name:staff.name,department:staff.department,isActive:staff.isActive}).from(staff);
  return Response.json({staff:roster,departments:await db.select({id:departments.id,name:departments.name,active:departments.active}).from(departments),redacted:true});
}catch(e){return errorResponse(e);}}

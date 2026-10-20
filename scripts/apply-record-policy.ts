/** User-requested record-only closure and Shifa -> Saachi reporting-line correction.
 * Dry-run by default. No notifications, emails or webhooks. Prior values saved transactionally. */
import 'dotenv/config';
import {writeFileSync} from 'node:fs';
import {and,eq,inArray,isNull,or,sql} from 'drizzle-orm';
import {db,pool} from '../src/db';
import {tickets,staff,userNotifications,ticketActivities,auditLogs,appSettings} from '../src/db/schema';
import {isHostedClassTicket} from '../src/lib/hosted-feedback';
const key='record-policy-20261020';
async function main(){
 const apply=process.argv.includes('--apply');
 const result=await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  const[done]=await tx.select().from(appSettings).where(eq(appSettings.key,key));
  if(done)return {mode:'already-applied',receipt:key};
  const people=await tx.select().from(staff).where(inArray(staff.id,[24,19])).for('update');
  const shifa=people.find(p=>p.id===24&&/^Shifa Ali$/i.test(p.name)&&p.isActive);
  const saachi=people.find(p=>p.id===19&&/^Saachi Shetty$/i.test(p.name)&&p.isActive);
  if(!shifa||!saachi||saachi.department!=='Operations')throw new Error('Directory identities have changed. Review before applying.');
  const candidates=await tx.select().from(tickets).where(or(eq(tickets.resolutionRequired,false),sql`${tickets.subcategory} ~* 'hosted class'`)).for('update');
  const rows=candidates.filter(t=>!t.resolutionRequired||isHostedClassTicket(t.category,t.subcategory));
  const changed=rows.filter(t=>t.status!=='closed'||t.resolutionRequired||t.slaDueAt||t.slaHours!==0||t.isEscalated);
  const ids=rows.map(t=>t.id);
  const notifications=ids.length?await tx.select({id:userNotifications.id}).from(userNotifications).where(and(inArray(userNotifications.ticketId,ids),isNull(userNotifications.readAt))).for('update'):[];
  const now=new Date();
  if(apply){
   if(changed.length){
    await tx.update(tickets).set({status:'closed',resolutionRequired:false,slaHours:0,slaDueAt:null,isEscalated:false,closedAt:sql`coalesce(${tickets.closedAt},${now})`,version:sql`${tickets.version}+1`,updatedAt:now}).where(inArray(tickets.id,changed.map(t=>t.id)));
    await tx.insert(ticketActivities).values(changed.map(t=>({ticketId:t.id,actorName:'IRIS Maintenance',action:'record.auto_closed',detail:'Closed automatically for reference under the record-only policy. No resolution work or repair is implied. Original report retained.'})));
   }
   if(notifications.length)await tx.update(userNotifications).set({readAt:now}).where(inArray(userNotifications.id,notifications.map(n=>n.id)));
   await tx.update(staff).set({manager:saachi.name}).where(eq(staff.id,shifa.id));
   const snapshot={at:now.toISOString(),reason:'User requested automatic record-only closure and Shifa → Saachi → Mitali escalation.',staff:{id:shifa.id,previousManager:shifa.manager,newManager:saachi.name},tickets:changed.map(t=>({id:t.id,ticketNumber:t.ticketNumber,previous:{status:t.status,resolutionRequired:t.resolutionRequired,slaHours:t.slaHours,slaDueAt:t.slaDueAt,closedAt:t.closedAt,isEscalated:t.isEscalated},correctedVersion:t.version+1})),notificationIds:notifications.map(n=>n.id)};
   await tx.insert(appSettings).values({key,value:snapshot});
   await tx.insert(auditLogs).values({actorName:'IRIS Maintenance',action:'record_policy.applied',entity:'tickets',detail:{receipt:key,ticketCount:changed.length,notificationsRead:notifications.length,reportingLine:'Shifa Ali → Saachi Shetty'}});
  }
  return {mode:apply?'applied':'dry-run',receipt:key,matchedRecords:rows.length,ticketsToClose:changed.length,hostedClasses:changed.filter(t=>isHostedClassTicket(t.category,t.subcategory)).map(t=>t.ticketNumber),notificationsRead:notifications.length,reportingLine:{from:shifa.manager,to:saachi.name}};
 });
 const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(output)writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Correction failed');process.exitCode=1;}).finally(()=>pool.end());

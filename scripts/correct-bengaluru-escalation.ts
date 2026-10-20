/** Repair only the confirmed skipped escalation level on the open Bengaluru ticket. */
import 'dotenv/config';
import {writeFileSync} from 'node:fs';
import {and,eq,sql} from 'drizzle-orm';
import {db,pool} from '../src/db';
import {tickets,staff,ticketActivities,appSettings,auditLogs} from '../src/db/schema';
import {cityOf} from '../src/lib/routing';
async function main(){
 const apply=process.argv.includes('--apply'),key='bengaluru-escalation-20261020';
 const result=await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  const[done]=await tx.select().from(appSettings).where(eq(appSettings.key,key));if(done)return{mode:'already-applied'};
  const[t]=await tx.select().from(tickets).where(eq(tickets.ticketNumber,'P57-02050')).for('update');
  const[target]=await tx.select().from(staff).where(and(eq(staff.id,19),eq(staff.isActive,true)));
  if(!t||!target||target.name!=='Saachi Shetty'||cityOf(t.studio||'')!=='bengaluru'||t.departmentId!=='operations'||t.assignedStaffId!==11||!t.isEscalated||['resolved','closed','recorded'].includes(t.status))throw new Error('Ticket no longer matches the confirmed escalation error. No change applied.');
  const events=await tx.select({detail:ticketActivities.detail}).from(ticketActivities).where(eq(ticketActivities.ticketId,t.id));
  if(!events.some(e=>/escalated from Shifa/i.test(e.detail||'')))throw new Error('No original Shifa escalation found. Review before changing ownership.');
  if(apply){
   const now=new Date();
   await tx.update(tickets).set({assignedStaffId:target.id,assignedStaffName:target.name,assignedStaffEmail:target.email,escalatedToStaffId:target.id,escalatedToName:target.name,escalatedAt:now,updatedAt:now,version:t.version+1}).where(and(eq(tickets.id,t.id),eq(tickets.version,t.version)));
   await tx.insert(ticketActivities).values({ticketId:t.id,actorName:'IRIS Maintenance',action:'escalation.corrected',detail:'Corrected the skipped escalation level: Shifa Ali → Saachi Shetty → Mitali Kumar. Reassigned to Saachi; original escalation history retained.'});
   await tx.insert(appSettings).values({key,value:{ticketId:t.id,correctedVersion:t.version+1,previous:{assignedStaffId:t.assignedStaffId,assignedStaffName:t.assignedStaffName,assignedStaffEmail:t.assignedStaffEmail,escalatedToStaffId:t.escalatedToStaffId,escalatedToName:t.escalatedToName,escalatedAt:t.escalatedAt}}});
   await tx.insert(auditLogs).values({actorName:'IRIS Maintenance',action:'escalation.corrected',entity:t.ticketNumber,detail:{receipt:key,from:t.assignedStaffId,to:target.id}});
  }
  return{mode:apply?'applied':'dry-run',ticketNumber:t.ticketNumber,from:t.assignedStaffName,to:target.name,receipt:key};
 });
 const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(output)writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Correction failed');process.exitCode=1;}).finally(()=>pool.end());

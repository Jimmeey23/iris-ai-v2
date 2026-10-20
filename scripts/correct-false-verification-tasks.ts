/** Narrow, reversible correction for the two confirmed false children of P57-02049. */
import 'dotenv/config';
import {writeFileSync} from 'node:fs';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {db,pool} from '../src/db';
import {tickets,ticketActivities,auditLogs} from '../src/db/schema';
import {repairVerificationKind} from '../src/lib/equipment-routing';

const targets=['P57-02051','P57-02052'];
const reason='Corrected false automation: parent P57-02049 reports session punctuality, not an equipment fault. No repair verification was required. Original report and links retained.';
const key='auditCorrection20261020';
async function main(){
  const apply=process.argv.includes('--apply');
  const rollback=process.argv.includes('--rollback');
  const result=await db.transaction(async tx=>{
    const[parent]=await tx.select().from(tickets).where(eq(tickets.ticketNumber,'P57-02049'));
    if(!parent||repairVerificationKind(parent)||parent.category!=='Trainer Feedback'||!/class started/i.test(parent.description+' '+parent.title))throw new Error('The parent no longer matches the audited punctuality report. No correction applied.');
    const rows=await tx.select().from(tickets).where(inArray(tickets.ticketNumber,targets)).for('update');
    if(rows.length!==2)throw new Error('Both audited verification tasks must exist. No correction applied.');
    const outcomes=[];
    for(const row of rows){
      if(row.customFields.autoFollowUp!==true||Number(row.customFields.parentTicketId)!==parent.id||row.source!=='system')throw new Error('Task no longer matches the audited automation. No correction applied.');
      const correction=row.customFields[key] as {previous:Record<string,unknown>;correctedVersion:number}|undefined;
      if(correction&&!rollback){outcomes.push({ticketNumber:row.ticketNumber,action:'already-corrected'});continue;}
      if(rollback){
        if(!correction||row.version!==correction.correctedVersion)throw new Error('A corrected task was changed afterward. Review before rollback.');
        const cf={...row.customFields};delete cf[key];
        const previous=correction.previous;
        if(apply){
          await tx.update(tickets).set({status:String(previous.status),resolutionRequired:Boolean(previous.resolutionRequired),slaHours:Number(previous.slaHours),slaDueAt:previous.slaDueAt?new Date(String(previous.slaDueAt)):null,resolvedAt:previous.resolvedAt?new Date(String(previous.resolvedAt)):null,closedAt:previous.closedAt?new Date(String(previous.closedAt)):null,isEscalated:Boolean(previous.isEscalated),customFields:cf,version:sql`${tickets.version}+1`,updatedAt:new Date()}).where(and(eq(tickets.id,row.id),eq(tickets.version,row.version)));
          await tx.insert(ticketActivities).values({ticketId:row.id,actorName:'IRIS Maintenance',action:'automation.correction_reverted',detail:'Reverted the 20 October audit correction using its saved previous state.'});
        }
        outcomes.push({ticketNumber:row.ticketNumber,action:apply?'reverted':'would-revert'});continue;
      }
      if(['resolved','closed','recorded'].includes(row.status))throw new Error('One audited task was already completed. Review its history before correcting.');
      const previous={status:row.status,resolutionRequired:row.resolutionRequired,slaHours:row.slaHours,slaDueAt:row.slaDueAt?.toISOString()||null,resolvedAt:row.resolvedAt?.toISOString()||null,closedAt:row.closedAt?.toISOString()||null,isEscalated:row.isEscalated};
      if(apply){
        await tx.update(tickets).set({status:'closed',resolutionRequired:false,slaHours:0,slaDueAt:null,resolvedAt:null,closedAt:new Date(),isEscalated:false,customFields:{...row.customFields,[key]:{reason,previous,correctedVersion:row.version+1}},version:sql`${tickets.version}+1`,updatedAt:new Date()}).where(and(eq(tickets.id,row.id),eq(tickets.version,row.version)));
        await tx.insert(ticketActivities).values({ticketId:row.id,actorName:'IRIS Maintenance',action:'automation.corrected',detail:reason});
      }
      outcomes.push({ticketNumber:row.ticketNumber,action:apply?'closed-false-task':'would-close-false-task',previous});
    }
    if(apply)await tx.insert(auditLogs).values({actorName:'IRIS Maintenance',action:rollback?'audit.correction_reverted':'audit.false_verification_corrected',entity:'tickets',detail:{targets,reason,outcomes}});
    return {mode:apply?'applied':'dry-run',rollback,outcomes};
  });
  const out=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
  if(out)writeFileSync(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Correction failed');process.exitCode=1;}).finally(()=>pool.end());

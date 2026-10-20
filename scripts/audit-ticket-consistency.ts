/** Read-only review of historical inconsistencies. No apply mode and no writes to the database. */
import 'dotenv/config';
import {writeFileSync} from 'node:fs';
import {desc} from 'drizzle-orm';
import {db,pool} from '../src/db';
import {tickets} from '../src/db/schema';
import {repairVerificationKind} from '../src/lib/equipment-routing';

async function main(){
  if(process.argv.includes('--apply'))throw new Error('This command is read-only. Historical corrections require a reviewed change list.');
  const rows=await db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,category:tickets.category,subcategory:tickets.subcategory,title:tickets.title,description:tickets.description,kind:tickets.kind,status:tickets.status,customFields:tickets.customFields,momenceMemberId:tickets.momenceMemberId,momenceSessionId:tickets.momenceSessionId,assignedStaffId:tickets.assignedStaffId,resolutionRequired:tickets.resolutionRequired}).from(tickets).orderBy(desc(tickets.id)).limit(10000);
  const byId=new Map(rows.map(t=>[t.id,t]));
  const findings:{ticketNumber:string;code:string;recommendation:string;parentTicketNumber?:string}[]=[];
  for(const t of rows){
    const cf=t.customFields;
    if(cf.autoFollowUp){const parent=byId.get(Number(cf.parentTicketId));if(parent&&!repairVerificationKind(parent))findings.push({ticketNumber:t.ticketNumber,parentTicketNumber:parent.ticketNumber,code:'verification_without_repair',recommendation:'Review and close the incorrectly generated verification task with an explanatory activity. Preserve the original report.'});}
    if(!t.resolutionRequired&&t.kind==='issue')findings.push({ticketNumber:t.ticketNumber,code:'review_entry_type',recommendation:'Review whether this record represents feedback, a compliment or an issue intentionally saved for reference.'});
    const session=cf.sessionContext as {id?:string}|undefined;
    if(session?.id&&String(session.id)!==String(t.momenceSessionId||''))findings.push({ticketNumber:t.ticketNumber,code:'session_identity_mismatch',recommendation:'Confirm the intended session and remove only incorrect linked context.'});
    if(t.resolutionRequired&&!t.assignedStaffId&&!['resolved','closed','recorded'].includes(t.status))findings.push({ticketNumber:t.ticketNumber,code:'unassigned_action',recommendation:'Review department coverage and assign an eligible active owner.'});
  }
  const report={mode:'read-only',generatedAt:new Date().toISOString(),scanned:rows.length,truncated:rows.length===10000,findings};
  const destination=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
  if(destination)writeFileSync(destination,JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode:report.mode,scanned:report.scanned,findings:findings.length,counts:Object.fromEntries([...new Set(findings.map(f=>f.code))].map(code=>[code,findings.filter(f=>f.code===code).length])),output:destination||null}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Audit failed');process.exitCode=1;}).finally(()=>pool.end());

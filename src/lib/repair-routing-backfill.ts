import {eq, sql} from 'drizzle-orm';
import {db} from '@/db';
import {ticketActivities,tickets} from '@/db/schema';
import {getConfig} from './config';
import {equipmentRepairRoute} from './equipment-routing';
import {resolveRouting} from './tickets';

export type RepairRoutingBackfillResult={
  scanned:number;
  changed:number;
  samples:{ticketNumber:string;from:string;to:string}[];
};

/** Correct already-imported history without changing its closed/record-only SLA state. */
export async function backfillHistoricRepairRouting(dryRun=true):Promise<RepairRoutingBackfillResult>{
  const rows=await db.select().from(tickets).where(eq(tickets.source,'history'));
  const cfg=await getConfig();
  const result:RepairRoutingBackfillResult={scanned:rows.length,changed:0,samples:[]};
  for(const row of rows){
    const route=equipmentRepairRoute(row);
    if(!route||row.category===route.category&&row.subcategory===route.subcategory)continue;
    const routing=await resolveRouting(cfg,route.category,row.studio||'Not studio specific',route.subcategory);
    result.changed++;
    if(result.samples.length<25)result.samples.push({ticketNumber:row.ticketNumber,from:`${row.category} / ${row.subcategory}`,to:`${route.category} / ${route.subcategory}`});
    if(dryRun)continue;
    const custom=(row.customFields||{}) as Record<string,unknown>;
    await db.transaction(async tx=>{
      await tx.update(tickets).set({
        category:route.category,
        subcategory:route.subcategory,
        departmentId:routing.departmentId,
        departmentName:routing.dept.name,
        assignedStaffId:routing.owner.id,
        assignedStaffName:routing.owner.name,
        assignedStaffEmail:routing.owner.email,
        customFields:{...custom,_originalRouting:custom._originalRouting??{category:row.category,subcategory:row.subcategory,departmentId:row.departmentId,departmentName:row.departmentName,assignedStaffId:row.assignedStaffId,assignedStaffName:row.assignedStaffName}},
        version:sql`${tickets.version}+1`,
        updatedAt:new Date(),
      }).where(eq(tickets.id,row.id));
      await tx.insert(ticketActivities).values({ticketId:row.id,actorName:'IRIS',action:'routing corrected',detail:'Equipment or studio-system malfunction moved to Repair and Maintenance.'});
    });
  }
  return result;
}

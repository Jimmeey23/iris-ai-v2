import {NextRequest} from 'next/server';
import {desc} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {requireWorkspace,errorResponse,ApiError} from '@/lib/auth';
import {buildReportCatalogue,type TicketLike} from '@/lib/reports';
export const dynamic='force-dynamic';

function toLike(t:typeof tickets.$inferSelect):TicketLike{return{id:t.id,ticketNumber:t.ticketNumber,title:t.title,summary:t.summary,description:t.description,category:t.category,subcategory:t.subcategory,status:t.status,priority:t.priority,severity:t.severity,sentiment:t.sentiment,kind:t.kind,studio:t.studio,classFormat:t.classFormat,trainer:t.trainer,membership:t.membership,incidentAt:t.incidentAt,memberName:t.memberName,memberEmail:t.memberEmail,assignedStaffId:t.assignedStaffId,assignedStaffName:t.assignedStaffName,departmentId:t.departmentId,departmentName:t.departmentName,slaHours:t.slaHours,slaDueAt:t.slaDueAt?t.slaDueAt.toISOString():null,resolutionRequired:t.resolutionRequired,source:t.source,tags:t.tags,isEscalated:t.isEscalated,resolvedAt:t.resolvedAt?t.resolvedAt.toISOString():null,closedAt:t.closedAt?t.closedAt.toISOString():null,createdAt:t.createdAt.toISOString(),updatedAt:t.updatedAt.toISOString()};}

export async function GET(req:NextRequest){
  try{
    await requireWorkspace();
    const p=req.nextUrl.searchParams;
    const catalogue=buildReportCatalogue();
    if(p.get('list')==='true')return Response.json({reports:catalogue.map(r=>({id:r.id,name:r.name,description:r.description,group:r.group,columns:r.columns}))});
    const type=p.get('type');
    const def=catalogue.find(r=>r.id===type);
    if(!def)throw new ApiError('Unknown report type',404);
    const search=(p.get('search')||'').toLowerCase();
    const studio=p.get('studio')||'';
    const priority=p.get('priority')||'';
    const status=p.get('status')||'';
    const from=p.get('from')?new Date(p.get('from')+'T00:00:00+05:30').getTime():0;
    const to=p.get('to')?new Date(p.get('to')+'T23:59:59+05:30').getTime():Date.now()+86400000;
    const page=Math.max(0,Number(p.get('page'))||0);
    const pageSize=Math.min(200,Math.max(5,Number(p.get('pageSize'))||25));
    const all=(await db.select().from(tickets).orderBy(desc(tickets.createdAt))).map(toLike);
    let rows=all.filter(def.filter).filter(t=>{
      const created=new Date(t.createdAt).getTime();
      if(created<from||created>to)return false;
      if(studio&&t.studio!==studio)return false;
      if(priority&&t.priority!==priority)return false;
      if(status&&t.status!==status)return false;
      if(search&&!(t.title+' '+t.ticketNumber+' '+t.memberName+' '+t.subcategory).toLowerCase().includes(search))return false;
      return true;
    });
    if(def.sort)rows=rows.sort(def.sort);
    const total=rows.length;
    const pageRows=rows.slice(page*pageSize,(page+1)*pageSize).map(def.row);
    const metrics={
      total,
      open:rows.filter(t=>!['resolved','closed','recorded'].includes(t.status)).length,
      resolved:rows.filter(t=>['resolved','closed'].includes(t.status)).length,
      critical:rows.filter(t=>t.priority==='critical').length,
      avgResolutionHours:(()=>{const done=rows.filter(t=>t.resolvedAt);if(!done.length)return null;const total=done.reduce((n,t)=>n+Math.max(0,(new Date(t.resolvedAt as string).getTime()-new Date(t.createdAt).getTime())/3600000),0);return Math.round(total/done.length*10)/10;})(),
    };
    return Response.json({id:def.id,name:def.name,description:def.description,group:def.group,columns:def.columns,rows:pageRows,total,page,pageSize,hasMore:(page+1)*pageSize<total,metrics});
  }catch(e){return errorResponse(e);}
}

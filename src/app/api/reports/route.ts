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
    const exportAll=p.get('all')==='true';
    const pageRows=(exportAll?rows:rows.slice(page*pageSize,(page+1)*pageSize)).map(def.row);
    const isOpen=(t:TicketLike)=>!['resolved','closed','recorded'].includes(t.status);
    const isDone=(t:TicketLike)=>['resolved','closed'].includes(t.status);
    const hrs=(a:string,b:string)=>Math.max(0,(new Date(b).getTime()-new Date(a).getTime())/3600000);
    const done=rows.filter(t=>t.resolvedAt);
    const durations=done.map(t=>hrs(t.createdAt,t.resolvedAt as string)).sort((a,b)=>a-b);
    const pct=(q:number)=>durations.length?Math.round(durations[Math.min(durations.length-1,Math.floor(q*durations.length))]*10)/10:null;
    const timed=rows.filter(t=>t.resolutionRequired&&t.slaDueAt);
    const breached=timed.filter(t=>new Date(t.slaDueAt as string).getTime()<(t.resolvedAt?new Date(t.resolvedAt).getTime():Date.now()));
    const group=(key:keyof TicketLike)=>{const r:Record<string,number>={};for(const t of rows){const v=String(t[key]??'Unassigned')||'Unassigned';r[v]=(r[v]||0)+1;}return Object.fromEntries(Object.entries(r).sort((a,b)=>b[1]-a[1]));};
    const days=14;const dayKey=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(d);
    const trend=Array.from({length:days},(_,i)=>{const d=new Date(Date.now()-(days-1-i)*86400000);const k=dayKey(d);return{date:k,label:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'}).format(d),created:rows.filter(t=>dayKey(new Date(t.createdAt))===k).length,resolved:rows.filter(t=>t.resolvedAt&&dayKey(new Date(t.resolvedAt))===k).length};});
    const owners=Object.entries(group('assignedStaffName')).map(([name,count])=>{const ts=rows.filter(t=>(t.assignedStaffName||'Unassigned')===name);return{name,total:count,open:ts.filter(isOpen).length,resolved:ts.filter(isDone).length,overdue:ts.filter(t=>isOpen(t)&&t.slaDueAt&&new Date(t.slaDueAt).getTime()<Date.now()).length};});
    const oldestOpen=rows.filter(isOpen).sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())[0];
    const metrics={
      total,open:rows.filter(isOpen).length,resolved:rows.filter(isDone).length,recorded:rows.filter(t=>t.status==='recorded').length,
      critical:rows.filter(t=>t.priority==='critical').length,high:rows.filter(t=>t.priority==='high').length,escalated:rows.filter(t=>t.isEscalated).length,
      avgResolutionHours:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length*10)/10:null,
      medianResolutionHours:pct(.5),p90ResolutionHours:pct(.9),
      slaCompliance:timed.length?Math.round((timed.length-breached.length)/timed.length*100):null,slaBreached:breached.length,
      oldestOpenAgeHours:oldestOpen?Math.round(hrs(oldestOpen.createdAt,new Date().toISOString())):null,
      last7:rows.filter(t=>hrs(t.createdAt,new Date().toISOString())<=168).length,prev7:rows.filter(t=>{const h=hrs(t.createdAt,new Date().toISOString());return h>168&&h<=336;}).length,
      resolutionRate:total?Math.round(rows.filter(isDone).length/total*100):0,
    };
    const breakdowns={byStatus:group('status'),byPriority:group('priority'),byStudio:group('studio'),byCategory:group('category'),bySubcategory:group('subcategory'),byDepartment:group('departmentName'),bySource:group('source'),bySentiment:group('sentiment'),byKind:group('kind')};
    return Response.json({id:def.id,name:def.name,description:def.description,group:def.group,columns:def.columns,rows:pageRows,total,page,pageSize,hasMore:!exportAll&&(page+1)*pageSize<total,metrics,breakdowns,trend,owners,generatedAt:new Date().toISOString(),filters:{search,studio,priority,status,from:p.get('from')||'',to:p.get('to')||''}});
  }catch(e){return errorResponse(e);}
}

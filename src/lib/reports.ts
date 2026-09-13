import {CATEGORY_MAP,DEPARTMENT_RECORDS,STUDIOS} from './constants';
import {slugify} from './utils';

export type TicketLike={id:number;ticketNumber:string;title:string;summary:string;description:string;category:string;subcategory:string;status:string;priority:string;severity:string;sentiment:string|null;kind:string;studio:string|null;classFormat:string|null;trainer:string|null;membership:string|null;incidentAt:string|null;memberName:string;memberEmail:string|null;assignedStaffId:number|null;assignedStaffName:string|null;departmentId:string|null;departmentName:string|null;slaHours:number;slaDueAt:string|null;resolutionRequired:boolean;source:string;tags:string[];isEscalated:boolean;resolvedAt:string|null;closedAt:string|null;createdAt:string;updatedAt:string};

export type ReportColumn={key:string;label:string};
export type ReportDef={
  id:string;name:string;description:string;group:string;
  columns:ReportColumn[];
  filter:(t:TicketLike)=>boolean;
  row:(t:TicketLike)=>Record<string,string|number>;
  sort?:(a:TicketLike,b:TicketLike)=>number;
};

const OPEN=(t:TicketLike)=>!['resolved','closed','recorded'].includes(t.status);
const RESOLVED=(t:TicketLike)=>['resolved','closed'].includes(t.status);
const hoursBetween=(a:string,b:string)=>Math.max(0,(new Date(b).getTime()-new Date(a).getTime())/3600000);
const baseColumns:ReportColumn[]=[{key:'ticketNumber',label:'Ticket'},{key:'title',label:'Title'},{key:'category',label:'Category'},{key:'subcategory',label:'Subcategory'},{key:'studio',label:'Studio'},{key:'status',label:'Status'},{key:'priority',label:'Priority'},{key:'owner',label:'Owner'},{key:'createdAt',label:'Created'}];
const baseRow=(t:TicketLike):Record<string,string|number>=>({ticketNumber:t.ticketNumber,title:t.title,category:t.category,subcategory:t.subcategory,studio:t.studio||'—',status:t.status,priority:t.priority,owner:t.assignedStaffName||'Unassigned',createdAt:t.createdAt});

function makeSimple(id:string,name:string,description:string,group:string,filter:(t:TicketLike)=>boolean,extraColumns:ReportColumn[]=[],extraRow:(t:TicketLike)=>Record<string,string|number> = ()=>({})):ReportDef{
  return{id,name,description,group,filter,columns:[...baseColumns,...extraColumns],row:t=>({...baseRow(t),...extraRow(t)}),sort:(a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()};
}

export function buildReportCatalogue():ReportDef[]{
  const reports:ReportDef[]=[];
  // 1 per category — 13 reports
  for(const category of Object.keys(CATEGORY_MAP)){
    reports.push(makeSimple(slugify('category-'+category),`${category} — full log`,`Every ticket logged under ${category}, across all studios and statuses.`,'By category',t=>t.category===category));
  }
  // 1 per department — 7 reports
  for(const dept of DEPARTMENT_RECORDS){
    reports.push(makeSimple(slugify('department-'+dept.id),`${dept.name} — department workload`,`All tickets currently routed to ${dept.name}.`,'By department',t=>t.departmentName===dept.name));
  }
  // 1 per studio — 5 reports
  for(const studio of STUDIOS){
    reports.push(makeSimple(slugify('studio-'+studio.id),`${studio.name} — studio log`,`Every ticket logged at ${studio.name}.`,'By studio',t=>t.studio===studio.name));
  }
  // Special / compliance / people reports — 20 reports
  reports.push(
    makeSimple('all-open','Open tickets register','Every ticket that has not yet reached resolved / closed / recorded.','Operational',OPEN),
    makeSimple('all-resolved','Resolved & closed register','Every ticket marked resolved or closed, for audit and QA.','Operational',RESOLVED,[{key:'resolvedAt',label:'Resolved'},{key:'resolutionHours',label:'Resolution (h)'}],t=>({resolvedAt:t.resolvedAt||'—',resolutionHours:t.resolvedAt?hoursBetween(t.createdAt,t.resolvedAt).toFixed(1):'—'})),
    makeSimple('sla-breached','SLA breach report','Tickets whose follow-up target has passed without resolution.','Compliance',t=>Boolean(t.resolutionRequired&&t.slaDueAt&&OPEN(t)&&new Date(t.slaDueAt).getTime()<Date.now()),[{key:'slaDueAt',label:'Was due'},{key:'overdueHours',label:'Overdue by (h)'}],t=>({slaDueAt:t.slaDueAt||'—',overdueHours:t.slaDueAt?hoursBetween(t.slaDueAt,new Date().toISOString()).toFixed(1):'—'})),
    makeSimple('sla-at-risk','SLA at-risk (next 2h)','Open tickets whose follow-up target is due within the next two hours.','Compliance',t=>Boolean(t.resolutionRequired&&t.slaDueAt&&OPEN(t)&&new Date(t.slaDueAt).getTime()>Date.now()&&new Date(t.slaDueAt).getTime()<Date.now()+7200000),[{key:'slaDueAt',label:'Due'}],t=>({slaDueAt:t.slaDueAt||'—'})),
    makeSimple('critical-open','Critical priority — open','All open tickets carrying critical priority.','Compliance',t=>t.priority==='critical'&&OPEN(t)),
    makeSimple('high-open','High priority — open','All open tickets carrying high priority.','Compliance',t=>t.priority==='high'&&OPEN(t)),
    makeSimple('escalated','Escalated tickets','Every ticket that has been explicitly escalated for management review.','Compliance',t=>t.isEscalated),
    makeSimple('unassigned','Unassigned queue','Tickets waiting in a department queue without a named owner.','Operational',t=>t.assignedStaffId===null),
    makeSimple('resolution-time','Resolution time analysis','Resolved tickets with the time taken from creation to resolution.','Performance',t=>Boolean(t.resolvedAt),[{key:'resolutionHours',label:'Resolution (h)'}],t=>({resolutionHours:t.resolvedAt?hoursBetween(t.createdAt,t.resolvedAt).toFixed(1):'—'})),
    makeSimple('trainer-feedback','Trainer feedback summary','All trainer-related feedback and issues raised.','People',t=>t.category==='Trainer Feedback'&&t.kind!=='assessment',[{key:'trainer',label:'Trainer'}],t=>({trainer:t.trainer||'—'})),
    makeSimple('trainer-assessments','Trainer assessment scorecards','Completed weighted evaluations for trainers.','People',t=>t.kind==='assessment',[{key:'trainer',label:'Trainer'}],t=>({trainer:t.trainer||'—'})),
    makeSimple('safety-incidents','Safety & security incidents','All logged safety and security concerns, for management review.','Compliance',t=>t.category==='Safety and Security'),
    makeSimple('theft-register','Theft & lost items register','Every reported theft or missing item, with last-seen context.','Compliance',t=>t.category==='Theft and Lost Items'),
    makeSimple('compliments','Compliments & positive feedback','Record-only appreciation and positive member feedback.','Sentiment',t=>t.kind==='compliment'||t.sentiment==='positive'),
    makeSimple('negative-sentiment','Negative sentiment log','Tickets logged with a frustrated or negative sentiment.','Sentiment',t=>t.sentiment==='negative'||t.sentiment==='frustrated'),
    makeSimple('momence-linked','Momence-linked tickets','Tickets connected to a live Momence member or session record.','Operational',t=>t.tags.includes('momence-linked')),
    makeSimple('powercycle-bikes','PowerCycle bike issues & relapse checks','Bike malfunction tickets and their automatic 48-hour relapse follow-ups.','Operational',t=>t.tags.includes('powercycle-bike-check')||/bike|powercycle/i.test(t.title+' '+t.description)),
    makeSimple('auto-follow-ups','Automated follow-up tickets','Tickets automatically raised by the system (e.g. relapse checks).','Operational',t=>t.source==='system'),
    makeSimple('recent-7-days','Logged in the last 7 days','Everything logged in the last week, newest first.','Time-based',t=>hoursBetween(t.createdAt,new Date().toISOString())<=168),
    makeSimple('recently-resolved','Resolved in the last 7 days','Tickets closed out in the last week — good for a weekly wrap-up.','Time-based',t=>Boolean(t.resolvedAt&&hoursBetween(t.resolvedAt,new Date().toISOString())<=168)),
    makeSimple('full-export','Full ticket export','Every ticket ever logged, unfiltered — the complete register.','Operational',()=>true),
  );
  // Source breakdown reports — 6 reports
  for(const source of ['iris','manual','template','voice','fillout','history']){
    reports.push(makeSimple(slugify('source-'+source),`Logged via ${source}`,`Every ticket whose intake channel was "${source}".`,'By source',t=>t.source===source));
  }
  return reports;
}

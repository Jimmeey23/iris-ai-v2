import {and,eq,gt,inArray,isNotNull,isNull,lt,ne,notInArray,or,sql,type SQL} from 'drizzle-orm';
import {tickets} from '@/db/schema';
import {slugify} from './utils';
import {AUTO_CHECK_TAGS,BIKE_RECHECK_TAG,CLOSED_STATUSES,DONE_STATUSES,DURATION_EXCLUDED_SOURCES} from './metrics';
import {RECURRENCE_CHECK_DAYS} from './tickets';

/** "5- and 10-day" — the re-check schedule, read from the code that raises them. */
const RECURRENCE_CHECK_LABEL=RECURRENCE_CHECK_DAYS.join('- and ')+'-day';

/** The columns a report row can draw on. The route selects exactly these (customFields only
 *  for the reports that need it), never the full ticket. */
export type TicketLike={id:number;ticketNumber:string;title:string;category:string;subcategory:string;status:string;priority:string;studio:string|null;classFormat:string|null;trainer:string|null;assignedStaffName:string|null;slaDueAt:string|null;resolvedAt:string|null;createdAt:string;
  /** The assessment scorecard and its source live here, not in a column. */
  customFields?:Record<string,unknown>};

export type ReportColumn={key:string;label:string};
export type ReportDef={
  id:string;name:string;description:string;group:string;
  columns:ReportColumn[];
  /** The report's selection as SQL, so filtering, paging and aggregates all run in the database. */
  where?:SQL;
  row:(t:TicketLike)=>Record<string,string|number>;
  /** Selects customFields for the row builder. */
  needsCustomFields?:boolean;
};

/* ------------------------------------------------------------------------------------ *
 * SQL mirrors of the lib/metrics.ts definitions, built from the same constants so the
 * database and the client can never disagree about what "open" or "breached" means.
 * ------------------------------------------------------------------------------------ */
const closed=[...CLOSED_STATUSES],done=[...DONE_STATUSES];
const hasAnyTag=(tags:readonly string[])=>or(...tags.map(tag=>sql`${tickets.tags} @> ${JSON.stringify([tag])}::jsonb`)) as SQL;
export const metricSql={
  open:notInArray(tickets.status,closed),
  done:inArray(tickets.status,done),
  resolved:isNotNull(tickets.resolvedAt),
  recordOnly:or(eq(tickets.status,'recorded'),eq(tickets.resolutionRequired,false)) as SQL,
  tracked:and(eq(tickets.resolutionRequired,true),isNotNull(tickets.slaDueAt),ne(tickets.status,'recorded')) as SQL,
  breachedResolved:()=>and(metricSql.tracked,gt(tickets.resolvedAt,tickets.slaDueAt)) as SQL,
  breachedOpen:(now:Date)=>and(metricSql.tracked,metricSql.open,isNull(tickets.resolvedAt),lt(tickets.slaDueAt,now)) as SQL,
  /** Open, tracked, not breached, under `pct`% of the created→due window left. */
  dueSoon:(now:Date,pct:number)=>and(metricSql.tracked,metricSql.open,gt(tickets.slaDueAt,now),
    sql`${tickets.slaDueAt} - ${now}::timestamptz <= (${tickets.slaDueAt} - ${tickets.createdAt}) * ${pct/100}::float8`) as SQL,
  /** Resolved, and not imported history, a system ticket or an automatic re-check. */
  durationEligible:and(isNotNull(tickets.resolvedAt),notInArray(tickets.source,[...DURATION_EXCLUDED_SOURCES]),sql`not (${hasAnyTag(AUTO_CHECK_TAGS)})`) as SQL,
  resolutionHours:sql`extract(epoch from (${tickets.resolvedAt} - ${tickets.createdAt})) / 3600`,
};

const hoursBetween=(a:string,b:string)=>Math.max(0,(new Date(b).getTime()-new Date(a).getTime())/3600000);
const baseColumns:ReportColumn[]=[{key:'ticketNumber',label:'Ticket'},{key:'title',label:'Title'},{key:'category',label:'Category'},{key:'subcategory',label:'Subcategory'},{key:'studio',label:'Studio'},{key:'status',label:'Status'},{key:'priority',label:'Priority'},{key:'owner',label:'Owner'},{key:'createdAt',label:'Created'}];
const baseRow=(t:TicketLike):Record<string,string|number>=>({ticketNumber:t.ticketNumber,title:t.title,category:t.category,subcategory:t.subcategory,studio:t.studio||'—',status:t.status,priority:t.priority,owner:t.assignedStaffName||'Unassigned',createdAt:t.createdAt});

function makeSimple(id:string,name:string,description:string,group:string,where:SQL|undefined,extraColumns:ReportColumn[]=[],extraRow:(t:TicketLike)=>Record<string,string|number> = ()=>({})):ReportDef{
  return{id,name,description,group,where,columns:[...baseColumns,...extraColumns],row:t=>({...baseRow(t),...extraRow(t)})};
}

export type CatalogueContext={
  /** cfg.taxonomy keys — the workspace's categories. */
  categories:string[];
  /** cfg.studios. */
  studios:string[];
  /** Active rows of the departments table. */
  departments:{id:string;name:string}[];
  now:Date;
  /** cfg.slaWarningPercent. */
  slaWarningPercent:number;
};

/** The report catalogue, built from the workspace's configured taxonomy, studios and departments. */
export function buildReportCatalogue(ctx:CatalogueContext):ReportDef[]{
  const {now}=ctx;
  const weekAgo=new Date(now.getTime()-7*864e5);
  const resolutionCol=[{key:'resolutionHours',label:'Resolution (h)'}];
  const resolutionRow=(t:TicketLike)=>({resolutionHours:t.resolvedAt?hoursBetween(t.createdAt,t.resolvedAt).toFixed(1):'—'});
  const reports:ReportDef[]=[];
  for(const category of ctx.categories){
    reports.push(makeSimple(slugify('category-'+category),`${category} — full log`,`Every ticket logged under ${category}, across all studios and statuses.`,'By category',eq(tickets.category,category)));
  }
  for(const dept of ctx.departments){
    reports.push(makeSimple(slugify('department-'+dept.id),`${dept.name} — department workload`,`All tickets currently routed to ${dept.name}.`,'By department',eq(tickets.departmentName,dept.name)));
  }
  for(const studio of ctx.studios){
    reports.push(makeSimple(slugify('studio-'+studio),`${studio} — studio log`,`Every ticket logged at ${studio}.`,'By studio',eq(tickets.studio,studio)));
  }
  reports.push(
    makeSimple('all-open','Open tickets register','Every ticket that has not yet reached resolved / closed / recorded.','Operational',metricSql.open),
    makeSimple('all-resolved','Resolved & closed register','Every ticket marked resolved or closed, for audit and QA.','Operational',metricSql.done,[{key:'resolvedAt',label:'Resolved'},...resolutionCol],t=>({resolvedAt:t.resolvedAt||'—',...resolutionRow(t)})),
    makeSimple('sla-breached','Overdue (SLA breached, still open)','Open tickets whose follow-up target has passed without resolution.','Compliance',metricSql.breachedOpen(now),[{key:'slaDueAt',label:'Was due'},{key:'overdueHours',label:'Overdue by (h)'}],t=>({slaDueAt:t.slaDueAt||'—',overdueHours:t.slaDueAt?hoursBetween(t.slaDueAt,now.toISOString()).toFixed(1):'—'})),
    makeSimple('sla-resolved-late','Resolved late (SLA breached)','Tickets resolved after their follow-up target had passed.','Compliance',metricSql.breachedResolved(),[{key:'slaDueAt',label:'Was due'},{key:'resolvedAt',label:'Resolved'},{key:'lateHours',label:'Late by (h)'}],t=>({slaDueAt:t.slaDueAt||'—',resolvedAt:t.resolvedAt||'—',lateHours:t.slaDueAt&&t.resolvedAt?hoursBetween(t.slaDueAt,t.resolvedAt).toFixed(1):'—'})),
    makeSimple('sla-at-risk','SLA due soon',`Open tickets with less than ${ctx.slaWarningPercent}% of their follow-up window left.`,'Compliance',metricSql.dueSoon(now,ctx.slaWarningPercent),[{key:'slaDueAt',label:'Due'}],t=>({slaDueAt:t.slaDueAt||'—'})),
    makeSimple('critical-open','Critical priority — open','All open tickets carrying critical priority.','Compliance',and(eq(tickets.priority,'critical'),metricSql.open)),
    makeSimple('high-open','High priority — open','All open tickets carrying high priority.','Compliance',and(eq(tickets.priority,'high'),metricSql.open)),
    makeSimple('escalated','Escalated tickets','Every ticket that has been explicitly escalated for management review.','Compliance',eq(tickets.isEscalated,true)),
    makeSimple('unassigned','Unassigned queue','Tickets waiting in a department queue without a named owner.','Operational',isNull(tickets.assignedStaffId)),
    makeSimple('resolution-time','Resolution time analysis','Resolved tickets with the time taken from creation to resolution (excludes imported history and automatic checks).','Performance',metricSql.durationEligible,resolutionCol,resolutionRow),
    makeSimple('trainer-feedback','Trainer feedback summary','All trainer-related feedback and issues raised.','People',and(eq(tickets.category,'Trainer Feedback'),ne(tickets.kind,'assessment')),[{key:'trainer',label:'Trainer'}],t=>({trainer:t.trainer||'—'})),
    // The score, evaluator and form the assessment came from are the point of this report —
    // without them the rows were indistinguishable from any other trainer ticket.
    {...makeSimple('trainer-assessments','Trainer assessment scorecards','Completed evaluations for trainers, with their score and the form each came from.','People',eq(tickets.kind,'assessment'),
      [{key:'trainer',label:'Trainer'},{key:'evaluationScore',label:'Score (%)'},{key:'evaluator',label:'Evaluated by'},{key:'sessionName',label:'Class / level'},{key:'reviewSource',label:'Source form'}],
      t=>{const cf=t.customFields||{};const score=Number(cf.evaluationScore);
        return{trainer:t.trainer||'—',evaluationScore:Number.isFinite(score)&&score>0?score:'—',
          evaluator:String(cf.evaluator||'—')||'—',sessionName:String(cf.sessionName||t.classFormat||'—')||'—',
          reviewSource:String(cf.sourceLabel||'Logged in IRIS')};}),needsCustomFields:true},
    makeSimple('safety-incidents','Safety & security incidents','All logged safety and security concerns, for management review.','Compliance',eq(tickets.category,'Safety and Security')),
    makeSimple('theft-register','Theft & lost items register','Every reported theft or missing item, with last-seen context.','Compliance',eq(tickets.category,'Theft and Lost Items')),
    makeSimple('compliments','Compliments & positive feedback','Record-only appreciation and positive member feedback.','Sentiment',or(eq(tickets.kind,'compliment'),eq(tickets.sentiment,'positive'))),
    makeSimple('negative-sentiment','Negative sentiment log','Tickets logged with a frustrated or negative sentiment.','Sentiment',inArray(tickets.sentiment,['negative','frustrated'])),
    makeSimple('momence-linked','Momence-linked tickets','Tickets connected to a live Momence member or session record.','Operational',hasAnyTag(['momence-linked'])),
    // The resolve flow tags each bike check `bike-recheck` (lib/tickets.ts maybeCreateRecurrenceChecks).
    makeSimple('powercycle-bikes','PowerCycle bike issues & recurrence checks',`Bike malfunction tickets and their automatic ${RECURRENCE_CHECK_LABEL} recurrence checks.`,'Operational',or(hasAnyTag([BIKE_RECHECK_TAG]),sql`(${tickets.title} || ' ' || ${tickets.description}) ~* 'bike|powercycle'`)),
    makeSimple('auto-follow-ups','Automated follow-up tickets','Tickets automatically raised by the system (e.g. recurrence checks).','Operational',eq(tickets.source,'system')),
    makeSimple('recent-7-days','Logged in the last 7 days','Everything logged in the last week, newest first.','Time-based',sql`${tickets.createdAt} >= ${weekAgo}`),
    makeSimple('recently-resolved','Resolved in the last 7 days','Tickets closed out in the last week — good for a weekly wrap-up.','Time-based',sql`${tickets.resolvedAt} >= ${weekAgo}`),
    makeSimple('full-export','Full ticket export','Every ticket ever logged, unfiltered — the complete register.','Operational',undefined),
  );
  for(const source of ['iris','manual','template','voice','fillout','history']){
    reports.push(makeSimple(slugify('source-'+source),`Logged via ${source}`,`Every ticket whose intake channel was "${source}".`,'By source',eq(tickets.source,source)));
  }
  return reports;
}

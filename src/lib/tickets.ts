import {and,desc,eq,or,sql,ne,inArray,lt,lte,gt,ilike,type SQL} from 'drizzle-orm';
import {recurrenceOwner} from './recurrence-assignment';
import {reportingManagerId} from './reporting-line';
import {describeTicket} from './ticket-label';
import {randomUUID} from 'crypto';
import {hostedFeedbackError} from './hosted-feedback';
import {db,type Tx} from '@/db';
import {tickets,staff,departments,assets,appSettings,ticketActivities,ticketComments,ticketLinks,ticketResolutions,ticketResolutionSteps,ticketFollowUps,ticketContactLog,ticketResolutionAttachments,chatAttachments,chatSessions,deliveryLogs,ticketNotifications,appUsers,userNotifications} from '@/db/schema';
import {ticketInputSchema,publicTicketInputSchema,type TicketInput,type AdvancedDraft} from './ticket-contract';
import {getConfig,type WorkspaceConfig} from './config';
import {ApiError,canAccessTicket,canEditTicketDetails,coveredStudios,currentUser,requireTicketAccess,type Identity} from './auth';
import {CITY_OWNERS,ESCALATION_OWNERS,ROUND_ROBIN_DEPARTMENTS,cityOf,inferPriority,inferSeverity,studioIdsFor} from './routing';
import {buildTemplate} from './templates';
import {ticketNumberFor,slugify} from './utils';
import {scoreAssessment} from './guided-templates';
import {configuredTemplates} from './template-store';
import {indiaDate} from './display';
import {equipmentRepairRoute} from './equipment-routing';
import {emitTicketEvent,eventEnabled} from './ticket-events';
import {ticketBcc,ticketEmailBody,type TicketEmailKind} from './ticket-emails';
import {resolveTrainer} from './trainer-directory';

type Priority='low'|'medium'|'high'|'critical';
type Config=WorkspaceConfig;
const PRIORITY_RANK:Record<Priority,number>={low:0,medium:1,high:2,critical:3};
const isPriority=(p:unknown):p is Priority=>typeof p==='string'&&p in PRIORITY_RANK;
/** The higher of two priorities. A reporter's own priority may raise what the rules inferred, never lower it. */
export function maxPriority(a:Priority,b?:string|null):Priority{return isPriority(b)&&PRIORITY_RANK[b]>PRIORITY_RANK[a]?b:a;}
/** Follow-up hours for a priority, honouring an administrator's per-subcategory override —
 *  the one rule makeDraft, the PATCH route and every automatic priority raise share. */
export function slaHoursFor(cfg:Pick<Config,'responseHours'|'subcategoryRouting'>,category:string,subcategory:string,priority:Priority):number{return Math.max(12,Math.min(72,cfg.subcategoryRouting[category+'|||'+subcategory]?.slaHours??cfg.responseHours[priority]));}
/** customFields keys only the server writes: the routing brief, automation markers, the chat's
 *  own session keys and the repeat counter. `_intake` stays — the form intake legitimately
 *  records which plan the answers came from (see README). */
const RESERVED_FIELD=/^(autoFollowUp|followUpType|followUpReason|parent[A-Z].*|recurrence.*|recheck.*|firstResolvedAt|lastRepeatAt|closedOnImport)$/;
export function stripReservedFields(cf:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(cf).filter(([k])=>k==='_intake'||(!k.startsWith('_')&&!RESERVED_FIELD.test(k))));}
const ticketArea=(fields:Record<string,unknown>)=>String(fields.area||fields.specific_area||fields.affected_room||fields.incident_location||'').trim()||null;
/** Kinds that may be filed record-only (no SLA, no resolution), per the README. */
/** Kinds that are a record of something said, not a job to be done: a compliment, a trainer
 *  assessment, and feedback of any sentiment. Feedback used to count only when it was
 *  positive, which left a member's negative comment holding an SLA and a resolution workspace
 *  that nobody could ever meaningfully close — there is no "fix" for an opinion. Anything in
 *  feedback that does need work is filed as the issue it is, not as feedback. */
const RECORD_ONLY_KINDS=new Set(['compliment','assessment','feedback']);
const recordOnlyEligible=(input:{kind:string})=>RECORD_ONLY_KINDS.has(input.kind);
type Routing=Awaited<ReturnType<typeof resolveRouting>>;
/** Per-run caches for bulk callers (history import), so a thousand rows do not read the
 *  configuration and the routing tables a thousand times. */
export type DraftContext={cfg?:Config;routing?:Map<string,Routing>};
const TRAINING_CATEGORIES=new Set(['Scheduling','Trainer Feedback','Class Experience']);
const OPERATIONS_CATEGORIES=new Set(['Repair and Maintenance','Studio Amenities and Facilities','Operating Systems','Tech Issues','Theft and Lost Items','Internal Operations & Admin']);
const OPERATIONS_WORK=/\b(maintenance|repair|malfunction|fault|broken|issue|sop|standard operating procedure|process|policy|facility|facilities|housekeeping|cleaning|equipment|system|plumbing|electrical|inventory|security|safety)\b/i;
/** Training owns only schedules, trainers and method/class delivery. Operational work wins
 * over saved workspace overrides; an unknown category has a safe Management fallback. */
export function departmentForTicket(cfg:Pick<Config,'categoryDepartments'|'subcategoryRouting'>,category:string,subcategory=''){
  if(TRAINING_CATEGORIES.has(category))return'training';
  if(OPERATIONS_CATEGORIES.has(category)||OPERATIONS_WORK.test(`${category} ${subcategory}`))return'operations';
  const configured=cfg.subcategoryRouting[category+'|||'+subcategory]?.departmentId||cfg.categoryDepartments[category];
  return configured&&configured!=='training'?configured:'management';
}
/** Department and owner for a category at a studio — the same rule makeDraft applies, exposed
 *  so the intake form can show who will pick a ticket up before it is filed. */
export async function resolveRouting(cfg:Awaited<ReturnType<typeof getConfig>>,category:string,studio:string,subcategory?:string){
const subRule=subcategory?cfg.subcategoryRouting[category+'|||'+subcategory]:undefined;
const departmentId=departmentForTicket(cfg,category,subcategory);const[dept]=await db.select().from(departments).where(eq(departments.id,departmentId));if(!dept?.active)throw new ApiError('The routing department is inactive. Ask an administrator to update the routing rule.');
const people=await db.select().from(staff).where(and(eq(staff.isActive,true),eq(staff.department,dept.name)));
const ids=studioIdsFor(studio);const override=subRule?.ownerId||cfg.routingOwners[category+'::'+studio]||cfg.routingOwners[category];
// Named city owners come after a rule an administrator set on the sub-category itself.
const city=cityOf(studio);const named=CITY_OWNERS[departmentId]?.[city||'mumbai'];
let cityOwner:typeof people[number]|undefined;
if(cfg.autoAssign&&city&&named&&!subRule?.ownerId){const candidates=named.map(re=>people.find(p=>re.test(p.name))).filter((p):p is typeof people[number]=>Boolean(p));
  if(candidates.length===1)cityOwner=candidates[0];
  else if(candidates.length>1){const load=await db.select({id:tickets.assignedStaffId,n:sql<number>`count(*)::int`}).from(tickets).where(and(inArray(tickets.assignedStaffId,candidates.map(c=>c.id)),sql`${tickets.status} not in ('resolved','closed','recorded')`)).groupBy(tickets.assignedStaffId);
    const open=(id:number)=>load.find(l=>l.id===id)?.n||0;cityOwner=[...candidates].sort((a,b)=>open(a.id)-open(b.id))[0];}}
// Shared out in turn: whoever on this studio's team has gone longest without a ticket takes
// the next one. Ties and never-assigned people sort first, so a new associate starts working
// straight away rather than waiting for the rota to reach them.
let rotaOwner:typeof people[number]|undefined;
if(cfg.autoAssign&&!cityOwner&&!subRule?.ownerId&&!override&&ROUND_ROBIN_DEPARTMENTS.has(departmentId)){
  const team=people.filter(p=>p.studioId&&ids.includes(p.studioId));
  const pool=team.length?team:people.filter(p=>cityOf(p.location)===city);
  if(pool.length){
    const last=await db.select({id:tickets.assignedStaffId,at:sql<string|null>`max(${tickets.createdAt})`}).from(tickets)
      .where(inArray(tickets.assignedStaffId,pool.map(p=>p.id))).groupBy(tickets.assignedStaffId);
    const lastAt=(id:number)=>{const row=last.find(l=>l.id===id);return row?.at?new Date(row.at).getTime():0;};
    rotaOwner=[...pool].sort((a,b)=>lastAt(a.id)-lastAt(b.id)||a.id-b.id)[0];
  }
}
const owner=cfg.autoAssign?(cityOwner||rotaOwner||people.find(p=>p.id===override)||people.sort((a,b)=>{const score=(p:typeof a)=>(p.categories.includes(category)?10:0)+(p.studioId&&ids.includes(p.studioId)?8:0)+(/Head|Coordinator|Ops Manager|Chief/.test(p.role)?3:0);return score(b)-score(a);})[0]):{id:null,name:'Unassigned',email:'',role:'Department queue'};if(!owner)throw new ApiError('No active owner is available in the routing department.');
return{departmentId,dept,owner,ids,override};}
/** Builds a ticket draft. Callers default to untrusted — the public endpoint and the chat —
 *  where the source is restricted, reserved customFields are stripped, a supplied priority
 *  can only raise the inferred one, and record-only is honoured only for kinds that qualify.
 *  `trusted` is for server-side callers (history import) that carry their own facts. */
export async function makeDraft(raw:unknown,opts:{trusted?:boolean}&DraftContext={}):Promise<AdvancedDraft>{const trusted=Boolean(opts.trusted);const input:TicketInput=trusted?ticketInputSchema.parse(raw):publicTicketInputSchema.parse(raw);const cfg=opts.cfg||await getConfig();
if(!trusted)input.customFields=stripReservedFields(input.customFields);
// A trainer's name is free text on the way in, so the same person arrives as "Siddhartha"
// and "Siddhartha Kusuma" and their reviews land in two places. Resolved to one canonical
// name at the point of writing, which is the only way to stop the split growing; the
// Trainers page still folds the spellings already on file. An ambiguous first name is left
// exactly as written — see lib/trainer-directory.
if(input.trainer){
  const resolved=resolveTrainer(input.trainer);
  if(resolved.via!=='ambiguous')input.trainer=resolved.name;
}
// A broken mic, headset or any other equipment/system failure is repair work. Apply this
// before taxonomy validation and routing so every intake path reaches Operations.
const repairRoute=equipmentRepairRoute({category:input.category,subcategory:input.subcategory,title:input.title,summary:input.summary,description:input.description,systemName:String(input.customFields.systemName||''),itemDescription:String(input.customFields.itemDescription||'')});
if(repairRoute){input.category=repairRoute.category;input.subcategory=repairRoute.subcategory;}
// An asset reference has to name a row in the register; anything else is dropped rather than stored as a dangling id.
if(input.customFields.assetId!==undefined){const assetId=Number(input.customFields.assetId);const[asset]=Number.isInteger(assetId)&&assetId>0?await db.select({id:assets.id}).from(assets).where(eq(assets.id,assetId)):[];if(asset)input.customFields.assetId=asset.id;else delete input.customFields.assetId;}
if(!cfg.taxonomy[input.category]?.includes(input.subcategory))throw new ApiError('Choose a subcategory belonging to the selected category.');
const template=input.templateId?(await configuredTemplates()).find(t=>t.id===input.templateId):undefined;
if(template)for(const field of template.fields.filter(f=>f.required)){const val=input.customFields[field.id];if(val===undefined||val===null||val==='')throw new ApiError(`${field.label} is required.`);if(field.type==='rating'&&(!Number.isFinite(Number(val))||Number(val)<0||Number(val)>5))throw new ApiError(`${field.label} must be scored from 0 to 5.`);}
const calculatedScore=template?scoreAssessment(template.fields,input.customFields):null;if(calculatedScore!==null)input.customFields.evaluationScore=calculatedScore;
// `positiveNoSla` still governs praise, because that is what the setting is named for and
// what an administrator who turns it off expects to change. Everything in RECORD_ONLY_KINDS
// is record-only regardless: a comment is not work, whoever asks.
const praise=input.kind==='compliment'||input.kind==='feedback'&&input.sentiment==='positive';
const noSla=input.resolutionRequired===false||recordOnlyEligible(input)||(praise&&cfg.positiveNoSla);
// The intake answers ride in customFields — they are not columns on the schema — so
// they have to be read back out here or the reporter's own urgency signal never
// reaches the priority rules.
// Guided templates saved before the field was renamed still send `classImpact`.
const inferred=inferPriority({category:input.category,subcategory:input.subcategory,isClassImpacted:String(input.customFields.isClassImpacted||input.customFields.classImpact||''),isImmediateDanger:String(input.customFields.isImmediateDanger||''),impact:input.impact,memberImpact:String(input.customFields.memberImpact||''),cycleSeverity:String(input.customFields.cycleSeverity||'')});
const priority:Priority=noSla?'low':input.category==='Safety and Security'?'critical':trusted&&input.priority?input.priority:maxPriority(inferred,input.priority);
const routeKey=input.category+'::'+input.studio+'::'+input.subcategory;let routing=opts.routing?.get(routeKey);if(!routing){routing=await resolveRouting(cfg,input.category,input.studio,input.subcategory);opts.routing?.set(routeKey,routing);}
const{departmentId,dept,owner,ids,override}=routing;
const studioShort=input.studio.split(',')[0].trim();
// A title that reads on its own in a list. It used to be the taxonomy joined with middots,
// which told a reader which drawer the ticket was in rather than what had happened; see
// ticket-label.ts. Classification is still shown, as chips beside the label.
const title=input.title?.trim()||(cfg.labelStyle==='classification'
  // The older taxonomy title, kept for workspaces that prefer their rows filed by drawer.
  ? [praise?'Member appreciation':input.subcategory,input.classFormat?.split('+')[0].trim(),studioShort].filter(Boolean).join(' · ')
  : describeTicket({description:input.description,subcategory:input.subcategory,category:input.category,kind:input.kind,studio:input.studio,classFormat:input.classFormat,trainer:input.trainer,sentiment:input.sentiment,memberName:input.memberName},cfg.labelMaxLength));
// The summary is what every list, card and digest shows instead of the full description, so
// it carries the who/where/when the description usually assumes.
const narrative=input.description.replace(/\s+/g,' ').trim();
// The form files an exact instant for incidentAt where the chat records a phrase; the summary
// reads the same either way.
const when=/^\d{4}-\d{2}-\d{2}T/.test(input.incidentAt)?indiaDate(input.incidentAt):input.incidentAt;
const summary=input.summary?.trim()||[`${input.kind==='issue'?'Reported':'Logged'} by ${input.memberName} at ${studioShort}`,input.classFormat?`during ${input.classFormat}${input.trainer?` with ${input.trainer}`:''}`:null,when?`(${when})`:null].filter(Boolean).join(' ')+' — '+narrative.slice(0,280)+(narrative.length>280?'…':'');
const slaHours=noSla?0:slaHoursFor(cfg,input.category,input.subcategory,priority);const base=buildTemplate(input.category,input.subcategory,cfg,{priority,slaHours});
const opsChecklist=noSla
  ?['Record the feedback accurately, in the reporter\u2019s own words','Share the recognition with the named team member and their manager','File under the studio\u2019s monthly highlights']
  :[`Acknowledge ${input.memberName} on ${input.preferredContact.toLowerCase()} within ${Math.max(1,Math.round(slaHours/4))}h`,...base.opsChecklist,...(input.category==='Safety and Security'?['Escalate to the studio manager on duty immediately','Record the incident in the safety register']:[]),...(input.momenceMemberId?['Check the member\u2019s Momence booking and billing history for related issues']:[]),...(String(input.customFields.memberImpact||'').toLowerCase().startsWith('yes')?[`Contact the members whose session was affected${input.customFields.impactedMembers?` (${String(input.customFields.impactedMembers).slice(0,120)})`:''} and agree the credit or makeup owed`,'Note the affected members against their Momence bookings so the front desk can see it']:[]),'Confirm the outcome with the member before closing'];
const tags=cfg.autoTag?[...new Set([slugify(input.category),slugify(input.subcategory),slugify(studioShort),input.kind,noSla?'no-sla':priority,'sentiment-'+input.sentiment,'via-'+input.source,...(input.impact?['impact-'+slugify(input.impact)]:[]),...(input.classFormat?['format-'+slugify(input.classFormat.split('+')[0])]:[]),...(input.trainer?['trainer-'+slugify(input.trainer.split(',')[0])]:[]),...(input.membership?['membership-'+slugify(input.membership)]:[]),...(input.momenceMemberId?['momence-linked']:[]),...(input.kind==='assessment'?['trainer-evaluation']:[])].filter(Boolean))]:[];
const memberFacingUpdate=praise?`Thank you${input.memberName?' , '+input.memberName.split(' ')[0]:''} for sharing this. Your feedback will be recorded for our ${dept.name} team.`:`Hi ${input.memberName.split(' ')[0]}, thank you for sharing your experience. ${owner.name} from ${dept.name} will review your request. The internal follow-up target is ${slaHours} hours; a resolution time has not yet been confirmed.`;
return{...input,title,summary,priority,severity:inferSeverity(priority),assignedStaffId:owner.id,assignedStaffName:owner.name,assignedStaffEmail:owner.email,assignedStaffRole:owner.role,departmentId,departmentName:dept.name,slaHours,slaLabel:noSla?'No SLA required':slaHours===1?'1 hour':slaHours+' hours',resolutionRequired:!noSla,tags,opsChecklist,memberFacingUpdate,internalBrief:input.description,routingReason:!cfg.autoAssign?'Automatic assignment disabled · parked in the department queue':override?`Administrator-defined routing rule for ${input.category}${cfg.routingOwners[input.category+'::'+input.studio]?' at '+studioShort:''} → ${owner.name}`:`${input.category} routes to ${dept.name}. ${owner.name} picked up as the active ${owner.role||'specialist'}${ids.length?` covering ${studioShort}`:''}, with a ${noSla?'record-only':slaHours+'h'} follow-up target at ${priority} priority.`};}

type ExternalCreate={sourceRef?:string;createdAt?:Date;status?:string;resolvedAt?:Date;/** A backfilled record was never worked in this system, so it carries no SLA clock. */noSla?:boolean;/** An explicit follow-up deadline (recurrence checks are due days after the resolution, not hours after filing). */slaDueAt?:Date;/** Run inside the caller's transaction (as a savepoint) instead of opening a new one — the history import batches rows this way. */tx?:Tx};
/** The owner and their reporting manager, each with the name they are greeted by and the
 *  role their copy is written for. Deduped by address: a manager who owns their own ticket
 *  gets one owner's copy, not two. */
type MailRecipient={email:string;name:string|null;role:'owner'|'manager'};
async function notificationRecipients(tx:Tx,ownerId:number|null,ownerEmail:string|null,ownerName:string|null){
  const byEmail=new Map<string,MailRecipient>();const add=(email:string|null|undefined,name:string|null,role:MailRecipient['role'])=>{const key=email?.trim().toLowerCase();if(key&&!byEmail.has(key))byEmail.set(key,{email:key,name,role});};
  add(ownerEmail,ownerName,'owner');
  if(ownerId){const[owner]=await tx.select({manager:staff.manager}).from(staff).where(eq(staff.id,ownerId));if(owner?.manager){const[manager]=await tx.select({email:staff.email,name:staff.name}).from(staff).where(and(eq(staff.isActive,true),ilike(staff.name,owner.manager.trim())));if(manager?.email)add(manager.email,manager.name,'manager');}}
  return[...byEmail.values()];
}
/** Where the ticket lives, for the button in the email. Falls back to a relative path when
 *  the deployment URL is not configured — better a broken-looking link than a wrong domain. */
const ticketUrl=(id:number)=>{const base=process.env.NEXT_PUBLIC_APP_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:'');return base?`${base.replace(/\/$/,'')}/tickets/${id}`:'';};
async function queueTicketEmails(tx:Tx,ticket:{id:number;ticketNumber:string;title:string;assignedStaffId:number|null;assignedStaffEmail:string|null;slaDueAt:Date|null;priority?:string|null;category?:string|null;subcategory?:string|null;studio?:string|null;memberName?:string|null;assignedStaffName?:string|null;departmentName?:string|null;createdAt?:Date|null;summary?:string|null;escalatedFromName?:string|null},kind:TicketEmailKind,recipients?:MailRecipient[],cc:MailRecipient[]=[]){
  const targets=recipients||await notificationRecipients(tx,ticket.assignedStaffId,ticket.assignedStaffEmail,ticket.assignedStaffName??null);
  let queued=0;
  // The archive address rides on the first message only. Attaching it to every message would
  // put one copy per recipient in that mailbox — two or three copies of the same notification
  // for a ticket that has an owner and a manager.
  const bcc=ticketBcc();
  for(const{email,name,role}of targets){
    const[ledger]=await tx.insert(ticketNotifications).values({ticketId:ticket.id,kind,recipientEmail:email}).onConflictDoNothing().returning({id:ticketNotifications.id});
    if(!ledger)continue;
    const copied=cc.filter(c=>c.email!==email);
    const{subject,text,html}=ticketEmailBody({...ticket,appUrl:ticketUrl(ticket.id)},kind,{name,role,copied:copied.map(c=>c.name||c.email)});
    await tx.insert(deliveryLogs).values({integrationId:'mailtrap',action:'send',nextAttemptAt:new Date(),payload:{to:[{email}],...(copied.length?{cc:copied.map(c=>({email:c.email}))}:{}),...(queued===0&&bcc.length?{bcc}:{}),subject,text,html}});queued++;
  }
  return queued;
}
export async function createTicketFromDraft(draft:AdvancedDraft,source=draft.source,channel='workspace',external?:ExternalCreate){return(await insertTicketFromDraft(draft,source,channel,external)).row;}
/** `created` is false when the submission key or source reference already had a ticket. */
async function insertTicketFromDraft(draft:AdvancedDraft,source=draft.source,channel='workspace',external?:ExternalCreate){
if(source!=='history'&&source!=='system'){const error=hostedFeedbackError(draft.category,draft.subcategory,draft.customFields?.hostedAttendees);if(error)throw new ApiError(error);}
const cfg=source==='history'?null:await getConfig();const submissionKey=draft.submissionKey||randomUUID();
const findExisting=(tx:Tx)=>tx.select().from(tickets).where(external?.sourceRef?or(eq(tickets.submissionKey,submissionKey),eq(tickets.sourceRef,external.sourceRef)):eq(tickets.submissionKey,submissionKey));
const work=async(tx:Tx)=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${submissionKey}))`);const[existing]=await findExisting(tx);if(existing)return{row:existing,created:false};
// An imported record may carry a date the exporting system invented; a ticket filed in the
// future would sit above every genuinely new one for ever in a newest-first list, so the
// stamp is never allowed past the moment of the insert.
const filedAt=new Date();const now=external?.createdAt&&external.createdAt.getTime()<filedAt.getTime()?external.createdAt:filedAt;
// An Unassigned (queue-parked) ticket is not "assigned" to anyone yet.
const status=external?.status||(draft.resolutionRequired?(draft.assignedStaffId?'assigned':'new'):'recorded');const closed=['resolved','closed'].includes(status);const backfill=Boolean(external?.noSla);const resolvedAt=closed?external?.resolvedAt||now:null;
const area=ticketArea(draft.customFields);
const[row]=await tx.insert(tickets).values({ticketNumber:'P57-'+randomUUID(),title:draft.title,summary:draft.summary,description:draft.description,category:draft.category,subcategory:draft.subcategory,status,priority:draft.priority,severity:draft.severity,sentiment:draft.sentiment,kind:draft.kind,resolutionRequired:backfill?false:draft.resolutionRequired,impact:draft.impact,studio:draft.studio,area,classFormat:draft.classFormat,trainer:draft.trainer,membership:draft.membership,incidentAt:draft.incidentAt,memberName:draft.memberName,memberEmail:draft.memberEmail,memberPhone:draft.memberPhone,momenceMemberId:draft.momenceMemberId,momenceSessionId:draft.momenceSessionId,preferredContact:draft.preferredContact,requestedResolution:draft.requestedResolution,assignedStaffId:draft.assignedStaffId,assignedStaffName:draft.assignedStaffName,assignedStaffEmail:draft.assignedStaffEmail,departmentId:draft.departmentId,departmentName:draft.departmentName,slaHours:backfill?0:draft.slaHours,slaDueAt:backfill||!draft.slaHours?null:external?.slaDueAt||new Date(now.getTime()+draft.slaHours*3600000),source,channel,tags:draft.tags,templateId:draft.templateId,customFields:{...draft.customFields,_brief:{opsChecklist:draft.opsChecklist,memberFacingUpdate:draft.memberFacingUpdate,routingReason:draft.routingReason}},momenceContext:draft.momenceContext||null,assetId:typeof draft.customFields?.assetId==='number'?draft.customFields.assetId:null,submissionKey,sourceRef:external?.sourceRef,createdAt:now,updatedAt:now,resolvedAt,closedAt:status==='closed'?resolvedAt:null}).onConflictDoNothing().returning();
// A concurrent insert with the same key or source reference won the race: return that row rather than a 500.
if(!row){const[winner]=await findExisting(tx);if(!winner)throw new ApiError('This ticket could not be saved. Try again.',409);return{row:winner,created:false};}
const number=ticketNumberFor(row.id);await tx.update(tickets).set({ticketNumber:number}).where(eq(tickets.id,row.id));await tx.insert(ticketActivities).values({ticketId:row.id,actorName:source==='history'?'History import':'IRIS',action:'created',detail:`${draft.assignedStaffName} · ${draft.departmentName} · ${backfill?'No SLA · closed historical record':draft.slaLabel}`,createdAt:now});
if(area&&draft.studio){const related=await tx.select({id:tickets.id}).from(tickets).where(and(ne(tickets.id,row.id),eq(tickets.subcategory,draft.subcategory),eq(tickets.studio,draft.studio),eq(tickets.area,area))).orderBy(desc(tickets.createdAt)).limit(12);if(related.length){await tx.insert(ticketLinks).values(related.map(other=>({ticketId:Math.min(row.id,other.id),relatedId:Math.max(row.id,other.id),relation:'recurring-context'}))).onConflictDoNothing();await tx.insert(ticketActivities).values({ticketId:row.id,actorName:'IRIS Automation',action:'linked.recurring_context',detail:`Auto-linked ${related.length} ticket${related.length===1?'':'s'} with the same subcategory, studio and area.`});}}
const savedRow={...row,ticketNumber:number};
// A history backfill imports thousands of rows that were never worked here; firing a
// webhook for each would flood the workflow with events for closed historical records.
if(cfg&&source!=='history')await emitTicketEvent(tx,{type:'ticket.created',ticket:savedRow,cfg,actor:{name:'IRIS'}});if(emailSendingEnabled()&&cfg?.assignmentEmail&&source!=='history')await queueTicketEmails(tx,savedRow,'assigned');
return{row:savedRow,created:true};};
return external?.tx?external.tx.transaction(work):db.transaction(work);}
/** List views never read `customFields` or the long-form text, which are ~85% of the
 *  table's bytes. Selecting only the rendered columns keeps this response small. */
const LIST_COLUMNS={id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status,priority:tickets.priority,category:tickets.category,subcategory:tickets.subcategory,studio:tickets.studio,area:tickets.area,memberName:tickets.memberName,assignedStaffId:tickets.assignedStaffId,assignedStaffName:tickets.assignedStaffName,departmentName:tickets.departmentName,createdByUserId:tickets.createdByUserId,kind:tickets.kind,source:tickets.source,resolutionRequired:tickets.resolutionRequired,slaDueAt:tickets.slaDueAt,resolvedAt:tickets.resolvedAt,createdAt:tickets.createdAt,updatedAt:tickets.updatedAt,version:tickets.version};
/** SQL form of `canAccessTicket`, so a list or a search only ever reads rows the caller may open. */
/** The row filter behind every list, search and count. Mirrors `canAccessTicket`
 *  in lib/auth.ts — that one judges a single ticket, this one turns the same
 *  rule into SQL, and the two must never drift apart.
 *
 *  An agent sees their own work plus their whole studio's: a studio is a shared
 *  workplace, so an associate needs what the previous shift logged, not only
 *  the tickets bearing their own name. An agent with no studio recorded still
 *  sees only their own. */
export function ticketScope(user?:Identity):SQL|undefined{
  if(!user||user.role==='admin')return undefined;
  const studios=coveredStudios(user);
  const inStudios=studios.length?inArray(tickets.studio,studios):undefined;
  const reports=user.managedStaffIds?.length?inArray(tickets.assignedStaffId,user.managedStaffIds):undefined;
  const base=user.role==='agent'
    ? or(
        user.staffId===null?undefined:eq(tickets.assignedStaffId,user.staffId),
        eq(tickets.createdByUserId,user.id),
        inStudios,
      )
    : or(user.staffId===null?undefined:eq(tickets.assignedStaffId,user.staffId),and(user.department?eq(tickets.departmentName,user.department):undefined,inStudios,user.department||studios.length?undefined:sql`false`));
  return reports?or(reports,base):base;
}
/**
 * Whether the app may send the automatic "assigned to you" email on ticket
 * creation.
 *
 * The workspace setting controls normal operation. `SEND_EMAILS=false` is an
 * explicit emergency/test kill switch; otherwise enabled workspaces queue mail.
 */
export function emailSendingEnabled(){return (process.env.SEND_EMAILS??'true').trim().toLowerCase()!=='false';}
/** Queue one idempotent warning per recipient when an unresolved ticket enters its final
 * three-hour SLA window. The hourly cron calls this before draining the outbox. */
export async function queueSlaReminderEmails(now=new Date()){
  if(!emailSendingEnabled())return 0;const cfg=await getConfig();if(!cfg.assignmentEmail)return 0;
  const dueBefore=new Date(now.getTime()+3*3600_000);
  const rows=await db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,assignedStaffId:tickets.assignedStaffId,assignedStaffEmail:tickets.assignedStaffEmail,slaDueAt:tickets.slaDueAt,priority:tickets.priority,category:tickets.category,subcategory:tickets.subcategory,studio:tickets.studio,memberName:tickets.memberName,assignedStaffName:tickets.assignedStaffName,summary:tickets.summary,departmentName:tickets.departmentName,createdAt:tickets.createdAt}).from(tickets).where(and(eq(tickets.resolutionRequired,true),sql`${tickets.status} not in ('resolved','closed','recorded')`,gt(tickets.slaDueAt,now),lte(tickets.slaDueAt,dueBefore)));
  let queued=0;for(const ticket of rows)queued+=await db.transaction(tx=>queueTicketEmails(tx,ticket,'sla-3h'));return queued;
}
/**
 * Webhook sweep for breached follow-up targets. Nothing else notices a breach:
 * applyEscalations() only runs when `escalateAfterBreachHours` is configured, and it
 * defaults to off.
 *
 * Idempotency reuses the ticketNotifications ledger — its unique index on
 * (ticketId, kind, recipientEmail) is what stops the same ticket being reported on
 * every cron tick. `recipientEmail` holds a channel name rather than an address here.
 *
 * Known limitation: a ticket that breaches, is resolved, is reopened and breaches
 * again emits once in total. Repeated alerts for one ticket are worse than a missed
 * second one.
 */
export async function emitOverdueEvents(now=new Date()){
  const cfg=await getConfig();
  if(!eventEnabled(cfg,'ticket.overdue'))return 0;
  const rows=await db.select().from(tickets).where(and(
    eq(tickets.resolutionRequired,true),
    sql`${tickets.status} not in ('resolved','closed','recorded')`,
    sql`${tickets.slaDueAt} is not null`,
    lt(tickets.slaDueAt,now),
  )).limit(500);
  let emitted=0;
  for(const ticket of rows){
    emitted+=await db.transaction(async tx=>{
      const[ledger]=await tx.insert(ticketNotifications)
        .values({ticketId:ticket.id,kind:'webhook:overdue',recipientEmail:'n8n'})
        .onConflictDoNothing().returning({id:ticketNotifications.id});
      if(!ledger)return 0;
      return await emitTicketEvent(tx,{type:'ticket.overdue',ticket,cfg})?1:0;
    });
  }
  return emitted;
}
export const DEFAULT_LIST_LIMIT=500;export const MAX_LIST_LIMIT=2000;
/** Keyset cursor over (createdAt desc, id desc): stable while new tickets arrive, unlike an offset. */
const encodeCursor=(t:{createdAt:Date;id:number})=>Buffer.from(t.createdAt.toISOString()+'|'+t.id).toString('base64url');
function decodeCursor(cursor?:string|null){if(!cursor)return undefined;const[at,id]=Buffer.from(cursor,'base64url').toString().split('|');const when=new Date(at);const n=Number(id);if(!Number.isFinite(when.getTime())||!Number.isInteger(n))throw new ApiError('That page cursor is not valid. Reload the list.');return{when,id:n};}
export async function listTicketsPage(user?:Identity,opts:{limit?:number;cursor?:string|null}={}){
  const safeLimit=Math.max(1,Math.min(opts.limit||DEFAULT_LIST_LIMIT,MAX_LIST_LIMIT));const after=decodeCursor(opts.cursor);
  const page=after?or(lt(tickets.createdAt,after.when),and(eq(tickets.createdAt,after.when),lt(tickets.id,after.id))):undefined;
  const rows=await db.select(LIST_COLUMNS).from(tickets).where(and(ticketScope(user),page)).orderBy(desc(tickets.createdAt),desc(tickets.id)).limit(safeLimit+1);
  const more=rows.length>safeLimit;const items=more?rows.slice(0,safeLimit):rows;
  return{tickets:items,nextCursor:more?encodeCursor(items[items.length-1]):null};
}
export async function listTickets(user?:Identity,limit=DEFAULT_LIST_LIMIT){return(await listTicketsPage(user,{limit})).tickets;}
/** The link-ticket picker: a handful of rows matching a ticket number, id or title. */
export async function searchTickets(user:Identity|undefined,q:string,limit=20){
  const term=q.trim().slice(0,100);if(!term)return[];const like='%'+term.replace(/[\\%_]/g,m=>'\\'+m)+'%';const n=Number(term.replace(/^#/,''));
  const match=or(ilike(tickets.ticketNumber,like),ilike(tickets.title,like),Number.isInteger(n)&&n>0&&n<2147483647?eq(tickets.id,n):undefined);
  return db.select(LIST_COLUMNS).from(tickets).where(and(ticketScope(user),match)).orderBy(desc(tickets.createdAt)).limit(Math.max(1,Math.min(limit,50)));
}

/** Masks a member's name in list payloads when the workspace asks for it. The full record
 *  is still available on the ticket itself, to whoever is allowed to open it. */
export function maskMemberName(name:string){const parts=(name||'').trim().split(/\s+/).filter(Boolean);if(!parts.length)return 'Member';return parts[0]+(parts.length>1?' '+parts[parts.length-1][0].toUpperCase()+'.':'');}

/**
 * Raises the priority of tickets that are far enough past their follow-up target, when the
 * workspace has asked for that.
 *
 * Driven by /api/cron/outbox. The run is still claimed through app_settings so two overlapping
 * cron invocations (or a manual call) cannot both sweep. Nothing is changed for a workspace
 * that leaves escalation switched off.
 */
/**
 * Who a breached ticket goes up to.
 *
 * The owner's own reporting manager first — `staff.manager` is a free-text name, so this can
 * come back empty for a misspelling or a shared first name, which is exactly why the
 * department's standing escalation owner stays as the fallback rather than being replaced.
 *
 * `userId` is the workspace account behind that staff member, when there is one, so the
 * escalation can also raise the bell in the app and not only send mail.
 */
type EscalationTarget={id:number;name:string;email:string;userId:number|null;via:'manager'|'department'};
async function escalationTarget(tx:Tx,row:{assignedStaffId:number|null;departmentId:string|null;departmentName:string|null}):Promise<EscalationTarget|undefined>{
  const withAccount=async(person:{id:number;name:string;email:string},via:EscalationTarget['via']):Promise<EscalationTarget>=>{
    const[account]=await tx.select({id:appUsers.id}).from(appUsers).where(and(eq(appUsers.staffId,person.id),eq(appUsers.active,true)));
    return{...person,userId:account?.id??null,via};
  };
  if(row.assignedStaffId){
    const[owner]=await tx.select({manager:staff.manager}).from(staff).where(eq(staff.id,row.assignedStaffId));
    if(owner?.manager){
      const named=await findManager(owner.manager);
      if(named){
        const[manager]=await tx.select({id:staff.id,name:staff.name,email:staff.email}).from(staff).where(and(eq(staff.id,named.id),eq(staff.isActive,true)));
        if(manager)return withAccount(manager,'manager');
      }
    }
  }
  const pattern=row.departmentId?ESCALATION_OWNERS[row.departmentId]:undefined;
  if(!pattern)return undefined;
  const candidates=await tx.select({id:staff.id,name:staff.name,email:staff.email}).from(staff).where(and(eq(staff.isActive,true),eq(staff.department,row.departmentName||'')));
  const fallback=candidates.find(person=>pattern.test(person.name));
  return fallback?withAccount(fallback,'department'):undefined;
}
export async function applyEscalations(){
  const cfg=await getConfig();
  const hours=cfg.escalateAfterBreachHours;
  if(!hours)return 0;
  // Claim the run atomically: the upsert only writes when the last claim is older than five
  // minutes, so two list requests landing together cannot both sweep.
  const at=new Date();
  const claimed=await db.insert(appSettings).values({key:'escalation:lastRun',value:{at:at.toISOString()},updatedAt:at})
    .onConflictDoUpdate({target:appSettings.key,set:{value:{at:at.toISOString()},updatedAt:at},setWhere:sql`${appSettings.updatedAt} < ${new Date(at.getTime()-300000)}`})
    .returning({key:appSettings.key});
  if(!claimed.length)return 0;
  const cutoff=new Date(Date.now()-hours*3600000);
  // Raising to critical moves the follow-up target with it — the same per-subcategory rule
  // makeDraft and the PATCH route apply.
  const overrides=Object.entries(cfg.subcategoryRouting).filter(([,r])=>r.slaHours);
  const slaExpr=overrides.length?sql`(case ${tickets.category}||'|||'||${tickets.subcategory} ${sql.join(overrides.map(([k,r])=>sql`when ${k} then ${r.slaHours}::int`),sql` `)} else ${cfg.responseHours.critical}::int end)`:sql`${cfg.responseHours.critical}::int`;
  return db.transaction(async tx=>{
    const rows=await tx.update(tickets).set({priority:'critical',severity:inferSeverity('critical'),isEscalated:true,slaHours:slaExpr,slaDueAt:sql`${tickets.createdAt} + ${slaExpr} * interval '1 hour'`,version:sql`${tickets.version}+1`,updatedAt:new Date()})
      .where(and(
        eq(tickets.resolutionRequired,true),
        ne(tickets.priority,'critical'),
        sql`${tickets.status} not in ('resolved','closed','recorded')`,
        sql`${tickets.slaDueAt} is not null and ${tickets.slaDueAt} < ${cutoff}`,
      )).returning();
    if(rows.length)await tx.insert(ticketActivities).values(rows.map(r=>({ticketId:r.id,actorName:'IRIS',action:'escalated',detail:`Raised to critical — more than ${hours}h past the follow-up target.`})));
    // Raising the priority on its own leaves the ticket with the person who has already missed
    // the target. It goes up the line instead: first to the owner's own reporting manager,
    // because that is who can actually get an answer out of them, and only if there is no
    // usable manager on record to the department's standing escalation owner. Either way the
    // ticket says who it went to and who it came from.
    for(const row of rows){
      const to=await escalationTarget(tx,row);
      if(!to||to.id===row.assignedStaffId)continue;
      const from=row.assignedStaffName||'Unassigned';
      await tx.update(tickets).set({
        assignedStaffId:to.id,assignedStaffName:to.name,assignedStaffEmail:to.email,
        escalatedToStaffId:to.id,escalatedToName:to.name,escalatedAt:at,
        version:sql`${tickets.version} + 1`,
      }).where(eq(tickets.id,row.id));
      await tx.insert(ticketActivities).values({ticketId:row.id,actorName:'IRIS',action:'escalated.reassigned',detail:to.via==='manager'
        ?`Past the follow-up target with no resolution and no extension: escalated from ${from} to their reporting manager ${to.name}.`
        :`Past the follow-up target with no resolution and no extension, and no reporting manager on record for ${from}: escalated to the ${row.departmentName} escalation owner ${to.name}.`});
      // Tell the manager out of band too. A board they are not looking at is not a handover.
      // The owner it came from is copied: the ticket has left their name, and they should
      // learn that from the same message the manager reads rather than from the board.
      if(emailSendingEnabled()&&cfg.assignmentEmail&&to.email){
        const fromEmail=row.assignedStaffEmail?.trim().toLowerCase();
        await queueTicketEmails(tx,{...row,assignedStaffId:to.id,assignedStaffName:to.name,assignedStaffEmail:to.email,escalatedFromName:from},'escalated',
          [{email:to.email.trim().toLowerCase(),name:to.name,role:'manager'}],fromEmail?[{email:fromEmail,name:row.assignedStaffName,role:'owner'}]:[]);
      }
      if(to.userId)
        await tx.insert(userNotifications).values({userId:to.userId,ticketId:row.id,kind:'escalation',
          title:`${row.ticketNumber} escalated to you — past its follow-up target`,
          body:`${row.title} · was with ${from}`.slice(0,240),fromName:'IRIS'});
    }
    // No `changes` block: RETURNING gives the post-update row, so the prior priority is
    // not knowable here, and a half-true diff is worse than none.
    for(const row of rows)await emitTicketEvent(tx,{type:'ticket.escalated',ticket:row,cfg});
    return rows.length;
  });
}
/** Staff row named by a free-text `manager` field. The field holds a name (sometimes only a
 *  first name, in any case) or occasionally a staff id; an ambiguous name matches nobody. */
async function findManager(manager:string){
  const directory=await db.select({id:staff.id,externalId:staff.externalId,name:staff.name,manager:staff.manager,isActive:staff.isActive}).from(staff);
  const id=reportingManagerId(manager,directory);
  return id===null?undefined:{id};
}
/** Resolution editing is restricted to the assigned owner and direct reporting manager.
 *  Per the README there is no blanket administrator override: an admin who is neither the
 *  owner nor their manager cannot edit it. */
export async function canResolveTicket(user:{staffId:number|null;role:string;managedStaffIds?:number[]}|null,assignedStaffId:number|null,resolutionRequired:boolean):Promise<boolean>{if(!user||!resolutionRequired)return false;if(user.staffId===null||assignedStaffId===null)return false;if(user.staffId===assignedStaffId)return true;if(user.managedStaffIds)return user.managedStaffIds.includes(assignedStaffId);const[assignee]=await db.select({manager:staff.manager}).from(staff).where(eq(staff.id,assignedStaffId));if(!assignee?.manager)return false;const managerRow=await findManager(assignee.manager);return managerRow?.id===user.staffId;}
/** Single gate for resolution-workspace writes. Reads use normal ticket access. Returns the actor and the
 *  ticket so callers do not re-read either. */
export async function requireResolutionAccess(ticketId:number):Promise<{user:Identity;ticket:typeof tickets.$inferSelect}>{const user=await currentUser();const[ticket]=await db.select().from(tickets).where(eq(tickets.id,ticketId));if(!ticket)throw new ApiError('Ticket not found',404);if(!ticket.resolutionRequired)throw new ApiError('This ticket does not require a resolution.');if(!user)throw new ApiError('Sign in to edit the resolution workspace.',401);if(!canAccessTicket(user,ticket))throw new ApiError('You do not have access to this ticket resolution.',403);if(!(await canResolveTicket(user,ticket.assignedStaffId,ticket.resolutionRequired)))throw new ApiError('Only the assigned owner or their reporting manager can edit this resolution.',403);return{user,ticket};}
/** Full resolution history, readable by every signed-in user with ticket access. */
export async function getResolutionWorkspace(ticketId:number){const[[resolution],steps,followUps,contacts,attachments]=await Promise.all([
  db.select().from(ticketResolutions).where(eq(ticketResolutions.ticketId,ticketId)),
  db.select().from(ticketResolutionSteps).where(eq(ticketResolutionSteps.ticketId,ticketId)).orderBy(ticketResolutionSteps.createdAt),
  db.select().from(ticketFollowUps).where(eq(ticketFollowUps.ticketId,ticketId)).orderBy(ticketFollowUps.dueAt),
  db.select().from(ticketContactLog).where(eq(ticketContactLog.ticketId,ticketId)).orderBy(desc(ticketContactLog.contactedAt)),
  db.select({id:ticketResolutionAttachments.id,fileName:ticketResolutionAttachments.fileName,fileType:ticketResolutionAttachments.fileType,fileSize:ticketResolutionAttachments.fileSize,uploadedByName:ticketResolutionAttachments.uploadedByName,createdAt:ticketResolutionAttachments.createdAt}).from(ticketResolutionAttachments).where(eq(ticketResolutionAttachments.ticketId,ticketId)).orderBy(desc(ticketResolutionAttachments.createdAt)),
]);return{resolution:resolution||null,steps,followUps,contacts,attachments};}
/** Everything the ticket page renders. Returns null when the ticket does not exist and throws
 *  403 when the caller may not open it. */
export async function getTicketBundle(id:number,viewer?:Identity|null){const[[ticket],user]=await Promise.all([db.select().from(tickets).where(eq(tickets.id,id)),viewer===undefined?currentUser():Promise.resolve(viewer)]);if(!ticket)return null;
if(!user)throw new ApiError('Sign in to your workspace account to view this.',401);requireTicketAccess(user,ticket);
// These reads are independent of each other. Issued sequentially they cost a database
// round-trip each before anything renders; in parallel they cost one.
const[canResolve,comments,activities,similar,links,asset]=await Promise.all([
  canResolveTicket(user,ticket.assignedStaffId,ticket.resolutionRequired),
  db.select().from(ticketComments).where(eq(ticketComments.ticketId,id)).orderBy(ticketComments.createdAt),
  db.select().from(ticketActivities).where(eq(ticketActivities.ticketId,id)).orderBy(ticketActivities.createdAt),
  db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status,priority:tickets.priority}).from(tickets).where(and(eq(tickets.category,ticket.category),eq(tickets.subcategory,ticket.subcategory),ne(tickets.id,id),ticketScope(user))).orderBy(desc(tickets.createdAt)).limit(8),
  db.select().from(ticketLinks).where(or(eq(ticketLinks.ticketId,id),eq(ticketLinks.relatedId,id))),
  ticket.assetId?db.select({id:assets.id,name:assets.name,assetTag:assets.assetTag,status:assets.status,type:assets.type,studio:assets.studio}).from(assets).where(eq(assets.id,ticket.assetId)).then(rows=>rows[0]||null):Promise.resolve(null),
]);
const linkedIds=links.map(l=>l.ticketId===id?l.relatedId:l.ticketId);
// Resolution history is shared with everyone who can view this ticket.
// canResolve controls editing only; it must never suppress the documented history.
const[linked,workspace,conversationAttachments]=await Promise.all([
  linkedIds.length?db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status}).from(tickets).where(inArray(tickets.id,linkedIds)):Promise.resolve([]),
  getResolutionWorkspace(id),
  db.select({id:chatAttachments.id,fileName:chatAttachments.fileName,fileType:chatAttachments.fileType,fileSize:chatAttachments.fileSize,createdAt:chatAttachments.createdAt}).from(chatAttachments).innerJoin(chatSessions,eq(chatAttachments.sessionId,chatSessions.id)).where(eq(chatSessions.ticketId,id)),
]);
// One rule, in lib/auth, shared with the PATCH route that enforces it. The client uses this
// only to decide whether to offer the button.
const canEditDetails=canEditTicketDetails(user,ticket);
return{ticket,comments,activities,similar,linked,asset,canResolve,canEditDetails,conversationAttachments,...workspace};}

const TERMINAL=['resolved','closed'];
/** Guards every status change: record-only use of Recorded, the resolver and the saved
 *  resolution on the way to resolved/closed, and the workspace's reopen policy. */
export async function assertStatusTransition(actor:Identity,current:typeof tickets.$inferSelect,next:string,cfg:Config){
  if(next==='recorded'&&current.resolutionRequired)throw new ApiError('Only record-only feedback can use Recorded status.');
  if(TERMINAL.includes(next)&&!TERMINAL.includes(current.status)&&current.resolutionRequired){
    if(!(await canResolveTicket(actor,current.assignedStaffId,current.resolutionRequired)))throw new ApiError('Only the assigned owner or their reporting manager may resolve this ticket.',403);
    const[r]=await db.select().from(ticketResolutions).where(eq(ticketResolutions.ticketId,current.id));
    // Action taken is the only required part of the write-up: any non-empty text counts.
    if(!r?.actionTaken.trim())throw new ApiError('Record the resolution action taken first.');
  }
  // Reopening is a policy decision: some teams want resolution to be final, with a fresh
  // ticket raised instead of an old one being reopened weeks later.
  if(!TERMINAL.includes(next)&&next!=='recorded'&&TERMINAL.includes(current.status)&&!cfg.allowReopen)throw new ApiError('Reopening resolved tickets is switched off for this workspace. Log a new ticket that links to this one.',409);
}
/** resolvedAt/closedAt for a status change: closing stamps a missing resolution time too, and
 *  any non-terminal status clears both. */
export function statusTimestamps(current:{resolvedAt:Date|null;closedAt:Date|null},next:string,now=new Date()){
  if(next==='resolved')return{resolvedAt:current.resolvedAt&&current.closedAt?current.resolvedAt:now,closedAt:null};
  if(next==='closed')return{resolvedAt:current.resolvedAt??now,closedAt:current.closedAt??now};
  return{resolvedAt:null,closedAt:null};
}
/** The one way a ticket reaches resolved or closed — the ticket page, the ops radar and any
 *  future surface. Enforces access, the resolver rule, the resolution record, the reopen
 *  policy and the caller's own revision, then raises equipment recurrence checks. */
export async function resolveTicket(actor:Identity,input:{ticketId:number;version:number;status?:'resolved'|'closed';/** Other columns changed in the same save (the PATCH route). */extra?:Partial<typeof tickets.$inferInsert>;action?:string;detail?:string}){
  const status=input.status||'resolved';
  const[[current],cfg]=await Promise.all([db.select().from(tickets).where(eq(tickets.id,input.ticketId)),getConfig()]);
  if(!current)throw new ApiError('Ticket not found',404);
  requireTicketAccess(actor,current);
  if(current.version!==input.version)throw new ApiError('This ticket changed elsewhere. Refresh before saving.',409);
  await assertStatusTransition(actor,current,status,cfg);
  const now=new Date();
  const ticket=await db.transaction(async tx=>{
    const[t]=await tx.update(tickets).set({...input.extra,status,...statusTimestamps(current,status,now),version:sql`${tickets.version}+1`,updatedAt:now})
      .where(and(eq(tickets.id,input.ticketId),eq(tickets.version,input.version))).returning();
    if(!t)throw new ApiError('This ticket changed elsewhere. Refresh before saving.',409);
    await tx.insert(ticketActivities).values({ticketId:t.id,actorName:actor.name,action:input.action||'updated',detail:input.detail||`status: ${status}`,createdAt:now});
    // A resolution is one event, not a status change plus a resolution.
    await emitTicketEvent(tx,{type:'ticket.resolved',ticket:t,cfg,actor,changes:{status:{from:current.status,to:status}}});
    return t;
  });
  const followUps=TERMINAL.includes(current.status)?[]:await maybeCreateRecurrenceChecks(ticket);
  return{ticket,followUps};
}
const BIKE_PATTERN=/\b(bike|bikes|cycle|cycling|powercycle|power cycle|spin bike|pedal|flywheel|resistance knob)\b/i;
export function isPowerCycleBikeTicket(t:{title:string;description:string;subcategory:string;classFormat:string|null;category:string}):boolean{const haystack=`${t.title} ${t.description} ${t.subcategory} ${t.classFormat||''}`;if(!BIKE_PATTERN.test(haystack))return false;return['Repair and Maintenance','Tech Issues','Studio Amenities and Facilities'].includes(t.category)||/powercycle/i.test(t.classFormat||'');}
const MIC_PATTERN=/\b(mic|mics|microphone|microphones|headset mic|lapel mic|mic pack)\b/i;
const AC_PATTERN=/\b(a\.?c\.?|air ?con(?:ditioner|ditioning)?|hvac|cooling unit|ventilation)\b/i;
const EQUIPMENT_CATEGORIES_FOR_CHECKS=['Repair and Maintenance','Tech Issues','Studio Amenities and Facilities','Class Experience','Miscellaneous','Operating Systems'];
/** A studio microphone fault: the headset, handheld or its receiver. */
export function isMicTicket(t:{title:string;description:string;subcategory:string;category:string}):boolean{return MIC_PATTERN.test(`${t.title} ${t.description} ${t.subcategory}`)&&EQUIPMENT_CATEGORIES_FOR_CHECKS.includes(t.category);}
export function isAcTicket(t:{title:string;description:string;subcategory:string;category:string}):boolean{return AC_PATTERN.test(`${t.title} ${t.description} ${t.subcategory}`)&&EQUIPMENT_CATEGORIES_FOR_CHECKS.includes(t.category);}
/** The two re-checks raised when a bike, AC or mic fault is resolved: days after resolution. */
export const RECURRENCE_CHECK_DAYS=[5,10] as const;
type ResolvedTicket={createdByUserId?:number|null;createdByName?:string|null;id:number;ticketNumber:string;title:string;description:string;subcategory:string;category:string;classFormat:string|null;studio:string|null;area?:string|null;assignedStaffId:number|null;assignedStaffName:string|null;assignedStaffEmail:string|null;departmentId:string|null;departmentName:string|null;memberName:string;trainer:string|null;resolvedAt?:Date|string|null;source?:string;customFields?:Record<string,unknown>|null};
const shortDate=(d:Date)=>d.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'});
/**
 * The staff profile of whoever reported a ticket, for the bike and AC re-checks that go back
 * to them. Most accounts are linked to their directory row; for one that is not, the account's
 * email and then the name stamped on the ticket find the same person, so a missing link no
 * longer leaves the check unassigned (or with the repair owner).
 */
async function reporterStaff(t:{createdByUserId?:number|null;createdByName?:string|null}){
  const cols={id:staff.id,name:staff.name,email:staff.email};
  if(t.createdByUserId){
    const[linked]=await db.select(cols).from(appUsers).innerJoin(staff,eq(appUsers.staffId,staff.id))
      .where(and(eq(appUsers.id,t.createdByUserId),eq(appUsers.active,true),eq(staff.isActive,true)));
    if(linked)return linked;
    const[byEmail]=await db.select(cols).from(appUsers).innerJoin(staff,sql`lower(${staff.email}) = lower(${appUsers.email})`)
      .where(and(eq(appUsers.id,t.createdByUserId),eq(appUsers.active,true),eq(staff.isActive,true),ne(appUsers.email,''))).limit(1);
    if(byEmail)return byEmail;
  }
  const name=t.createdByName?.trim();
  if(name){
    const matches=await db.select(cols).from(staff).where(and(eq(staff.isActive,true),ilike(staff.name,name))).limit(2);
    // Only an unambiguous name: two people called the same thing is a guess, not a match.
    if(matches.length===1)return matches[0];
  }
  return null;
}
/** When a PowerCycle bike, AC or microphone fault is resolved, raise two child tickets for the
 *  original reporter for AC/bikes (repair owner for microphones) — due 5 and 10 days after resolution — asking the studio to confirm the
 *  fault has not come back. A check is itself never re-checked, and each is raised once:
 *  resolving, re-opening and resolving again does not duplicate them. */
export async function maybeCreateRecurrenceChecks(resolved:ResolvedTicket){
  if(resolved.customFields?.autoFollowUp)return [];
  const bike=isPowerCycleBikeTicket(resolved);const ac=!bike&&isAcTicket(resolved);const mic=!bike&&!ac&&isMicTicket(resolved);
  if(!bike&&!ac&&!mic)return [];
  const text=resolved.title+' '+resolved.description;
  const num=bike?text.match(/bike\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/i):mic?text.match(/\bmic(?:rophone)?\s*(?:no\.?|number|#)?\s*(\d{1,2})\b/i):null;
  const label=bike?(num?`Bike #${num[1]}`:'PowerCycle bike'):ac?'Air-conditioning system':(num?`Mic #${num[1]}`:'Studio microphone');
  const kind=bike?'bike':ac?'ac':'mic';
  const reporter=(bike||ac)?await reporterStaff(resolved):null;
  const owner=recurrenceOwner(kind,{id:resolved.assignedStaffId,name:resolved.assignedStaffName,email:resolved.assignedStaffEmail},reporter||null);
  const assignmentReason=(bike||ac)
    ? reporter?`Assigned to ${reporter.name}, who raised ${resolved.ticketNumber}, to verify the repair.`:`Unassigned: the original reporter of ${resolved.ticketNumber} has no active linked staff profile.`
    : `Assigned to the original microphone repair owner of ${resolved.ticketNumber}.`;
  const base=resolved.resolvedAt?new Date(resolved.resolvedAt):new Date();
  const checklist=bike
    ?['Ride-test the bike for at least 5 minutes','Confirm the original fault has not come back','Check pedal tightness (42 N·m), crank arm torque (52–57 N·m) and the saddle clamp','Test the resistance knob, SprintShift lever and power meter pairing','Ask the trainers who taught on it whether anything felt off','Resolve only once you have confirmed there is no recurrence; if it has returned, say so and escalate to the vendor']
    :ac
      ?['Run the AC through a complete cooling cycle','Record the room temperature and airflow','Confirm the original fault has not returned','Ask the studio team whether cooling dropped or fluctuated since the repair','Add a comment confirming no relapse, or describe the relapse and new symptoms before escalating to the vendor']
      :['Power the mic on and do a full sound check through the studio system','Confirm the original fault (drop-outs, crackle, no signal) has not come back','Check the battery, the pack connector and the headset cable','Ask the trainers who used it whether it cut out in class','Resolve only once you have confirmed there is no recurrence; if it has returned, say so and escalate to the vendor'];
  const created=[];
  for(const [i,days] of RECURRENCE_CHECK_DAYS.entries()){
    const key=`recheck:${resolved.id}:d${days}`;
    const[existing]=await db.select({id:tickets.id}).from(tickets).where(or(eq(tickets.submissionKey,key),eq(tickets.sourceRef,key)));
    if(existing)continue;
    const due=new Date(base.getTime()+days*864e5);const slaHours=days*24;
    // The submission key *is* the recheck key, so createTicketFromDraft's advisory lock and
    // its existing-row check both run on it: two concurrent resolves raise each check once.
    const draft:AdvancedDraft={source:'system',submissionKey:key,
      title:`[Recurrence check ${i+1} of ${RECURRENCE_CHECK_DAYS.length} · day ${days}] ${label} — confirm the fault has not returned`,
      summary:`Day-${days} re-check after ${resolved.ticketNumber} (${resolved.subcategory}) was resolved on ${shortDate(base)}. Confirm ${label.toLowerCase()} has worked without the original fault since then.`,
      description:`Automatically raised when ${resolved.ticketNumber} — "${resolved.title}" — was resolved on ${shortDate(base)}.\n\nThis is re-check ${i+1} of ${RECURRENCE_CHECK_DAYS.length}, due ${shortDate(due)} (${days} days after the resolution). Reconfirm that the issue has not happened again in that time.\n\nOriginal issue: ${resolved.description}\n\nWhat to do:\n${checklist.map((c,n)=>`${n+1}. ${c}`).join('\n')}`,
      category:resolved.category,subcategory:resolved.subcategory,kind:'issue',studio:resolved.studio||'Studio to confirm',classFormat:resolved.classFormat||undefined,trainer:resolved.trainer||undefined,membership:undefined,
      incidentAt:`Re-check due ${shortDate(due)}`,memberName:'Automated follow-up · Studio Ops',memberEmail:undefined,memberPhone:undefined,momenceMemberId:undefined,momenceSessionId:undefined,
      preferredContact:'Internal log only',requestedResolution:`Confirm ${label.toLowerCase()} has had no recurrence of the original fault since ${shortDate(base)}.`,
      priority:'medium',severity:inferSeverity('medium'),sentiment:'neutral',
      tags:['auto-follow-up','recurrence-check',`${kind}-recheck`,`day-${days}-check`],
      customFields:{area:resolved.area||resolved.customFields?.area,parentTicketId:resolved.id,parentTicketNumber:resolved.ticketNumber,autoFollowUp:true,followUpType:'recurrence-check',recheckEquipment:kind,recheckDay:days,recheckOf:RECURRENCE_CHECK_DAYS.length,recheckDueAt:due.toISOString(),firstResolvedAt:base.toISOString(),recurrenceConfirmationRequired:true,relapseDetailsAllowed:true,followUpReason:`Confirm no recurrence ${days} days after resolution`,followUpAssignment:(bike||ac)?'original-reporter':'repair-owner',originalReporterUserId:resolved.createdByUserId||null},
      assignedStaffId:owner.id,assignedStaffName:owner.name||'Unassigned',assignedStaffEmail:owner.email||'',assignedStaffRole:'Follow-up owner',
      departmentId:resolved.departmentId||'operations',departmentName:resolved.departmentName||'Operations',slaHours,slaLabel:`${days} days from the first resolution`,resolutionRequired:true,
      opsChecklist:checklist,memberFacingUpdate:'',internalBrief:`Day-${days} recurrence check for ${resolved.ticketNumber} — ${label}.`,routingReason:`Auto-raised ${days}-day recurrence check. ${assignmentReason}`};
    const{row:child,created:isNew}=await insertTicketFromDraft(draft,'system','automation',{sourceRef:key,slaDueAt:due});
    if(!isNew)continue;
    await db.insert(ticketLinks).values({ticketId:Math.min(resolved.id,child.id),relatedId:Math.max(resolved.id,child.id),relation:'child'}).onConflictDoNothing();
    await db.insert(ticketActivities).values({ticketId:child.id,actorName:'IRIS Automation',action:'created',detail:`Auto-raised from ${resolved.ticketNumber} · day-${days} recurrence check due ${shortDate(due)}. ${assignmentReason}`});
    created.push(child);
  }
  if(created.length)await db.insert(ticketActivities).values({ticketId:resolved.id,actorName:'IRIS Automation',action:'follow_up.created',detail:`Auto-raised ${created.map(c=>c.ticketNumber).join(' and ')} to confirm the ${kind} fault has not returned (${RECURRENCE_CHECK_DAYS.map(d=>d+' days').join(' and ')} after resolution).`});
  return created;
}
/** @deprecated Kept for callers of the old name; raises the recurrence checks. */
export const maybeCreateBikeFollowUp=maybeCreateRecurrenceChecks;

const EXAMPLE_COLUMNS={title:tickets.title,description:tickets.description,category:tickets.category,subcategory:tickets.subcategory,memberName:tickets.memberName};
/** Most imported history is a subject line and a thread count. Without ordering, the
 *  model is shown whichever three rows were written first — usually the emptiest. */
const RICHEST_FIRST=desc(sql`length(coalesce(${tickets.description},''))`);
const redact=(r:{description:string;memberName:string})=>r.description.replaceAll(r.memberName,'[member]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\+?\d[\d\s-]{8,}\d/g,'[phone]').slice(0,700);
/** Past tickets the model can read while drafting a new one. Closed history counts — it is
 *  the only source of "what this looked like last time" there is. */
export async function historicalExamples(category:string,subcategory:string){
const exact=await db.select(EXAMPLE_COLUMNS).from(tickets).where(and(eq(tickets.source,'history'),eq(tickets.category,category),eq(tickets.subcategory,subcategory))).orderBy(RICHEST_FIRST).limit(3);
// Only a fraction of the taxonomy has any history behind it, so an exact subcategory match
// usually returns nothing. Fall back to the category before concluding there is no precedent.
const rows=exact.length?exact:await db.select(EXAMPLE_COLUMNS).from(tickets).where(and(eq(tickets.source,'history'),eq(tickets.category,category))).orderBy(RICHEST_FIRST).limit(3);
return rows.map(r=>({category:r.category,subcategory:r.subcategory,summary:redact(r)}));}

/* ------------------------------------------------------------------ */
/* Repeats: adding a report to a ticket that is already open           */
/* ------------------------------------------------------------------ */

/** Records a second (or fifth) report of the same fault on the ticket that is already open.
 *
 *  The alternative — a fresh ticket each time — is what made recurrence invisible: four
 *  tickets about one broken aircon look like four problems, and nothing ever escalates
 *  because nothing can count. Here the repeat lands as a dated note, the count goes up, and
 *  a fault reported three times stops being routine.
 */
export async function appendRepeatReport(input: {
  ticketId: number;
  description: string;
  reporterName: string;
  collected: Record<string, unknown>;
  /** Advisory only: the count is kept by the database, never taken from the caller. */
  recurrence?: number;
}): Promise<{id: number; ticketNumber: string; priority: string; recurrence: number; escalated: boolean}> {
  const cfg = await getConfig();
  const collected = input.collected || {};
  // One transaction, with the ticket row locked: two reports landing together each get their
  // own number, and the note, the activity and the count commit together or not at all.
  return db.transaction(async (tx) => {
    const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, input.ticketId)).for('update');
    if (!ticket) throw new ApiError('That ticket no longer exists.', 404);
    const cf = (ticket.customFields || {}) as Record<string, unknown>;
    const recurrence = (Number(cf.recurrenceCount) || 1) + 1;

    const lines: string[] = [`Reported again by ${input.reporterName} (${recurrence === 2 ? 'second' : recurrence === 3 ? 'third' : `${recurrence}th`} report).`];
    const detail: string[] = [];
    const when = String(collected.incidentAt || '').trim();
    if (when) detail.push(`noticed ${when.toLowerCase()}`);
    const area = String(collected.area || '').trim();
    if (area) detail.push(area);
    const bike = String(collected.bikeNumber || '').trim();
    if (bike) detail.push(`bike #${bike}`);
    const symptom = String(collected.cycleIssueType || '').trim();
    if (symptom) detail.push(symptom);
    const blocking = String(collected.isClassImpacted || '').trim();
    if (blocking) detail.push(blocking.toLowerCase());
    const action = String(collected.cycleReporterAction || '').trim();
    if (action) detail.push(action.toLowerCase());
    if (detail.length) lines.push(detail.join(' · ') + '.');
    const narrative = String(collected.description || input.description || '').replace(/\s+/g, ' ').trim();
    if (narrative) lines.push('"' + narrative.slice(0, 600) + '"');

    const current: Priority = isPriority(ticket.priority) ? ticket.priority : 'medium';
    // A repeat that is disrupting a class outranks whatever the first report alone warranted.
    const raised = String(collected.isClassImpacted || '').startsWith('Yes') ? maxPriority(current, 'high') : current;
    // Three reports of the same thing is a chronic fault, not a snag: it needs a manager's
    // attention and a vendor, not another four-hour follow-up.
    const escalate = recurrence >= 3 && !ticket.isEscalated;
    const nextPriority = escalate ? maxPriority(raised, 'high') : raised;
    // A raised priority moves the follow-up target with it, exactly as a PATCH would.
    const slaHours = nextPriority !== current && ticket.resolutionRequired ? slaHoursFor(cfg, ticket.category, ticket.subcategory, nextPriority) : null;

    await tx.insert(ticketComments).values({
      ticketId: ticket.id,
      authorName: input.reporterName,
      authorRole: 'Studio team',
      body: lines.join('\n'),
      isInternal: true,
    });
    await tx.insert(ticketActivities).values({
      ticketId: ticket.id,
      actorName: input.reporterName,
      action: 'reported_again',
      detail: `Report #${recurrence}${nextPriority !== current ? ` · priority raised to ${nextPriority}` : ''}${escalate ? ' · escalated for repeat fault' : ''}`,
    });

    const [updated] = await tx
      .update(tickets)
      .set({
        // Incremented in SQL, not written back from the value read above.
        customFields: sql`coalesce(${tickets.customFields},'{}'::jsonb) || jsonb_build_object('recurrenceCount', coalesce((${tickets.customFields}->>'recurrenceCount')::int, 1) + 1, 'lastRepeatAt', ${new Date().toISOString()}::text)`,
        priority: nextPriority,
        severity: inferSeverity(nextPriority),
        ...(slaHours !== null ? {slaHours, slaDueAt: new Date(ticket.createdAt.getTime() + slaHours * 3600000)} : {}),
        isEscalated: ticket.isEscalated || escalate,
        version: sql`${tickets.version}+1`,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticket.id))
      .returning({id: tickets.id, ticketNumber: tickets.ticketNumber, priority: tickets.priority, customFields: tickets.customFields});

    return {
      id: updated.id,
      ticketNumber: updated.ticketNumber,
      priority: updated.priority,
      recurrence: Number((updated.customFields as Record<string, unknown>)?.recurrenceCount) || recurrence,
      escalated: escalate,
    };
  });
}

/** Notes that two tickets are about the same thing, without merging them. */
export async function linkTickets(ticketId: number, relatedId: number): Promise<void> {
  if (ticketId === relatedId) return;
  await db
    .insert(ticketLinks)
    .values([
      {ticketId, relatedId, relation: 'duplicate'},
      {ticketId: relatedId, relatedId: ticketId, relation: 'duplicate'},
    ])
    .onConflictDoNothing();
}

import {and,desc,eq,or,sql,ne,inArray} from 'drizzle-orm';
import {describeTicket} from './ticket-label';
import {randomUUID} from 'crypto';
import {db} from '@/db';
import {tickets,staff,departments,ticketActivities,ticketComments,ticketLinks,ticketResolutions,ticketResolutionSteps,ticketFollowUps,ticketContactLog,deliveryLogs} from '@/db/schema';
import {ticketInputSchema,type TicketInput,type AdvancedDraft} from './ticket-contract';
import {getConfig,getSetting,setSetting} from './config';
import {ApiError,canAccessTicket,currentUser,type Identity} from './auth';
import {CITY_OWNERS,cityOf,inferPriority,inferSeverity,studioIdsFor} from './routing';
import {buildTemplate} from './templates';
import {ticketNumberFor,slugify} from './utils';
import {scoreAssessment} from './guided-templates';
import {configuredTemplates} from './template-store';
import {indiaDate} from './display';

/** Department and owner for a category at a studio — the same rule makeDraft applies, exposed
 *  so the intake form can show who will pick a ticket up before it is filed. */
export async function resolveRouting(cfg:Awaited<ReturnType<typeof getConfig>>,category:string,studio:string,subcategory?:string){
const subRule=subcategory?cfg.subcategoryRouting[category+'|||'+subcategory]:undefined;
const departmentId=subRule?.departmentId||cfg.categoryDepartments[category]||'operations';const[dept]=await db.select().from(departments).where(eq(departments.id,departmentId));if(!dept?.active)throw new ApiError('The routing department is inactive. Ask an administrator to update the routing rule.');
const people=await db.select().from(staff).where(and(eq(staff.isActive,true),eq(staff.department,dept.name)));
const ids=studioIdsFor(studio);const override=subRule?.ownerId||cfg.routingOwners[category+'::'+studio]||cfg.routingOwners[category];
// Named city owners come after a rule an administrator set on the sub-category itself.
const city=cityOf(studio);const named=CITY_OWNERS[departmentId]?.[city||'mumbai'];
let cityOwner:typeof people[number]|undefined;
if(cfg.autoAssign&&city&&named&&!subRule?.ownerId){const candidates=named.map(re=>people.find(p=>re.test(p.name))).filter((p):p is typeof people[number]=>Boolean(p));
  if(candidates.length===1)cityOwner=candidates[0];
  else if(candidates.length>1){const load=await db.select({id:tickets.assignedStaffId,n:sql<number>`count(*)::int`}).from(tickets).where(and(inArray(tickets.assignedStaffId,candidates.map(c=>c.id)),sql`${tickets.status} not in ('resolved','closed','recorded')`)).groupBy(tickets.assignedStaffId);
    const open=(id:number)=>load.find(l=>l.id===id)?.n||0;cityOwner=[...candidates].sort((a,b)=>open(a.id)-open(b.id))[0];}}
const owner=cfg.autoAssign?(cityOwner||people.find(p=>p.id===override)||people.sort((a,b)=>{const score=(p:typeof a)=>(p.categories.includes(category)?10:0)+(p.studioId&&ids.includes(p.studioId)?8:0)+(/Head|Coordinator|Ops Manager|Chief/.test(p.role)?3:0);return score(b)-score(a);})[0]):{id:null,name:'Unassigned',email:'',role:'Department queue'};if(!owner)throw new ApiError('No active owner is available in the routing department.');
return{departmentId,dept,owner,ids,override};}
export async function makeDraft(raw:unknown):Promise<AdvancedDraft>{const input=ticketInputSchema.parse(raw);const cfg=await getConfig();if(!cfg.taxonomy[input.category]?.includes(input.subcategory))throw new ApiError('Choose a subcategory belonging to the selected category.');
const template=input.templateId?(await configuredTemplates()).find(t=>t.id===input.templateId):undefined;
if(template)for(const field of template.fields.filter(f=>f.required)){const val=input.customFields[field.id];if(val===undefined||val===null||val==='')throw new ApiError(`${field.label} is required.`);if(field.type==='rating'&&(!Number.isFinite(Number(val))||Number(val)<0||Number(val)>5))throw new ApiError(`${field.label} must be scored from 0 to 5.`);}
const calculatedScore=template?scoreAssessment(template.fields,input.customFields):null;if(calculatedScore!==null)input.customFields.evaluationScore=calculatedScore;
const praise=input.kind==='compliment'||input.kind==='feedback'&&input.sentiment==='positive';const noSla=input.resolutionRequired===false||input.kind==='assessment'||praise&&cfg.positiveNoSla;
// The intake answers ride in customFields — they are not columns on the schema — so
// they have to be read back out here or the reporter's own urgency signal never
// reaches the priority rules.
const priority=noSla?'low':input.category==='Safety and Security'?'critical':input.priority||inferPriority({category:input.category,subcategory:input.subcategory,isClassImpacted:String(input.customFields.isClassImpacted||''),isImmediateDanger:String(input.customFields.isImmediateDanger||''),impact:input.impact,memberImpact:String(input.customFields.memberImpact||''),cycleSeverity:String(input.customFields.cycleSeverity||'')});
const{departmentId,dept,owner,ids,override}=await resolveRouting(cfg,input.category,input.studio,input.subcategory);
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
const slaHours=noSla?0:(cfg.subcategoryRouting[input.category+'|||'+input.subcategory]?.slaHours??cfg.responseHours[priority]);const base=buildTemplate(input.category,input.subcategory);
const opsChecklist=noSla
  ?['Record the feedback accurately, in the reporter\u2019s own words','Share the recognition with the named team member and their manager','File under the studio\u2019s monthly highlights']
  :[`Acknowledge ${input.memberName} on ${input.preferredContact.toLowerCase()} within ${Math.max(1,Math.round(slaHours/4))}h`,...base.opsChecklist,...(input.category==='Safety and Security'?['Escalate to the studio manager on duty immediately','Record the incident in the safety register']:[]),...(input.momenceMemberId?['Check the member\u2019s Momence booking and billing history for related issues']:[]),...(String(input.customFields.memberImpact||'').toLowerCase().startsWith('yes')?[`Contact the members whose session was affected${input.customFields.impactedMembers?` (${String(input.customFields.impactedMembers).slice(0,120)})`:''} and agree the credit or makeup owed`,'Note the affected members against their Momence bookings so the front desk can see it']:[]),'Confirm the outcome with the member before closing'];
const tags=cfg.autoTag?[...new Set([slugify(input.category),slugify(input.subcategory),slugify(studioShort),input.kind,noSla?'no-sla':priority,'sentiment-'+input.sentiment,'via-'+input.source,...(input.impact?['impact-'+slugify(input.impact)]:[]),...(input.classFormat?['format-'+slugify(input.classFormat.split('+')[0])]:[]),...(input.trainer?['trainer-'+slugify(input.trainer.split(',')[0])]:[]),...(input.membership?['membership-'+slugify(input.membership)]:[]),...(input.momenceMemberId?['momence-linked']:[]),...(input.kind==='assessment'?['trainer-evaluation']:[])].filter(Boolean))]:[];
const memberFacingUpdate=praise?`Thank you${input.memberName?' , '+input.memberName.split(' ')[0]:''} for sharing this. Your feedback will be recorded for our ${dept.name} team.`:`Hi ${input.memberName.split(' ')[0]}, thank you for sharing your experience. ${owner.name} from ${dept.name} will review your request. The internal follow-up target is ${slaHours} hours; a resolution time has not yet been confirmed.`;
return{...input,title,summary,priority,severity:inferSeverity(priority),assignedStaffId:owner.id,assignedStaffName:owner.name,assignedStaffEmail:owner.email,assignedStaffRole:owner.role,departmentId,departmentName:dept.name,slaHours,slaLabel:noSla?'No SLA required':slaHours===1?'1 hour':slaHours+' hours',resolutionRequired:!noSla,tags,opsChecklist,memberFacingUpdate,internalBrief:input.description,routingReason:!cfg.autoAssign?'Automatic assignment disabled · parked in the department queue':override?`Administrator-defined routing rule for ${input.category}${cfg.routingOwners[input.category+'::'+input.studio]?' at '+studioShort:''} → ${owner.name}`:`${input.category} routes to ${dept.name}. ${owner.name} picked up as the active ${owner.role||'specialist'}${ids.length?` covering ${studioShort}`:''}, with a ${noSla?'record-only':slaHours+'h'} follow-up target at ${priority} priority.`};}

export async function createTicketFromDraft(draft:AdvancedDraft,source=draft.source,channel='workspace',external?:{sourceRef?:string;createdAt?:Date;status?:string;resolvedAt?:Date;/** A backfilled record was never worked in this system, so it carries no SLA clock. */noSla?:boolean}){const cfg=await getConfig();const submissionKey=draft.submissionKey||randomUUID();return db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${submissionKey}))`);const[existing]=await tx.select().from(tickets).where(external?.sourceRef?or(eq(tickets.submissionKey,submissionKey),eq(tickets.sourceRef,external.sourceRef)):eq(tickets.submissionKey,submissionKey));if(existing)return existing;
const now=external?.createdAt||new Date();const status=external?.status||(draft.resolutionRequired?'assigned':'recorded');const closed=['resolved','closed'].includes(status);const backfill=Boolean(external?.noSla);
const[row]=await tx.insert(tickets).values({ticketNumber:'P57-'+randomUUID(),title:draft.title,summary:draft.summary,description:draft.description,category:draft.category,subcategory:draft.subcategory,status,priority:draft.priority,severity:draft.severity,sentiment:draft.sentiment,kind:draft.kind,resolutionRequired:backfill?false:draft.resolutionRequired,impact:draft.impact,studio:draft.studio,classFormat:draft.classFormat,trainer:draft.trainer,membership:draft.membership,incidentAt:draft.incidentAt,memberName:draft.memberName,memberEmail:draft.memberEmail,memberPhone:draft.memberPhone,momenceMemberId:draft.momenceMemberId,momenceSessionId:draft.momenceSessionId,preferredContact:draft.preferredContact,requestedResolution:draft.requestedResolution,assignedStaffId:draft.assignedStaffId,assignedStaffName:draft.assignedStaffName,assignedStaffEmail:draft.assignedStaffEmail,departmentId:draft.departmentId,departmentName:draft.departmentName,slaHours:backfill?0:draft.slaHours,slaDueAt:backfill||!draft.slaHours?null:new Date(now.getTime()+draft.slaHours*3600000),source,channel,tags:draft.tags,templateId:draft.templateId,customFields:{...draft.customFields,_brief:{opsChecklist:draft.opsChecklist,memberFacingUpdate:draft.memberFacingUpdate,routingReason:draft.routingReason}},momenceContext:draft.momenceContext||null,assetId:typeof draft.customFields?.assetId==='number'?draft.customFields.assetId:null,submissionKey,sourceRef:external?.sourceRef,createdAt:now,updatedAt:now,...(closed?{resolvedAt:external?.resolvedAt||now}:{})}).returning();const number=ticketNumberFor(row.id);await tx.update(tickets).set({ticketNumber:number}).where(eq(tickets.id,row.id));await tx.insert(ticketActivities).values({ticketId:row.id,actorName:source==='history'?'History import':'IRIS',action:'created',detail:`${draft.assignedStaffName} · ${draft.departmentName} · ${backfill?'No SLA · closed historical record':draft.slaLabel}`,createdAt:now});
if(source!=='history'&&cfg.webhookOnCreate)await tx.insert(deliveryLogs).values({integrationId:'n8n',action:'webhook',payload:{event:'ticket.created',ticket:{id:row.id,ticketNumber:number,title:draft.title,priority:draft.priority,department:draft.departmentName,assignedTo:draft.assignedStaffName}}});
if(source!=='history'&&cfg.assignmentEmail&&draft.assignedStaffEmail)await tx.insert(deliveryLogs).values({integrationId:'mailtrap',action:'send',payload:{to:[{email:draft.assignedStaffEmail}],subject:`Assigned: ${number}`,text:`${draft.title}\n\nA ticket has been assigned to you in IRIS. Please sign in to review it.`}});
return{...row,ticketNumber:number};});}
/** List views never read `customFields` or the long-form text, which are ~85% of the
 *  table's bytes. Selecting only the rendered columns keeps this response small. */
const LIST_COLUMNS={id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status,priority:tickets.priority,category:tickets.category,subcategory:tickets.subcategory,studio:tickets.studio,memberName:tickets.memberName,assignedStaffId:tickets.assignedStaffId,assignedStaffName:tickets.assignedStaffName,departmentName:tickets.departmentName,createdByUserId:tickets.createdByUserId,kind:tickets.kind,source:tickets.source,resolutionRequired:tickets.resolutionRequired,slaDueAt:tickets.slaDueAt,resolvedAt:tickets.resolvedAt,createdAt:tickets.createdAt,updatedAt:tickets.updatedAt,version:tickets.version};
export async function listTickets(user?:Identity,limit=2000){
  const safeLimit=Math.max(1,Math.min(limit,2000));
  const scope=!user||user.role==='admin'?undefined:user.role==='agent'
    ? or(user.staffId===null?undefined:eq(tickets.assignedStaffId,user.staffId),eq(tickets.createdByUserId,user.id))
    : and(user.department?eq(tickets.departmentName,user.department):undefined,user.studio?eq(tickets.studio,user.studio):undefined,user.department||user.studio?undefined:sql`false`);
  return db.select(LIST_COLUMNS).from(tickets).where(scope).orderBy(desc(tickets.createdAt)).limit(safeLimit);
}

/** Masks a member's name in list payloads when the workspace asks for it. The full record
 *  is still available on the ticket itself, to whoever is allowed to open it. */
export function maskMemberName(name:string){const parts=(name||'').trim().split(/\s+/).filter(Boolean);if(!parts.length)return 'Member';return parts[0]+(parts.length>1?' '+parts[parts.length-1][0].toUpperCase()+'.':'');}

/**
 * Raises the priority of tickets that are far enough past their follow-up target, when the
 * workspace has asked for that.
 *
 * There is no scheduler in this deployment, so the sweep runs off the ticket list — but at
 * most once every few minutes, recorded in app_settings, so a busy board does not run it on
 * every request. Nothing is changed for a workspace that leaves escalation switched off.
 */
export async function applyEscalations(){
  const cfg=await getConfig();
  const hours=cfg.escalateAfterBreachHours;
  if(!hours)return 0;
  const last=await getSetting('escalation:lastRun');
  const lastRun=typeof last?.value?.at==='string'?new Date(last.value.at as string).getTime():0;
  if(Date.now()-lastRun<300000)return 0;
  await setSetting('escalation:lastRun',{at:new Date().toISOString()});
  const cutoff=new Date(Date.now()-hours*3600000);
  const rows=await db.update(tickets).set({priority:'critical',severity:inferSeverity('critical'),isEscalated:true,updatedAt:new Date()})
    .where(and(
      eq(tickets.resolutionRequired,true),
      ne(tickets.priority,'critical'),
      sql`${tickets.status} not in ('resolved','closed','recorded')`,
      sql`${tickets.slaDueAt} is not null and ${tickets.slaDueAt} < ${cutoff}`,
    )).returning({id:tickets.id});
  for(const r of rows)await db.insert(ticketActivities).values({ticketId:r.id,actorName:'IRIS',action:'escalated',detail:`Raised to critical — more than ${hours}h past the follow-up target.`});
  return rows.length;
}
/** Resolution is private to the assigned owner, that owner's direct reporting
 *  manager, or an administrator. Admins are granted unconditionally: they are
 *  frequently not linked to a staff profile at all, which previously locked the
 *  people responsible for the workspace out of every resolution in it. */
export async function canResolveTicket(user:{staffId:number|null;role:string}|null,assignedStaffId:number|null,resolutionRequired:boolean):Promise<boolean>{if(!user||!resolutionRequired)return false;if(user.role==='admin'||user.role==='manager')return true;if(user.role!=='agent'||user.staffId===null||assignedStaffId===null)return false;if(user.staffId===assignedStaffId)return true;const[assignee]=await db.select({manager:staff.manager}).from(staff).where(eq(staff.id,assignedStaffId));if(!assignee?.manager)return false;const[managerRow]=await db.select({id:staff.id}).from(staff).where(eq(staff.name,assignee.manager));return managerRow?.id===user.staffId;}
/** Single gate for every resolution-workspace write. Returns the actor and the
 *  ticket so callers do not re-read either. */
export async function requireResolutionAccess(ticketId:number):Promise<{user:Identity;ticket:typeof tickets.$inferSelect}>{const user=await currentUser();const[ticket]=await db.select().from(tickets).where(eq(tickets.id,ticketId));if(!ticket)throw new ApiError('Ticket not found',404);if(!ticket.resolutionRequired)throw new ApiError('This ticket does not require a resolution.');if(!user)throw new ApiError('Sign in to open the resolution workspace.',401);if(!canAccessTicket(user,ticket))throw new ApiError('You do not have access to this ticket resolution.',403);return{user,ticket};}
/** The full private workspace payload. Only ever called once access is proven. */
export async function getResolutionWorkspace(ticketId:number){const[[resolution],steps,followUps,contacts]=await Promise.all([
  db.select().from(ticketResolutions).where(eq(ticketResolutions.ticketId,ticketId)),
  db.select().from(ticketResolutionSteps).where(eq(ticketResolutionSteps.ticketId,ticketId)).orderBy(ticketResolutionSteps.createdAt),
  db.select().from(ticketFollowUps).where(eq(ticketFollowUps.ticketId,ticketId)).orderBy(ticketFollowUps.dueAt),
  db.select().from(ticketContactLog).where(eq(ticketContactLog.ticketId,ticketId)).orderBy(desc(ticketContactLog.contactedAt)),
]);return{resolution:resolution||null,steps,followUps,contacts};}
export async function getTicketBundle(id:number){const[[ticket],user]=await Promise.all([db.select().from(tickets).where(eq(tickets.id,id)),currentUser()]);if(!ticket)return null;
// These six reads are independent of each other. Issued sequentially they cost six database
// round-trips before anything renders; in parallel they cost one.
const[canResolve,comments,activities,similar,links]=await Promise.all([
  canResolveTicket(user,ticket.assignedStaffId,ticket.resolutionRequired),
  db.select().from(ticketComments).where(eq(ticketComments.ticketId,id)).orderBy(ticketComments.createdAt),
  db.select().from(ticketActivities).where(eq(ticketActivities.ticketId,id)).orderBy(ticketActivities.createdAt),
  db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status,priority:tickets.priority}).from(tickets).where(and(eq(tickets.category,ticket.category),eq(tickets.subcategory,ticket.subcategory),ne(tickets.id,id))).orderBy(desc(tickets.createdAt)).limit(8),
  db.select().from(ticketLinks).where(or(eq(ticketLinks.ticketId,id),eq(ticketLinks.relatedId,id))),
]);
const linkedIds=links.map(l=>l.ticketId===id?l.relatedId:l.ticketId);
// The resolution record is readable by anyone who can open the ticket: hiding
// the work already done just makes colleagues re-ask. `canResolve` stays the
// gate on *writing* it.
const[linked,workspace]=await Promise.all([
  linkedIds.length?db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status}).from(tickets).where(inArray(tickets.id,linkedIds)):Promise.resolve([]),
  getResolutionWorkspace(id),
]);
return{ticket,comments,activities,similar,linked,canResolve,...workspace};}
const BIKE_PATTERN=/\b(bike|bikes|cycle|cycling|powercycle|power cycle|spin bike|pedal|flywheel|resistance knob)\b/i;
export function isPowerCycleBikeTicket(t:{title:string;description:string;subcategory:string;classFormat:string|null;category:string}):boolean{const haystack=`${t.title} ${t.description} ${t.subcategory} ${t.classFormat||''}`;if(!BIKE_PATTERN.test(haystack))return false;return['Repair and Maintenance','Tech Issues','Studio Amenities and Facilities'].includes(t.category)||/powercycle/i.test(t.classFormat||'');}
const MIC_PATTERN=/\b(mic|mics|microphone|microphones|headset mic|lapel mic|mic pack)\b/i;
const EQUIPMENT_CATEGORIES_FOR_CHECKS=['Repair and Maintenance','Tech Issues','Studio Amenities and Facilities','Class Experience','Miscellaneous','Operating Systems'];
/** A studio microphone fault: the headset, handheld or its receiver. */
export function isMicTicket(t:{title:string;description:string;subcategory:string;category:string}):boolean{return MIC_PATTERN.test(`${t.title} ${t.description} ${t.subcategory}`)&&EQUIPMENT_CATEGORIES_FOR_CHECKS.includes(t.category);}
/** The two re-checks raised when a bike or mic fault is resolved: days after resolution. */
export const RECURRENCE_CHECK_DAYS=[5,10] as const;
type ResolvedTicket={id:number;ticketNumber:string;title:string;description:string;subcategory:string;category:string;classFormat:string|null;studio:string|null;assignedStaffId:number|null;assignedStaffName:string|null;assignedStaffEmail:string|null;departmentId:string|null;departmentName:string|null;memberName:string;trainer:string|null;resolvedAt?:Date|string|null;source?:string;customFields?:Record<string,unknown>|null};
const shortDate=(d:Date)=>d.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'});
/** When a PowerCycle bike or a microphone fault is resolved, raise two child tickets for the
 *  same owner — due 5 and 10 days after the resolution — asking the studio to confirm the
 *  fault has not come back. A check is itself never re-checked, and each is raised once:
 *  resolving, re-opening and resolving again does not duplicate them. */
export async function maybeCreateRecurrenceChecks(resolved:ResolvedTicket){
  if(resolved.customFields?.autoFollowUp)return [];
  const bike=isPowerCycleBikeTicket(resolved);const mic=!bike&&isMicTicket(resolved);
  if(!bike&&!mic)return [];
  const text=resolved.title+' '+resolved.description;
  const num=bike?text.match(/bike\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/i):text.match(/\bmic(?:rophone)?\s*(?:no\.?|number|#)?\s*(\d{1,2})\b/i);
  const label=bike?(num?`Bike #${num[1]}`:'PowerCycle bike'):(num?`Mic #${num[1]}`:'Studio microphone');
  const kind=bike?'bike':'mic';
  const base=resolved.resolvedAt?new Date(resolved.resolvedAt):new Date();
  const checklist=bike
    ?['Ride-test the bike for at least 5 minutes','Confirm the original fault has not come back','Check pedal tightness (42 N·m), crank arm torque (52–57 N·m) and the saddle clamp','Test the resistance knob, SprintShift lever and power meter pairing','Ask the trainers who taught on it whether anything felt off','Resolve only once you have confirmed there is no recurrence; if it has returned, say so and escalate to the vendor']
    :['Power the mic on and do a full sound check through the studio system','Confirm the original fault (drop-outs, crackle, no signal) has not come back','Check the battery, the pack connector and the headset cable','Ask the trainers who used it whether it cut out in class','Resolve only once you have confirmed there is no recurrence; if it has returned, say so and escalate to the vendor'];
  const created=[];
  for(const [i,days] of RECURRENCE_CHECK_DAYS.entries()){
    const key=`recheck:${resolved.id}:d${days}`;
    const[existing]=await db.select({id:tickets.id}).from(tickets).where(eq(tickets.submissionKey,key));
    if(existing)continue;
    const due=new Date(base.getTime()+days*864e5);const slaHours=days*24;
    const draft:AdvancedDraft={source:'system',
      title:`[Recurrence check ${i+1} of ${RECURRENCE_CHECK_DAYS.length} · day ${days}] ${label} — confirm the fault has not returned`,
      summary:`Day-${days} re-check after ${resolved.ticketNumber} (${resolved.subcategory}) was resolved on ${shortDate(base)}. Confirm ${label.toLowerCase()} has worked without the original fault since then.`,
      description:`Automatically raised when ${resolved.ticketNumber} — "${resolved.title}" — was resolved on ${shortDate(base)}.\n\nThis is re-check ${i+1} of ${RECURRENCE_CHECK_DAYS.length}, due ${shortDate(due)} (${days} days after the resolution). Reconfirm that the issue has not happened again in that time.\n\nOriginal issue: ${resolved.description}\n\nWhat to do:\n${checklist.map((c,n)=>`${n+1}. ${c}`).join('\n')}`,
      category:resolved.category,subcategory:resolved.subcategory,kind:'issue',studio:resolved.studio||'Studio to confirm',classFormat:resolved.classFormat||undefined,trainer:resolved.trainer||undefined,membership:undefined,
      incidentAt:`Re-check due ${shortDate(due)}`,memberName:'Automated follow-up · Studio Ops',memberEmail:undefined,memberPhone:undefined,momenceMemberId:undefined,momenceSessionId:undefined,
      preferredContact:'Internal log only',requestedResolution:`Confirm ${label.toLowerCase()} has had no recurrence of the original fault since ${shortDate(base)}.`,
      priority:'medium',severity:inferSeverity('medium'),sentiment:'neutral',
      tags:['auto-follow-up','recurrence-check',`${kind}-recheck`,`day-${days}-check`],
      customFields:{parentTicketId:resolved.id,parentTicketNumber:resolved.ticketNumber,autoFollowUp:true,followUpType:'recurrence-check',recheckEquipment:kind,recheckDay:days,recheckOf:RECURRENCE_CHECK_DAYS.length,recheckDueAt:due.toISOString(),firstResolvedAt:base.toISOString(),followUpReason:`Confirm no recurrence ${days} days after resolution`},
      assignedStaffId:resolved.assignedStaffId,assignedStaffName:resolved.assignedStaffName||'Unassigned',assignedStaffEmail:resolved.assignedStaffEmail||'',assignedStaffRole:'Follow-up owner',
      departmentId:resolved.departmentId||'operations',departmentName:resolved.departmentName||'Operations',slaHours,slaLabel:`${days} days from the first resolution`,resolutionRequired:true,
      opsChecklist:checklist,memberFacingUpdate:'',internalBrief:`Day-${days} recurrence check for ${resolved.ticketNumber} — ${label}.`,routingReason:`Auto-raised ${days}-day recurrence check, same owner as ${resolved.ticketNumber}.`};
    const child=await createTicketFromDraft(draft,'system','automation',{sourceRef:key});
    await db.update(tickets).set({slaDueAt:due,submissionKey:key}).where(eq(tickets.id,child.id));
    await db.insert(ticketLinks).values({ticketId:Math.min(resolved.id,child.id),relatedId:Math.max(resolved.id,child.id),relation:'child'}).onConflictDoNothing();
    await db.insert(ticketActivities).values({ticketId:child.id,actorName:'IRIS Automation',action:'created',detail:`Auto-raised from ${resolved.ticketNumber} · day-${days} recurrence check due ${shortDate(due)}.`});
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

const PRIORITY_FLOOR: Record<string, number> = {low: 0, medium: 1, high: 2, critical: 3};

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
  recurrence: number;
}): Promise<{id: number; ticketNumber: string; priority: string; recurrence: number; escalated: boolean}> {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId));
  if (!ticket) throw new ApiError('That ticket no longer exists.', 404);
  const cf = (ticket.customFields || {}) as Record<string, unknown>;
  const recurrence = Math.max(input.recurrence, (Number(cf.recurrenceCount) || 1) + 1);
  const collected = input.collected || {};

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

  // A repeat that is disrupting a class outranks whatever the first report alone warranted.
  const floor = String(collected.isClassImpacted || '').startsWith('Yes') ? 'high' : undefined;
  const raised = floor && PRIORITY_FLOOR[floor] > (PRIORITY_FLOOR[ticket.priority] ?? 1) ? floor : ticket.priority;
  // Three reports of the same thing is a chronic fault, not a snag: it needs a manager's
  // attention and a vendor, not another four-hour follow-up.
  const escalate = recurrence >= 3 && !ticket.isEscalated;
  const nextPriority = escalate && PRIORITY_FLOOR['high'] > (PRIORITY_FLOOR[raised] ?? 1) ? 'high' : raised;

  await db.insert(ticketComments).values({
    ticketId: ticket.id,
    authorName: input.reporterName,
    authorRole: 'Studio team',
    body: lines.join('\n'),
    isInternal: true,
  });
  await db.insert(ticketActivities).values({
    ticketId: ticket.id,
    actorName: input.reporterName,
    action: 'reported_again',
    detail: `Report #${recurrence}${nextPriority !== ticket.priority ? ` · priority raised to ${nextPriority}` : ''}${escalate ? ' · escalated for repeat fault' : ''}`,
  });

  const [updated] = await db
    .update(tickets)
    .set({
      customFields: {...cf, recurrenceCount: recurrence, lastRepeatAt: new Date().toISOString()},
      priority: nextPriority,
      severity: inferSeverity(nextPriority as 'low' | 'medium' | 'high' | 'critical'),
      isEscalated: ticket.isEscalated || escalate,
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticket.id))
    .returning({id: tickets.id, ticketNumber: tickets.ticketNumber, priority: tickets.priority});

  return {
    id: updated.id,
    ticketNumber: updated.ticketNumber,
    priority: updated.priority,
    recurrence,
    escalated: escalate,
  };
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

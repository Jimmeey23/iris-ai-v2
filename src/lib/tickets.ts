import {and,desc,eq,or,sql,ne,inArray} from 'drizzle-orm';
import {randomUUID} from 'crypto';
import {db} from '@/db';
import {tickets,staff,departments,ticketActivities,ticketComments,ticketLinks,ticketResolutions,deliveryLogs} from '@/db/schema';
import {ticketInputSchema,type TicketInput,type AdvancedDraft} from './ticket-contract';
import {getConfig} from './config';
import {ApiError,currentUser} from './auth';
import {inferPriority,inferSeverity,studioIdsFor} from './routing';
import {buildTemplate} from './templates';
import {ticketNumberFor,slugify} from './utils';
import {scoreAssessment} from './guided-templates';
import {configuredTemplates} from './template-store';

export async function makeDraft(raw:unknown):Promise<AdvancedDraft>{const input=ticketInputSchema.parse(raw);const cfg=await getConfig();if(!cfg.taxonomy[input.category]?.includes(input.subcategory))throw new ApiError('Choose a subcategory belonging to the selected category.');
const template=input.templateId?(await configuredTemplates()).find(t=>t.id===input.templateId):undefined;
if(template)for(const field of template.fields.filter(f=>f.required)){const val=input.customFields[field.id];if(val===undefined||val===null||val==='')throw new ApiError(`${field.label} is required.`);if(field.type==='rating'&&(!Number.isFinite(Number(val))||Number(val)<0||Number(val)>5))throw new ApiError(`${field.label} must be scored from 0 to 5.`);}
const calculatedScore=template?scoreAssessment(template.fields,input.customFields):null;if(calculatedScore!==null)input.customFields.evaluationScore=calculatedScore;
const praise=input.kind==='compliment'||input.kind==='feedback'&&input.sentiment==='positive';const noSla=input.kind==='assessment'||praise&&cfg.positiveNoSla;
// The intake answers ride in customFields — they are not columns on the schema — so
// they have to be read back out here or the reporter's own urgency signal never
// reaches the priority rules.
const priority=noSla?'low':input.category==='Safety and Security'?'critical':input.priority||inferPriority({category:input.category,subcategory:input.subcategory,isClassImpacted:String(input.customFields.isClassImpacted||''),isImmediateDanger:String(input.customFields.isImmediateDanger||''),impact:input.impact,memberImpact:String(input.customFields.memberImpact||''),cycleSeverity:String(input.customFields.cycleSeverity||'')});
const departmentId=cfg.categoryDepartments[input.category]||'operations';const[dept]=await db.select().from(departments).where(eq(departments.id,departmentId));if(!dept?.active)throw new ApiError('The routing department is inactive. Ask an administrator to update the routing rule.');
const people=await db.select().from(staff).where(and(eq(staff.isActive,true),eq(staff.department,dept.name)));
const ids=studioIdsFor(input.studio);const override=cfg.routingOwners[input.category+'::'+input.studio]||cfg.routingOwners[input.category];
const owner=cfg.autoAssign?(people.find(p=>p.id===override)||people.sort((a,b)=>{const score=(p:typeof a)=>(p.categories.includes(input.category)?10:0)+(p.studioId&&ids.includes(p.studioId)?8:0)+(/Head|Coordinator|Ops Manager|Chief/.test(p.role)?3:0);return score(b)-score(a);})[0]):{id:null,name:'Unassigned',email:'',role:'Department queue'};if(!owner)throw new ApiError('No active owner is available in the routing department.');
const studioShort=input.studio.split(',')[0].trim();
// A title that reads on its own in a list: what kind of entry, what it is about, and where.
const title=input.title?.trim()||[praise?'Member appreciation':input.subcategory,input.classFormat?.split('+')[0].trim(),studioShort].filter(Boolean).join(' · ');
// The summary is what every list, card and digest shows instead of the full description, so
// it carries the who/where/when the description usually assumes.
const narrative=input.description.replace(/\s+/g,' ').trim();
const summary=input.summary?.trim()||[`${input.kind==='issue'?'Reported':'Logged'} by ${input.memberName} at ${studioShort}`,input.classFormat?`during ${input.classFormat}${input.trainer?` with ${input.trainer}`:''}`:null,input.incidentAt?`(${input.incidentAt})`:null].filter(Boolean).join(' ')+' — '+narrative.slice(0,280)+(narrative.length>280?'…':'');
const slaHours=noSla?0:cfg.responseHours[priority];const base=buildTemplate(input.category,input.subcategory);
const opsChecklist=noSla
  ?['Record the feedback accurately, in the reporter\u2019s own words','Share the recognition with the named team member and their manager','File under the studio\u2019s monthly highlights']
  :[`Acknowledge ${input.memberName} on ${input.preferredContact.toLowerCase()} within ${Math.max(1,Math.round(cfg.responseHours[priority]/4))}h`,...base.opsChecklist,...(input.category==='Safety and Security'?['Escalate to the studio manager on duty immediately','Record the incident in the safety register']:[]),...(input.momenceMemberId?['Check the member\u2019s Momence booking and billing history for related issues']:[]),...(String(input.customFields.memberImpact||'').toLowerCase().startsWith('yes')?[`Contact the members whose session was affected${input.customFields.impactedMembers?` (${String(input.customFields.impactedMembers).slice(0,120)})`:''} and agree the credit or makeup owed`,'Note the affected members against their Momence bookings so the front desk can see it']:[]),'Confirm the outcome with the member before closing'];
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
const LIST_COLUMNS={id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status,priority:tickets.priority,category:tickets.category,subcategory:tickets.subcategory,studio:tickets.studio,memberName:tickets.memberName,assignedStaffId:tickets.assignedStaffId,assignedStaffName:tickets.assignedStaffName,departmentName:tickets.departmentName,kind:tickets.kind,source:tickets.source,resolutionRequired:tickets.resolutionRequired,slaDueAt:tickets.slaDueAt,resolvedAt:tickets.resolvedAt,createdAt:tickets.createdAt,version:tickets.version};
export async function listTickets(){return db.select(LIST_COLUMNS).from(tickets).orderBy(desc(tickets.createdAt)).limit(2000);}
/** Resolution is private to the assigned owner or that owner's direct reporting manager. */
export async function canResolveTicket(user:{staffId:number|null;role:string}|null,assignedStaffId:number|null,resolutionRequired:boolean):Promise<boolean>{if(!user||!resolutionRequired||user.staffId===null||assignedStaffId===null)return false;if(!['admin','agent'].includes(user.role))return false;if(user.staffId===assignedStaffId)return true;const[assignee]=await db.select({manager:staff.manager}).from(staff).where(eq(staff.id,assignedStaffId));if(!assignee?.manager)return false;const[managerRow]=await db.select({id:staff.id}).from(staff).where(eq(staff.name,assignee.manager));return managerRow?.id===user.staffId;}
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
const[linked,[resolution]]=await Promise.all([
  linkedIds.length?db.select({id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,status:tickets.status}).from(tickets).where(inArray(tickets.id,linkedIds)):Promise.resolve([]),
  canResolve?db.select().from(ticketResolutions).where(eq(ticketResolutions.ticketId,id)):Promise.resolve([]),
]);
return{ticket,comments,activities,similar,linked,canResolve,resolution:resolution||null};}
const BIKE_PATTERN=/\b(bike|bikes|cycle|cycling|powercycle|power cycle|spin bike|pedal|flywheel|resistance knob)\b/i;
export function isPowerCycleBikeTicket(t:{title:string;description:string;subcategory:string;classFormat:string|null;category:string}):boolean{const haystack=`${t.title} ${t.description} ${t.subcategory} ${t.classFormat||''}`;if(!BIKE_PATTERN.test(haystack))return false;return['Repair and Maintenance','Tech Issues','Studio Amenities and Facilities'].includes(t.category)||/powercycle/i.test(t.classFormat||'');}
/** When a PowerCycle bike malfunction ticket is resolved, auto-raise a 1-week (168h) post-service audit follow-up for the same owner. */
export async function maybeCreateBikeFollowUp(resolved:{id:number;ticketNumber:string;title:string;description:string;subcategory:string;category:string;classFormat:string|null;studio:string|null;assignedStaffId:number|null;assignedStaffName:string|null;assignedStaffEmail:string|null;departmentId:string|null;departmentName:string|null;memberName:string;trainer:string|null}){
  if(!isPowerCycleBikeTicket(resolved))return null;
  const[existing]=await db.select({id:tickets.id}).from(tickets).where(eq(tickets.submissionKey,'bike-followup:'+resolved.id));
  if(existing)return null;
  const slaHours=168;const now=new Date();
  // Extract bike number from title or description for child ticket naming
  const bikeMatch=(resolved.title+' '+resolved.description).match(/bike\s*#?\s*(\d+)/i);
  const bikeLabel=bikeMatch?`Bike #${bikeMatch[1]}`:`Ticket ${resolved.ticketNumber}`;
  const draft:AdvancedDraft={source:'system',title:`[Post-Service Audit] ${bikeLabel} — 1-Week Quality & Tightness Check`,summary:`Automatic 1-week post-service audit following resolution of ${resolved.ticketNumber} (${resolved.subcategory}). Confirm the bike/equipment is still functioning correctly after the repair.`,description:`This is an automatically generated 1-week (168-hour) post-service audit ticket linked to ${resolved.ticketNumber} — "${resolved.title}".\n\nOriginal issue: ${resolved.description}\n\nAction required:\n1. Physically inspect ${bikeLabel} — check all bolts, connections, and moving parts\n2. Verify the original fault has not recurred\n3. Check pedal tightness (42 N·m), crank arm torque (52–57 N·m), saddle clamp (13mm)\n4. Test resistance knob, SprintShift lever, and power meter pairing\n5. Confirm bike is safe for member use\n6. Mark this ticket resolved only after a full ride test confirms all-clear`,category:resolved.category,subcategory:resolved.subcategory,kind:'issue',studio:resolved.studio||'Studio to confirm',classFormat:resolved.classFormat||undefined,trainer:resolved.trainer||undefined,membership:undefined,incidentAt:'Scheduled 1 week after resolution',memberName:'Automated follow-up · Studio Ops',memberEmail:undefined,memberPhone:undefined,momenceMemberId:undefined,momenceSessionId:undefined,preferredContact:'Internal log only',requestedResolution:'Confirm no relapse of the original bike fault after 1 week; full tightness and safety check required.',priority:'medium',severity:inferSeverity('medium'),sentiment:'neutral',tags:['auto-follow-up','powercycle-post-service-audit','1-week-check','stages-sc3'],customFields:{parentTicketId:resolved.id,parentTicketNumber:resolved.ticketNumber,autoFollowUp:true,followUpReason:'PowerCycle bike 1-week post-service audit',followUpType:'post-service-audit'},assignedStaffId:resolved.assignedStaffId,assignedStaffName:resolved.assignedStaffName||'Unassigned',assignedStaffEmail:resolved.assignedStaffEmail||'',assignedStaffRole:'Follow-up owner',departmentId:resolved.departmentId||'operations',departmentName:resolved.departmentName||'Operations',slaHours,slaLabel:slaHours+' hours (1 week)',resolutionRequired:true,opsChecklist:['Physically inspect the bike — check all bolts, connections, and moving parts','Verify pedal tightness (42 N·m) and crank arm torque (52–57 N·m)','Test resistance knob full range, SprintShift lever engagement','Verify power meter pairing and zero reset (ADC 790–990)','Confirm no repeat of the original fault','Complete a full ride test — minimum 5 minutes','Log findings in the resolution notes','Escalate to maintenance vendor if any issue has recurred'],memberFacingUpdate:'',internalBrief:`1-week post-service audit for ${resolved.ticketNumber} — ${bikeLabel}.`,routingReason:'Auto-raised 1-week (168h) post-service audit, same owner as the original bike ticket.'};
  const child=await createTicketFromDraft(draft,'system','automation',{sourceRef:'bike-followup:'+resolved.id});
  await db.update(tickets).set({slaDueAt:new Date(now.getTime()+slaHours*3600000),submissionKey:'bike-followup:'+resolved.id}).where(eq(tickets.id,child.id));
  await db.insert(ticketLinks).values({ticketId:Math.min(resolved.id,child.id),relatedId:Math.max(resolved.id,child.id),relation:'child'}).onConflictDoNothing();
  await db.insert(ticketActivities).values({ticketId:resolved.id,actorName:'IRIS Automation',action:'follow_up.created',detail:`Auto-raised ${child.ticketNumber} as a 1-week post-service audit (168h SLA).`});
  await db.insert(ticketActivities).values({ticketId:child.id,actorName:'IRIS Automation',action:'created',detail:`Auto-raised from ${resolved.ticketNumber} · 1-week post-service audit due ${new Date(now.getTime()+slaHours*3600000).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'})}.`});
  return child;
}

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

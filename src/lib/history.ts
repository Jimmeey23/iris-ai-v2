import {readFile} from 'fs/promises';
import {createHash} from 'crypto';
import {eq} from 'drizzle-orm';
import {db} from '@/db';import {tickets,importRuns} from '@/db/schema';
import {makeDraft,createTicketFromDraft} from './tickets';import {ApiError} from './auth';import {obj} from './momence';import {isCxExport,fromCxExport} from './history-mapping';
/**
 * Imports past records as tickets.
 *
 * `close` (the default) files them as closed history rather than live work. A backfilled
 * record is context, not an action: it was never worked in this system, so giving it a
 * status and an SLA clock would put hundreds of years-old overdue items on the board and
 * flatten the SLA compliance figures. The original status stays under `customFields`.
 */
export async function importHistory(input?:unknown,source='data/historic-tickets.json',options:{close?:boolean}={}){
const close=options.close!==false;
if(input===undefined){try{input=JSON.parse(await readFile(process.cwd()+'/data/historic-tickets.json','utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new ApiError('data/historic-tickets.json is not present. Upload the JSON file here to import it.',404);throw e;}}
const root=obj(input);const rows=Array.isArray(input)?input:root.tickets||root.data||root.records;if(!Array.isArray(rows))throw new ApiError('Expected a JSON array, or an object with a tickets array.');if(rows.length>10000)throw new ApiError('Import at most 10,000 records at a time.');let imported=0,skipped=0;const errors:string[]=[];
for(let i=0;i<rows.length;i++){try{const r=obj(rows[i]);
if(isCxExport(r)){const m=fromCxExport(r);const[dup]=await db.select({id:tickets.id}).from(tickets).where(eq(tickets.sourceRef,m.sourceRef));if(dup){skipped++;continue;}
const cxDraft=await makeDraft({...m.input,customFields:{...m.input.customFields,historicSource:source,...(close?{closedOnImport:true}:{})}});
const when=new Date(m.createdAt);const closedAt=new Date(m.resolvedAt||m.createdAt);
const created=await createTicketFromDraft(cxDraft,'history','import',{sourceRef:m.sourceRef,status:close?'closed':m.status,createdAt:Number.isFinite(when.getTime())?when:undefined,resolvedAt:close&&Number.isFinite(closedAt.getTime())?closedAt:undefined,noSla:close});
if(m.escalated)await db.update(tickets).set({isEscalated:true}).where(eq(tickets.id,created.id));
imported++;continue;}
const sourceRef='historic:'+String(r.id||r.ticketNumber||r.ticket_number||createHash('sha256').update(JSON.stringify(r)).digest('hex'));const[existing]=await db.select({id:tickets.id}).from(tickets).where(eq(tickets.sourceRef,sourceRef));if(existing){skipped++;continue;}
let category=String(r.category||'');if(category==='Booking & Schedule')category='Scheduling';const text=String(r.description||r.summary||r.conversation_summary||'');const draft=await makeDraft({title:r.title,description:text,summary:r.summary,category,subcategory:r.subcategory||r.sub_category||r.subCategory,kind:String(r.kind||'issue').toLowerCase(),studio:r.studio||r.location,memberName:r.memberName||r.member_name||r.reported_by||'Historical report',memberEmail:r.memberEmail||r.member_email||'',memberPhone:r.memberPhone||r.member_phone||undefined,classFormat:r.classFormat||r.class_type||undefined,trainer:r.trainer||undefined,incidentAt:r.incidentAt||r.class_date_time||r.created_at||r.createdAt||'Not recorded',source:'history',priority:r.priority?String(r.priority).toLowerCase():undefined,sentiment:['positive','negative','neutral','frustrated'].includes(String(r.sentiment).toLowerCase())?String(r.sentiment).toLowerCase():'neutral',customFields:{historicSource:source,historicId:r.id,originalStatus:r.status,originalOwner:r.assigned_to||r.assignedStaffName,originalMetadata:r.metadata||{},originalRecord:r}});const parsedDate=new Date(String(r.createdAt||r.created_at||''));const rawStatus=String(r.status||'new').toLowerCase().replaceAll(' ','_');const status=['new','triaged','assigned','in_progress','waiting_on_member','waiting_on_vendor','resolved','closed','recorded'].includes(rawStatus)?rawStatus:'new';await createTicketFromDraft(draft,'history','import',{sourceRef,status:close?'closed':status,createdAt:Number.isFinite(parsedDate.getTime())?parsedDate:undefined,resolvedAt:close&&Number.isFinite(parsedDate.getTime())?parsedDate:undefined,noSla:close});imported++;}catch(e){errors.push(`Row ${i+1}: ${e instanceof Error?e.message:'Invalid record'}`);}}
const[run]=await db.insert(importRuns).values({source,imported,skipped,errors}).returning();return{...run,total:rows.length,knowledge:'Historical examples are retrieved at chat time, not used to fine-tune an OpenAI model.'};}

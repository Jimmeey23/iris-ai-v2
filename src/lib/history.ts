import {readFile} from 'fs/promises';
import {createHash} from 'crypto';
import {eq,inArray,sql} from 'drizzle-orm';
import {db} from '@/db';import {tickets,importRuns} from '@/db/schema';
import {makeDraft,createTicketFromDraft,type DraftContext} from './tickets';import {getConfig} from './config';import {ApiError} from './auth';import {obj} from './momence';import {isCxExport,fromCxExport} from './history-mapping';
/** Rows per transaction. Each row is its own savepoint inside it, so one bad row is recorded
 *  as an error without rolling back the rest of its chunk. */
const CHUNK=50;
const STATUSES=['new','triaged','assigned','in_progress','waiting_on_member','waiting_on_vendor','resolved','closed','recorded'];
const validDate=(v:unknown)=>{if(v===undefined||v===null||v==='')return undefined;const d=new Date(String(v));return Number.isFinite(d.getTime())?d:undefined;};
/** When a backfilled record was last worked: an explicit resolution/closure time, else its last
 *  update or reply. Falls back to the creation time only when the record carries nothing
 *  later, so closed history does not all read as a 0-hour resolution. */
const closureDate=(r:Record<string,unknown>,createdAt?:Date)=>{for(const v of [r.resolvedAt,r.resolved_at,r.closedAt,r.closed_at,r.lastResponseDate,r.last_response_date,r.updatedAt,r.updated_at]){const d=validDate(v);if(d&&(!createdAt||d.getTime()>=createdAt.getTime()))return d;}return createdAt;};
const genericRef=(r:Record<string,unknown>)=>'historic:'+String(r.id||r.ticketNumber||r.ticket_number||createHash('sha256').update(JSON.stringify(r)).digest('hex'));
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
// One configuration read and one routing lookup per category/studio for the whole run.
const ctx:DraftContext&{trusted:true}={trusted:true,cfg:await getConfig(),routing:new Map()};
for(let from=0;from<rows.length;from+=CHUNK){const chunk=rows.slice(from,from+CHUNK).map((raw,j)=>{const r=obj(raw);const cx=isCxExport(r)?fromCxExport(r):null;return{i:from+j,r,cx,sourceRef:cx?cx.sourceRef:genericRef(r)};});
// One duplicate check per chunk instead of one per row.
const known=new Set((await db.select({ref:tickets.sourceRef}).from(tickets).where(inArray(tickets.sourceRef,chunk.map(c=>c.sourceRef)))).map(k=>k.ref));
// Drafts are built before the transaction opens (routing and asset lookups use their own
// connection), so the chunk's transaction only ever holds one pooled connection.
type Prepared={i:number;draft:Awaited<ReturnType<typeof makeDraft>>;external:{sourceRef:string;status:string;createdAt?:Date;resolvedAt?:Date;noSla:boolean};escalated:boolean};
const prepared:Prepared[]=[];
for(const{i,r,cx,sourceRef}of chunk){try{
if(known.has(sourceRef)){skipped++;continue;}known.add(sourceRef);
if(cx){const when=validDate(cx.createdAt);
prepared.push({i,escalated:cx.escalated,draft:await makeDraft({...cx.input,customFields:{...cx.input.customFields,historicSource:source,...(close?{closedOnImport:true}:{})}},ctx),external:{sourceRef,status:close?'closed':cx.status,createdAt:when,resolvedAt:close?validDate(cx.resolvedAt)||when:undefined,noSla:close}});continue;}
let category=String(r.category||'');if(category==='Booking & Schedule')category='Scheduling';const text=String(r.description||r.summary||r.conversation_summary||'');const draft=await makeDraft({title:r.title,description:text,summary:r.summary,category,subcategory:r.subcategory||r.sub_category||r.subCategory,kind:String(r.kind||'issue').toLowerCase(),studio:r.studio||r.location,memberName:r.memberName||r.member_name||r.reported_by||'Historical report',memberEmail:r.memberEmail||r.member_email||'',memberPhone:r.memberPhone||r.member_phone||undefined,classFormat:r.classFormat||r.class_type||undefined,trainer:r.trainer||undefined,incidentAt:r.incidentAt||r.class_date_time||r.created_at||r.createdAt||'Not recorded',source:'history',priority:r.priority?String(r.priority).toLowerCase():undefined,sentiment:['positive','negative','neutral','frustrated'].includes(String(r.sentiment).toLowerCase())?String(r.sentiment).toLowerCase():'neutral',customFields:{historicSource:source,historicId:r.id,originalStatus:r.status,originalOwner:r.assigned_to||r.assignedStaffName,originalMetadata:r.metadata||{},originalRecord:r}},ctx);const parsedDate=validDate(r.createdAt||r.created_at);const rawStatus=String(r.status||'new').toLowerCase().replaceAll(' ','_');const status=STATUSES.includes(rawStatus)?rawStatus:'new';
prepared.push({i,escalated:false,draft,external:{sourceRef,status:close?'closed':status,createdAt:parsedDate,resolvedAt:close?closureDate(r,parsedDate):undefined,noSla:close}});}catch(e){errors.push(`Row ${i+1}: ${e instanceof Error?e.message:'Invalid record'}`);}}
if(!prepared.length)continue;
await db.transaction(async tx=>{for(const p of prepared){try{
const created=await createTicketFromDraft(p.draft,'history','import',{...p.external,tx});
if(p.escalated)await tx.update(tickets).set({isEscalated:true,version:sql`${tickets.version}+1`}).where(eq(tickets.id,created.id));
imported++;}catch(e){errors.push(`Row ${p.i+1}: ${e instanceof Error?e.message:'Invalid record'}`);}}});}
const[run]=await db.insert(importRuns).values({source,imported,skipped,errors}).returning();return{...run,total:rows.length,knowledge:'Historical examples are retrieved at chat time, not used to fine-tune an OpenAI model.'};}

import {NextRequest} from 'next/server';
import {z} from 'zod';
import {getConfig} from '@/lib/config';
import {errorResponse,intakeActor} from '@/lib/auth';
import {resolveRouting} from '@/lib/tickets';
import {momenceConfigured} from '@/lib/momence';
import {inferPriority} from '@/lib/routing';
import {hubCategories,hubSub,planFields,PLAN_SOURCE} from '@/lib/intake/plan';
import {ensureSeeded} from '@/lib/seed';
export const dynamic='force-dynamic';

/**
 * The intake form's data feed.
 *
 *   GET /api/intake                       → the taxonomy the workspace files under, with
 *                                            department, default owner and SLA per sub-category
 *   GET /api/intake?category=&subcategory=[&studio=]
 *                                         → the field plan for one sub-category plus who will
 *                                            own the ticket at that studio
 *
 * The taxonomy is the workspace's own (Settings → taxonomy), so a sub-category an admin added
 * is offered with the shared field block, and a Support Hub sub-category the workspace does not
 * file under is not offered at all — makeDraft would refuse it anyway.
 */
export async function GET(req:NextRequest){try{
  const[cfg,actor]=await Promise.all([getConfig(),intakeActor()]);
  await ensureSeeded();
  const sp=req.nextUrl.searchParams;
  const ctx={studios:[...cfg.studios],formats:[...cfg.formats],trainers:[...cfg.trainers],memberships:[...cfg.memberships]};
  const category=sp.get('category');
  if(category){
    const q=z.object({category:z.string().min(1),subcategory:z.string().min(1),studio:z.string().optional()}).parse({category,subcategory:sp.get('subcategory')||'',studio:sp.get('studio')||undefined});
    if(!cfg.taxonomy[q.category]?.includes(q.subcategory))return Response.json({error:'That sub-category is not part of this workspace\u2019s taxonomy.'},{status:404});
    const fields=planFields(q.category,q.subcategory,ctx,sp.get('source')==='generated'?undefined:cfg.formOverrides[`${q.category}|||${q.subcategory}`]);
    const meta=hubSub(q.category,q.subcategory);
    let routing:{departmentId:string;departmentName:string;owner:{name:string;role:string}|null;autoAssign:boolean}|null=null;
    try{const r=await resolveRouting(cfg,q.category,q.studio||ctx.studios[0]||'',q.subcategory);routing={departmentId:r.departmentId,departmentName:r.dept.name,owner:r.owner.id===null?null:{name:r.owner.name,role:r.owner.role},autoAssign:cfg.autoAssign};}catch{routing=null;}
    return Response.json({fields,sub:meta||{key:`${q.category}|||${q.subcategory}`,category:q.category,name:q.subcategory,hubPriority:inferPriority({category:q.category,subcategory:q.subcategory}),slaLabel:'',hours:[null,null],hist:0,fieldCount:fields.length,requiredCount:fields.filter(f=>f.required).length},routing,reporter:actor.id?{name:actor.name,email:actor.email}:null});
  }
  const hub=new Map(hubCategories().map(c=>[c.name,c]));
  const configured=await momenceConfigured();
  const categories=await Promise.all(Object.entries(cfg.taxonomy).map(async([name,subs])=>{
    const h=hub.get(name);
    let department={id:cfg.categoryDepartments[name]||'operations',name:''},owner:{name:string;role:string}|null=null;
    try{const r=await resolveRouting(cfg,name,'');department={id:r.departmentId,name:r.dept.name};owner=r.owner.id===null?null:{name:r.owner.name,role:r.owner.role};}catch{}
    return{name,department,owner,hubDepartment:h?.department||null,owners:h?.owners||null,subs:subs.map(sub=>{const m=hubSub(name,sub);const priority=inferPriority({category:name,subcategory:sub});const fields=planFields(name,sub,ctx,cfg.formOverrides[`${name}|||${sub}`]);const route=cfg.subcategoryRouting[`${name}|||${sub}`];return{name:sub,priority,slaHours:route?.slaHours??cfg.responseHours[priority],fieldCount:fields.length,requiredCount:fields.filter(f=>f.required).length,hist:m?.hist||0,hubPriority:m?.hubPriority||null};})};
  }));
  return Response.json({categories,responseHours:cfg.responseHours,positiveNoSla:cfg.positiveNoSla,studios:ctx.studios,formats:ctx.formats,trainers:ctx.trainers,memberships:ctx.memberships,momence:{configured},reporter:actor.id?{name:actor.name,email:actor.email}:null,plan:PLAN_SOURCE});
}catch(e){return errorResponse(e);}}

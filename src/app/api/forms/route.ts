import {NextRequest} from 'next/server';import {z} from 'zod';
import {requireAdmin,errorResponse,ApiError,sameOrigin} from '@/lib/auth';import {audit} from '@/lib/config';
import {allForms,extractEmbed,saveCustomForm,removeCustomForm,customFormSchema,slugify} from '@/lib/forms';
export const dynamic='force-dynamic';

export async function GET(){try{const forms=await allForms();return Response.json({forms,count:forms.length});}catch(e){return errorResponse(e);}}

const addSchema=z.object({name:z.string().min(2).max(120),blurb:z.string().max(280).optional(),template:z.string().min(1).max(60).optional(),embedCode:z.string().min(1).max(20000),height:z.number().int().min(320).max(1600).optional(),icon:z.string().min(1).max(4).optional()});

export async function POST(req:NextRequest){try{
  sameOrigin(req);
  const user=await requireAdmin();
  const b=addSchema.parse(await req.json());
  const embed=extractEmbed(b.embedCode);
  if(!embed)throw new ApiError('No form id was found in that embed code. Paste the full snippet, the share link, or the bare form id.');
  const existing=await allForms();
  if(existing.some(f=>f.embedId===embed.embedId))throw new ApiError('That form is already on the board.');
  let key=slugify(b.name);
  if(existing.some(f=>f.key===key))key=`${key}-${Math.random().toString(36).slice(2,6)}`;
  const form=customFormSchema.parse({key,name:b.name.trim(),blurb:b.blurb?.trim()||'',template:b.template||'General',embedId:embed.embedId,embedKind:embed.embedKind,height:b.height??(embed.embedKind==='zite-v2'?700:560),icon:b.icon?.trim()||'▤'});
  await saveCustomForm(form,user.id);
  await audit(user,'form.added','forms',{key:form.key,embedId:form.embedId,embedKind:form.embedKind});
  return Response.json({ok:true,form});
}catch(e){return errorResponse(e);}}

export async function DELETE(req:NextRequest){try{
  sameOrigin(req);
  const user=await requireAdmin();
  const key=req.nextUrl.searchParams.get('key')||'';
  if(!key)throw new ApiError('A form key is required.');
  if(!await removeCustomForm(key,user.id))throw new ApiError('Only forms added to this workspace can be removed.',404);
  await audit(user,'form.removed','forms',{key});
  return Response.json({ok:true});
}catch(e){return errorResponse(e);}}

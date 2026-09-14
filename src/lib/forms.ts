import {z} from 'zod';
import {getSetting,setSetting} from './config';
import {TRAINER_REVIEW_SOURCES} from './trainer-reviews';

/**
 * The evaluation forms embedded on /forms. Fillout serves two embed runtimes: the
 * classic form builder (`fillout-v1`) and Zite, its app builder (`zite-v2`). Each
 * needs its own loader script and its own `data-*` attribute names.
 */
export type EmbedKind='fillout-v1'|'zite-v2';

export type EmbeddedForm={
  key:string;
  name:string;
  blurb:string;
  /** Assessment template this form scores against, for the rubric chip. */
  template:string;
  /** Id used by the embed script, and by the submissions API where supported. */
  embedId:string;
  embedKind:EmbedKind;
  height:number;
  icon:string;
  /**
   * Zite apps are not exposed on the Fillout submissions API, so their
   * assessments only reach the workspace through the flow reader or a webhook.
   */
  apiPollable:boolean;
  /** User-added forms can be removed again; the built-in four cannot. */
  custom:boolean;
};

/**
 * The four forms the studios actually use. Their ids match the import sources in
 * `trainer-reviews.ts`, so a submission made here is the same submission the
 * trainer reviews tab later pulls in — the assertion below keeps that true.
 */
export const BUILT_IN_FORMS:EmbeddedForm[]=[
  {key:'strength',name:'Strength Lab feedback',blurb:'Trainer QA & Assessment — FIT & Strength Lab',template:'Strength Lab',embedId:'srq1c6n7br',embedKind:'zite-v2',height:700,icon:'◈',apiPollable:false,custom:false},
  {key:'cycle',name:'powerCycle feedback',blurb:'Ride programming, musicality, safety and fill rate',template:'powerCycle',embedId:'pdtcpzhxas',embedKind:'zite-v2',height:700,icon:'◎',apiPollable:false,custom:false},
  {key:'barre',name:'Barre assessment',blurb:'Training Quality Assessment — weighted Barre rubric',template:'Barre',embedId:'dSw2VkfdGqus',embedKind:'fillout-v1',height:560,icon:'◑',apiPollable:true,custom:false},
  {key:'nontechnical',name:'Non-technical feedback',blurb:'Member-facing class experience and retention signals',template:'General',embedId:'syTsvPww8nus',embedKind:'fillout-v1',height:560,icon:'▤',apiPollable:true,custom:false},
];

/** The import source, if any, that collects what this form receives. */
export function importSourceFor(embedId:string){
  return TRAINER_REVIEW_SOURCES.find(s=>s.id===embedId);
}

export const customFormSchema=z.object({
  key:z.string().min(1).max(60),
  name:z.string().min(2).max(120),
  blurb:z.string().max(280).default(''),
  template:z.string().min(1).max(60).default('General'),
  embedId:z.string().regex(/^[a-zA-Z0-9]+$/).max(64),
  embedKind:z.enum(['fillout-v1','zite-v2']),
  height:z.number().int().min(320).max(1600).default(560),
  icon:z.string().min(1).max(4).default('▤'),
});
export type CustomForm=z.infer<typeof customFormSchema>;

const SETTING_KEY='custom-forms';

/** The four built-ins plus every form someone has added, as one board. */
export async function allForms():Promise<EmbeddedForm[]>{
  const saved=(await getSetting(SETTING_KEY))?.value||{};
  const custom:EmbeddedForm[]=[];
  for(const value of Object.values(saved)){
    const parsed=customFormSchema.safeParse(value);
    // A row that no longer parses (hand-edited settings, a schema change) is skipped
    // rather than taking the whole board down.
    if(parsed.success)custom.push({...parsed.data,apiPollable:false,custom:true});
  }
  custom.sort((a,b)=>a.name.localeCompare(b.name));
  return [...BUILT_IN_FORMS,...custom];
}

export async function saveCustomForm(form:CustomForm,userId?:number){
  const saved={...((await getSetting(SETTING_KEY))?.value||{})};
  saved[form.key]=form;
  await setSetting(SETTING_KEY,saved,userId);
}

export async function removeCustomForm(key:string,userId?:number){
  const saved={...((await getSetting(SETTING_KEY))?.value||{})};
  if(!(key in saved))return false;
  delete saved[key];
  await setSetting(SETTING_KEY,saved,userId);
  return true;
}

export function slugify(s:string){
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'form';
}

/**
 * Pulls the embed id and runtime out of whatever someone pastes: a full Fillout or
 * Zite embed snippet, a share link, or a bare form id (assumed Fillout v1).
 */
export function extractEmbed(input:string):{embedId:string;embedKind:EmbedKind}|null{
  const raw=input.trim();
  if(!raw)return null;
  const zite=raw.match(/data-zite-id=["']([a-zA-Z0-9]+)["']/);
  if(zite)return{embedId:zite[1],embedKind:'zite-v2'};
  const fillout=raw.match(/data-fillout-id=["']([a-zA-Z0-9]+)["']/);
  if(fillout)return{embedId:fillout[1],embedKind:'fillout-v1'};
  const ziteUrl=raw.match(/zite\.com\/(?:t|p|a)\/([a-zA-Z0-9]+)/);
  if(ziteUrl)return{embedId:ziteUrl[1],embedKind:'zite-v2'};
  const url=raw.match(/fillout\.com\/(?:t|p)\/([a-zA-Z0-9]+)/);
  if(url)return{embedId:url[1],embedKind:'fillout-v1'};
  if(/^[a-zA-Z0-9]+$/.test(raw))return{embedId:raw,embedKind:'fillout-v1'};
  return null;
}

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, auditLogs, integrations } from "@/db/schema";
import { CATEGORY_DEPARTMENT, CATEGORY_MAP, CLASS_FORMATS, MEMBERSHIPS, STUDIOS, TRAINERS } from "./constants";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { cache } from "react";

import {configSchema,DEFAULT_CONFIG,type WorkspaceConfig} from "./settings-contract";
export {configSchema,DEFAULT_CONFIG};
export type {WorkspaceConfig};
/** Memoised per request with React cache(); outside a render (scripts) it simply runs each call. */
export const getConfig=cache(async function getConfig():Promise<WorkspaceConfig>{
  const[row]=await db.select().from(appSettings).where(eq(appSettings.key,"workspace"));
  const saved={...(row?.value||{})} as Record<string,unknown>;
  const clamp=(value:unknown,fallback:number)=>Math.max(12,Math.min(72,Number(value)||fallback));
  const rawHours=(saved.responseHours||{}) as Record<string,unknown>;
  saved.responseHours={critical:clamp(rawHours.critical,12),high:clamp(rawHours.high,16),medium:clamp(rawHours.medium,48),low:clamp(rawHours.low,72)};
  const rawSubRouting=(saved.subcategoryRouting||{}) as Record<string,Record<string,unknown>>;
  saved.subcategoryRouting=Object.fromEntries(Object.entries(rawSubRouting).map(([key,rule])=>[key,{...rule,...(rule.slaHours==null?{}:{slaHours:clamp(rule.slaHours,48)})}]));
  const parsed=configSchema.parse({...DEFAULT_CONFIG,aiModel:process.env.OPENAI_MODEL||DEFAULT_CONFIG.aiModel,...saved});
  const hosted='Hosted Class Feedback';
  const legacyRepairLabels=new Set(['AC and HVAC Issues','Lighting Issues','Studio System Malfunction','Plumbing Leaks','General Maintenance Delays','Door Lock Issues','Dust and Mold in Corners','Broken Equipment Not Repaired','PowerCycle Bike Fault (Stages SC3)']);
  const configuredRepair=(parsed.taxonomy['Repair and Maintenance']||[]).filter(label=>!legacyRepairLabels.has(label));
  const repair=[...new Set([...(CATEGORY_MAP['Repair and Maintenance']||[]),...configuredRepair])];
  const brand=parsed.taxonomy['Brand Feedback']?.includes(hosted)?parsed.taxonomy['Brand Feedback']:[hosted,...(parsed.taxonomy['Brand Feedback']||[])];
  return {...parsed,taxonomy:{...parsed.taxonomy,'Brand Feedback':brand,'Repair and Maintenance':repair}};
});
export async function getSetting(key:string){const[r]=await db.select().from(appSettings).where(eq(appSettings.key,key));return r;}
export async function setSetting(key:string,value:Record<string,unknown>,userId?:number){await db.insert(appSettings).values({key,value,updatedBy:userId}).onConflictDoUpdate({target:appSettings.key,set:{value,updatedBy:userId,updatedAt:new Date()}});}
export async function audit(actor:{id?:number;name:string},action:string,entity:string,detail:Record<string,unknown>={}){await db.insert(auditLogs).values({actorId:actor.id,actorName:actor.name,action,entity,detail});}
function encryptionKey(){const key=process.env.INTEGRATION_ENCRYPTION_KEY;if(!key||!/^[a-fA-F0-9]{64}$/.test(key))throw new Error("Set INTEGRATION_ENCRYPTION_KEY to a 32-byte hex key before saving credentials.");return Buffer.from(key,"hex");}
export function encryptSecrets(values:Record<string,string>){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(values)),cipher.final()]);return [iv.toString("base64"),cipher.getAuthTag().toString("base64"),encrypted.toString("base64")].join(".");}
export function decryptSecrets(value?:string|null):Record<string,string>{if(!value)return{};const[iv,tag,data]=value.split(".");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64"));decipher.setAuthTag(Buffer.from(tag,"base64"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,"base64")),decipher.final()]).toString());}
/** Environment-variable prefix for an integration's credentials: `MAILTRAP_SMTP_HOST`
 *  supplies `smtp_host` for `mailtrap`. ChatGPT reads the conventional OPENAI_ names. */
export function envPrefix(id:string){return id==='chatgpt'?'OPENAI':id.toUpperCase().replaceAll('-','_');}
/** The credentials an integration id can read from the environment. */
export function envCredentials(id:string,source:Record<string,string|undefined>=process.env):Record<string,string>{const prefix=envPrefix(id)+'_';return Object.fromEntries(Object.entries(source).filter(([k,v])=>k.startsWith(prefix)&&v).map(([k,v])=>[k.slice(prefix.length).toLowerCase(),v!]));}
/**
 * Integrations whose credentials belong to the deployment rather than the UI.
 *
 * This is now every integration: the environment is the source of truth for secrets, and
 * Settings is the fallback for whatever the deployment has not provided. Rotating a key
 * should mean changing it in one place — the deployment — and having the change take
 * effect, rather than being silently overridden by a value someone pasted into the UI
 * months ago. The set is kept as a named export because the precedence is a decision worth
 * being able to point at, and because a future integration may need the opposite rule.
 */
export const ENV_FIRST_INTEGRATIONS=new Set(['*']);
/** True for every integration while the set holds the wildcard. */
export const envWinsFor=(id:string)=>ENV_FIRST_INTEGRATIONS.has('*')||ENV_FIRST_INTEGRATIONS.has(id);
/**
 * Precedence: the environment wins, and what an administrator saved in Settings fills in
 * whatever the deployment does not supply.
 *
 * `envCredentials` already drops empty variables, so an unset or blank environment value
 * counts as absent and the saved one is used — the deployment cannot blank out a working
 * connection by declaring an empty variable. The same rule applies in reverse: a field
 * saved blank in the UI is not "filled in" either.
 */
export function mergeCredentials(stored:Record<string,unknown>|undefined,env:Record<string,string>,enabled?:boolean|null,envWins=true):Record<string,string>{
  const filled=Object.fromEntries(Object.entries(stored??{}).filter(([,v])=>typeof v==='string'&&v.trim()!=='')) as Record<string,string>;
  return{...(envWins?{...filled,...env}:{...env,...filled}),_enabled:String(enabled??true)};
}
/**
 * Credentials for one integration.
 *
 * `envOnly` ignores everything saved in Settings and reads the deployment's own
 * variables — the fallback used when the saved credentials turn out not to work.
 *
 * Secrets that cannot be decrypted (a rotated or missing INTEGRATION_ENCRYPTION_KEY)
 * are treated as absent rather than fatal. Before this, one unreadable row took down
 * every integration, because the throw escaped the whole call.
 */
export async function integrationCredentials(id:string,{envOnly=false,settingsOnly=false}:{envOnly?:boolean;settingsOnly?:boolean}={}):Promise<Record<string,string>>{
  const[row]=await db.select().from(integrations).where(eq(integrations.id,id));
  let saved:Record<string,unknown>|undefined;
  if(!envOnly){
    let secrets:Record<string,string>={};
    try{secrets=decryptSecrets(row?.encryptedSecrets);}
    catch{console.error(JSON.stringify({level:'error',source:'integrations.credentials',integration:id,message:'Saved secrets could not be decrypted; falling back to environment credentials. Check INTEGRATION_ENCRYPTION_KEY.'}));}
    saved={...row?.config,...secrets};
  }
  if(settingsOnly)return mergeCredentials(saved,{},row?.enabled,false);
  return mergeCredentials(saved,envCredentials(id),row?.enabled,envWinsFor(id));
}
export const credentials=cache(function credentials(id:string){return integrationCredentials(id);});
/** Whether the environment could supply anything this integration does not already
 *  have from Settings — i.e. whether a fallback attempt is worth making at all. */
export function hasEnvFallback(id:string){return Object.keys(envCredentials(id)).length>0;}
/** Whether Settings holds anything the environment does not — i.e. whether a retry with the
 *  saved credentials could possibly behave differently. */
export async function hasSettingsFallback(id:string){
  const saved=await integrationCredentials(id,{settingsOnly:true});
  const env=envCredentials(id);
  return Object.entries(saved).some(([k,v])=>k!=='_enabled'&&v&&v!==env[k]);
}

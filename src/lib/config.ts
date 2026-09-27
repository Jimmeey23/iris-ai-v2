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
export const credentials=cache(async function credentials(id:string):Promise<Record<string,string>>{const[row]=await db.select().from(integrations).where(eq(integrations.id,id));const saved=decryptSecrets(row?.encryptedSecrets);const prefix=id==='chatgpt'?'OPENAI':id.toUpperCase().replaceAll('-','_');const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>k.startsWith(prefix+'_')&&v).map(([k,v])=>[k.slice(prefix.length+1).toLowerCase(),v!]));return{...row?.config,...saved,...env,_enabled:String(row?.enabled??true)};});

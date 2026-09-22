import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUsers } from "@/db/schema";
import {createSupabaseServerClient} from '@/lib/supabase/server';
export type Identity={id:number;name:string;email:string;role:'agent'|'manager'|'admin';staffId:number|null;department:string|null;studio:string|null;avatarUrl:string|null};
export class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
export function errorResponse(error:unknown){if(error instanceof ApiError)return Response.json({error:error.message},{status:error.status});if(error&&typeof error==='object'&&'issues'in error)return Response.json({error:'Please check the highlighted fields.',details:(error as {issues:unknown}).issues},{status:400});console.error(error instanceof Error?error.message:'Request failed');return Response.json({error:error instanceof Error&& !/Failed query|constraint|relation.*exist/i.test(error.message)?error.message:'This change could not be saved. Check the fields and try again.'},{status:500});}
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password:string,encoded:string){const[salt,hash]=encoded.split(':');try{return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));}catch{return false;}}
export async function currentUser():Promise<Identity|null>{const supabase=await createSupabaseServerClient();const{data,error}=await supabase.auth.getUser();if(error||!data.user?.email)return null;const email=data.user.email.toLowerCase();let[row]=await db.select({id:appUsers.id,name:appUsers.name,email:appUsers.email,role:appUsers.role,staffId:appUsers.staffId,department:appUsers.department,studio:appUsers.studio,avatarUrl:appUsers.avatarUrl,active:appUsers.active}).from(appUsers).where(eq(appUsers.email,email));if(!row){[row]=await db.insert(appUsers).values({email,name:String(data.user.user_metadata?.full_name||data.user.user_metadata?.name||email),avatarUrl:data.user.user_metadata?.avatar_url||null,googleSub:data.user.app_metadata?.provider==='google'?data.user.id:null,role:'agent'}).returning({id:appUsers.id,name:appUsers.name,email:appUsers.email,role:appUsers.role,staffId:appUsers.staffId,department:appUsers.department,studio:appUsers.studio,avatarUrl:appUsers.avatarUrl,active:appUsers.active});}if(!row?.active)return null;return{...row,role:row.role as Identity['role']};}
export async function configuredUsers(){return (await db.select({id:appUsers.id}).from(appUsers).limit(1)).length>0;}
export async function requireAdmin(){const user=await currentUser();if(!user||user.role!=='admin')throw new ApiError('Administrator sign-in is required.',403);return user;}
/** Anonymous stand-in for intake surfaces only. It is deliberately NOT an
 *  authorisation result: never use it to gate a write against existing data. */
/** Gate for writes against records that already exist. Throws when the caller is
 *  not a signed-in agent or admin. This previously returned ANONYMOUS_INTAKE on
 *  failure, which left every "agent-protected" ticket write open to any
 *  same-origin caller. */
export async function requireAgent():Promise<Identity>{const user=await currentUser();if(user&&['admin','manager','agent'].includes(user.role))return user;
// A signed-in viewer is authenticated but not permitted, which is 403. Returning 401 for
// them told the client to prompt for a sign-in they had already completed.
if(user)throw new ApiError('Your account has view-only access to this workspace.',403);
throw new ApiError('Sign in to your workspace account to make this change.',401);}
/** Intake surfaces — logging a new ticket or review — stay open to unauthenticated
 *  studio staff by design. They create records; they never mutate existing ones. */
export async function intakeActor():Promise<Identity>{return requireWorkspace();}
/** Reads the signed-in identity, or null. Use when a surface legitimately serves
 *  anonymous callers. It is NOT an authorisation check — the name says so. */
export async function optionalUser():Promise<Identity|null>{return currentUser();}
/** Gate for workspace data — tickets, staff, analytics, the equipment register.
 *  This previously returned `currentUser()` and never threw, so the twelve routes
 *  that called it as `await requireWorkspace();` and dropped the result were open
 *  to any anonymous caller. Making it throw is the fix; surfaces that genuinely
 *  serve anonymous studio staff use `intakeActor()` or `optionalUser()` instead. */
export async function requireWorkspace():Promise<Identity>{const user=await currentUser();if(!user)throw new ApiError('Sign in to your workspace account to view this.',401);return user;}
export function canAccessTicket(user:Identity,ticket:{assignedStaffId:number|null;createdByUserId?:number|null;departmentName?:string|null;studio?:string|null}){if(user.role==='admin')return true;if(user.role==='agent')return(user.staffId!==null&&ticket.assignedStaffId===user.staffId)||ticket.createdByUserId===user.id;const checks:boolean[]=[];if(user.department)checks.push(ticket.departmentName===user.department);if(user.studio)checks.push(ticket.studio===user.studio);return checks.length>0&&checks.every(Boolean);}
export function requireTicketAccess(user:Identity,ticket:{assignedStaffId:number|null;createdByUserId?:number|null;departmentName?:string|null;studio?:string|null}){if(!canAccessTicket(user,ticket))throw new ApiError('You do not have access to this ticket.',403);}
export async function requireIntegrationAccess(write=false){const user=await requireWorkspace();if(write&&user.role!=='admin')throw new ApiError('An administrator must approve live external changes.',403);return user;}
export async function logout(){const supabase=await createSupabaseServerClient();await supabase.auth.signOut();}
export async function browserKey(){const jar=await cookies();let token=jar.get('iris_browser')?.value;if(!token){token=randomBytes(24).toString('hex');jar.set('iris_browser',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*86400});}const user=await currentUser();return user?'user:'+user.id:'browser:'+digest(token);}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');const host=request.headers.get('x-forwarded-host')||request.headers.get('host');if(!origin||!host)return;
// An opaque origin ("null", from a sandboxed frame or file:// page) is not parseable: treat it as cross-origin instead of throwing a raw TypeError.
let originHost:string;try{originHost=new URL(origin).host;}catch{throw new ApiError('Cross-origin request rejected.',403);}
if(originHost!==host)throw new ApiError('Cross-origin request rejected.',403);}

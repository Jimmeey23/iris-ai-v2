import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { appUsers } from '@/db/schema';
import { ApiError,currentUser,configuredUsers,requireAdmin,hashPassword,verifyPassword,newSession,logout,errorResponse,sameOrigin } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { audit } from '@/lib/config';
export const dynamic='force-dynamic';
const input=z.object({action:z.enum(['login','setup','invite','logout','update']),email:z.string().email().optional(),password:z.string().min(12).max(200).optional(),name:z.string().min(2).max(80).optional(),staffId:z.number().int().positive().nullable().optional(),role:z.enum(['admin','agent','viewer']).optional(),id:z.number().int().optional(),active:z.boolean().optional()});
export async function GET(){try{await ensureSeeded();return Response.json({user:await currentUser(),setupRequired:!await configuredUsers()});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);await ensureSeeded();const b=input.parse(await req.json());if(b.action==='logout'){await logout();return Response.json({ok:true});}
if(b.action==='update'){const admin=await requireAdmin();if(!b.id)throw new ApiError('User id required');if(b.id===admin.id&&(b.active===false||b.role&&b.role!=='admin'))throw new ApiError('You cannot remove your own administrator access.');await db.update(appUsers).set({role:b.role,staffId:b.staffId,active:b.active}).where(eq(appUsers.id,b.id));await audit(admin,'access.updated','user:'+b.id);return Response.json({ok:true});}
if(!b.email||!b.password)throw new ApiError('Email and a password of at least 12 characters are required.');const email=b.email.toLowerCase().trim();
if(b.action==='login'){const[u]=await db.select().from(appUsers).where(eq(appUsers.email,email));if(!u?.active||!verifyPassword(b.password,u.passwordHash))throw new ApiError('Email or password is incorrect.',401);await newSession(u.id);return Response.json({ok:true});}
const admin=b.action==='invite'?await requireAdmin():null;
const user=await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(578100)`);if(b.action==='setup'&&(await tx.select({id:appUsers.id}).from(appUsers).limit(1)).length)throw new ApiError('This workspace already has an administrator.',409);const[u]=await tx.insert(appUsers).values({email,passwordHash:hashPassword(b.password!),name:b.name||email,staffId:b.staffId,role:b.action==='setup'?'admin':b.role||'agent'}).returning({id:appUsers.id});return u;});
if(b.action==='setup')await newSession(user.id);await audit(admin||{id:user.id,name:b.name||email},'account.created','user:'+user.id);return Response.json({ok:true});
}catch(e){return errorResponse(e);}}

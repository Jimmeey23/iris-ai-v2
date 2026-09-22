import {cookies} from 'next/headers';
import {NextRequest,NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db';
import {appUsers} from '@/db/schema';
import {newSession} from '@/lib/auth';

export async function GET(req:NextRequest){
  const home=new URL('/login',req.url);const code=req.nextUrl.searchParams.get('code');const state=req.nextUrl.searchParams.get('state');const jar=await cookies();
  if(!code||!state||state!==jar.get('iris_oauth_state')?.value){home.searchParams.set('error','oauth_state');return NextResponse.redirect(home);}
  jar.delete('iris_oauth_state');
  try{
    const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_AUTH_CLIENT_ID||'',client_secret:process.env.GOOGLE_AUTH_CLIENT_SECRET||'',redirect_uri:new URL('/api/auth/google/callback',req.url).toString(),grant_type:'authorization_code'})});
    if(!token.ok)throw new Error('token');const tokens=await token.json() as {access_token:string};
    const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${tokens.access_token}`}});if(!profileResponse.ok)throw new Error('profile');
    const profile=await profileResponse.json() as {sub:string;email:string;email_verified:boolean;name?:string;picture?:string};if(!profile.email_verified)throw new Error('email');
    const email=profile.email.toLowerCase();let[user]=await db.select().from(appUsers).where(eq(appUsers.email,email));
    if(user&&!user.active)throw new Error('inactive');
    if(user&&user.googleSub&&user.googleSub!==profile.sub)throw new Error('linked');
    if(user){[user]=await db.update(appUsers).set({googleSub:profile.sub,avatarUrl:profile.picture||user.avatarUrl,name:user.name||profile.name||email}).where(eq(appUsers.id,user.id)).returning();}
    else [user]=await db.insert(appUsers).values({email,name:profile.name||email,googleSub:profile.sub,avatarUrl:profile.picture,role:'agent'}).returning();
    await newSession(user.id);return NextResponse.redirect(new URL('/dashboard',req.url));
  }catch{home.searchParams.set('error','google_signin');return NextResponse.redirect(home);}
}

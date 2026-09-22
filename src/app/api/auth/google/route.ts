import {randomBytes} from 'crypto';
import {cookies} from 'next/headers';
import {NextRequest,NextResponse} from 'next/server';

export async function GET(req:NextRequest){
  const clientId=process.env.GOOGLE_AUTH_CLIENT_ID;
  if(!clientId)return NextResponse.redirect(new URL('/login?error=google_not_configured',req.url));
  const state=randomBytes(24).toString('hex');
  const jar=await cookies();
  jar.set('iris_oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});
  const callback=new URL('/api/auth/google/callback',req.url).toString();
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'openid email profile',state,prompt:'select_account'}).toString();
  return NextResponse.redirect(url);
}

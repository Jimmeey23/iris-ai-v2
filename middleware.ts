import {NextRequest,NextResponse} from 'next/server';
const PUBLIC=['/login','/api/auth','/video','/_next','/favicon.ico'];
function bytes(value:string){return new TextEncoder().encode(value)}
function hex(buffer:ArrayBuffer){return [...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function validSession(value:string|undefined){if(!value)return false;const[raw,signature]=value.split('.');const secret=process.env.AUTH_SESSION_SECRET||process.env.INTEGRATION_ENCRYPTION_KEY;if(!raw||!signature||!secret)return false;const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,bytes(raw)))===signature;}
export async function middleware(req:NextRequest){const path=req.nextUrl.pathname;if(PUBLIC.some(p=>path===p||path.startsWith(p+'/')))return NextResponse.next();if(!await validSession(req.cookies.get('iris_session')?.value))return NextResponse.redirect(new URL('/login',req.url));return NextResponse.next();}
export const config={matcher:['/((?!.*\\.[^/]+$).*)']};

/**
 * Nudges and presence, end to end against a running server.
 *
 * A nudge must reach the ticket's owner and nobody else — including the person who sent it —
 * so the negative assertions here matter as much as the positive ones.
 *
 * Run: TEST_BASE_URL=http://localhost:3000 npm run check:nudge
 */
import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {db,pool} from './src/db/index.ts';
import {appUsers,appSettings,auditLogs,tickets,userNotifications,userPresence,staff} from './src/db/schema.ts';
import {eq,inArray,and} from 'drizzle-orm';
import {createTestUser,deleteTestAuthUsers} from './scripts/lib/test-auth.mjs';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const mk=()=>{const c=new Map();return async(p,m='GET',b)=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json',Origin:base,Cookie:[...c].map(([k,v])=>k+'='+v).join('; ')},body:b===undefined?undefined:JSON.stringify(b)});for(const l of r.headers.getSetCookie()){const q=l.split(';')[0],i=q.indexOf('=');c.set(q.slice(0,i),q.slice(i+1));}return{status:r.status,body:await r.json().catch(()=>({}))};};};
const sender=mk(), owner=mk();
const ids=[],auth=[],tix=[];
let fail=0; const ok=(c,m)=>{console.log((c?'PASS  ':'FAIL  ')+m); if(!c)fail++;};
try{
  const used=await db.select({staffId:appUsers.staffId}).from(appUsers);
  const taken=new Set(used.map(u=>u.staffId).filter(Boolean));
  const spare=(await db.select({id:staff.id}).from(staff)).map(s=>s.id).filter(i=>!taken.has(i));
  const t=Date.now();
  const A=await createTestUser({name:'QA Sender '+t,email:`iris-nudge-a-${t}@example.invalid`,role:'admin'});
  const B=await createTestUser({name:'QA Owner '+t,email:`iris-nudge-b-${t}@example.invalid`,role:'agent',staffId:spare[0]});
  ids.push(A.id,B.id); auth.push(A.supabaseUserId,B.supabaseUserId);
  await sender('/api/auth','POST',{action:'login',email:A.email,password:A.password});
  await owner('/api/auth','POST',{action:'login',email:B.email,password:B.password});

  const made=await sender('/api/tickets','POST',{description:'Nudge probe: waitlist confirmation did not arrive.',category:'Scheduling',subcategory:'Waitlist Concerns',kind:'issue',studio:'Kwality House, Kemps Corner',memberName:'QA Member',memberEmail:'qa@example.invalid',incidentAt:'Today',source:'manual',submissionKey:randomUUID()});
  const tk=made.body.ticket; tix.push(tk.id);
  await sender('/api/tickets/'+tk.id,'PATCH',{assignedStaffId:spare[0],version:tk.version});

  const n1=await sender(`/api/tickets/${tk.id}/nudge`,'POST',{message:'Any movement on this one?'});
  ok(n1.status===200, 'nudge accepted -> '+JSON.stringify(n1.body).slice(0,80));
  const n2=await sender(`/api/tickets/${tk.id}/nudge`,'POST',{});
  ok(n2.status===429, 'a second nudge within the hour is refused ('+n2.status+')');

  const mine=await owner('/api/notifications');
  ok(mine.body.notifications?.length===1, 'owner sees exactly one notification');
  ok(mine.body.unread===1, 'and it is unread');
  ok(/nudged you about/.test(mine.body.notifications?.[0]?.title||''), 'title names the sender: '+mine.body.notifications?.[0]?.title);
  ok(mine.body.notifications?.[0]?.body==='Any movement on this one?', 'the message came through');

  const theirs=await sender('/api/notifications');
  ok((theirs.body.notifications||[]).length===0, 'the sender is NOT notified — the nudge reaches the owner alone');

  await owner('/api/notifications','PATCH',{all:true});
  ok((await owner('/api/notifications')).body.unread===0, 'marking read works');

  // presence
  await owner('/api/presence','POST',{path:'/tickets',label:'All tickets'});
  const pres=await sender('/api/presence');
  const seen=(pres.body.online||[]).find(p=>p.name.startsWith('QA Owner'));
  ok(Boolean(seen), 'the owner shows as online');
  ok(seen?.label==='All tickets', 'and the page they are viewing is reported: '+seen?.label);
  const anon=await fetch(base+'/api/presence');
  ok(anon.status===401, 'presence is not readable signed out ('+anon.status+')');
  console.log(fail?`\n${fail} FAILED`:'\nall passed');
} finally {
  if(tix.length) await db.delete(tickets).where(inArray(tickets.id,tix));
  await deleteTestAuthUsers(auth);
  if(ids.length){await db.delete(userPresence).where(inArray(userPresence.userId,ids));await db.delete(userNotifications).where(inArray(userNotifications.userId,ids));await db.delete(appSettings).where(inArray(appSettings.key,ids.map(i=>'preferences:user:'+i)));await db.delete(auditLogs).where(inArray(auditLogs.actorId,ids));await db.delete(appUsers).where(inArray(appUsers.id,ids));}
  await pool.end();
}
process.exit(fail ? 1 : 0);

"use client";
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Sparkles,Ticket,ShieldCheck,Mic,FileBarChart2,GraduationCap,ChevronRight,ArrowRight} from 'lucide-react';
import {useApp,api} from './ui';
import {IrisEyeMark,IrisLockup} from './iris-mark';
import {IntroOverlay} from './intro-overlay';
import {RadarRings} from './graphics';
import {STUDIOS,CATEGORIES} from '@/lib/constants';

type TicketLite={id:number;status:string;priority:string;createdAt:string;resolvedAt:string|null;category:string;studio:string|null};

function CountUp({value,duration=1400}:{value:number;duration?:number}){
  const[display,setDisplay]=useState(0);const ref=useRef<HTMLSpanElement>(null);const started=useRef(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting&&!started.current){started.current=true;const s=performance.now();const tick=(n:number)=>{const p=Math.min(1,(n-s)/duration);setDisplay(Math.round((1-Math.pow(1-p,3))*value));if(p<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);}},{threshold:.3});obs.observe(el);return()=>obs.disconnect();},[value,duration]);
  return <span ref={ref}>{display}</span>;
}

const BOOT=['Initialising ops intelligence','Linking Momence · 5 studios','Loading taxonomy · 13 categories','Routing engine ready','Iris online'];
function BootSequence({onDone}:{onDone:()=>void}){
  const[i,setI]=useState(0);
  useEffect(()=>{if(i>=BOOT.length){const t=setTimeout(onDone,320);return()=>clearTimeout(t);}const t=setTimeout(()=>setI(i+1),i===BOOT.length-1?520:260);return()=>clearTimeout(t);},[i,onDone]);
  return <div className="lb-boot" aria-hidden="true">{BOOT.slice(0,i).map((l,k)=><div key={l} className={'lb-boot-line'+(k===i-1?' current':'')}><span className="lb-boot-ok">✓</span>{l}</div>)}</div>;
}

const PHRASES=['logs it in one sentence.','routes it to the right desk.','links the member & the class.','tracks it to resolution.','never lets a snag slip.'];
function Typewriter(){
  const[idx,setIdx]=useState(0);const[text,setText]=useState('');const[del,setDel]=useState(false);
  useEffect(()=>{const full=PHRASES[idx];const t=setTimeout(()=>{if(!del){const n=full.slice(0,text.length+1);setText(n);if(n===full)setTimeout(()=>setDel(true),1600);}else{const n=full.slice(0,text.length-1);setText(n);if(!n){setDel(false);setIdx(i=>(i+1)%PHRASES.length);}}},del?26:56);return()=>clearTimeout(t);},[text,del,idx]);
  return <span className="lb-type">{text}<span className="lb-caret"/></span>;
}

/** Orbiting gold particles + data-ring behind Iris — canvas, cheap, reduced-motion aware. */
function Halo({rgb='255,209,102'}:{rgb?:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const c=ref.current;if(!c)return;const ctx=c.getContext('2d');if(!ctx)return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    let w=0,h=0,raf=0,t=0;const dpr=Math.min(2,devicePixelRatio||1);
    const resize=()=>{w=c.width=c.offsetWidth*dpr;h=c.height=c.offsetHeight*dpr;};resize();window.addEventListener('resize',resize);
    const orbit=Array.from({length:3},(_,i)=>({r:.30+i*.085,speed:(.12+i*.05)*(i%2?-1:1),n:18+i*10,ph:i*1.3}));
    const dust=Array.from({length:70},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.4+.3,vy:-(Math.random()*.00035+.00008),a:Math.random()*.5+.2,ph:Math.random()*6.28}));
    const draw=()=>{
      t+=.016;ctx.clearRect(0,0,w,h);const cx=w/2,cy=h*.52,R=Math.min(w,h);
      for(const d of dust){d.y+=d.vy;if(d.y<-.02){d.y=1.02;d.x=Math.random();}const a=d.a*(.55+.45*Math.sin(t*1.3+d.ph));ctx.beginPath();ctx.arc(d.x*w,d.y*h,d.r*dpr,0,6.28);ctx.fillStyle=`rgba(${rgb},${a})`;ctx.fill();}
      for(const o of orbit){
        ctx.beginPath();ctx.arc(cx,cy,o.r*R,0,6.28);ctx.strokeStyle=`rgba(${rgb},.10)`;ctx.lineWidth=1*dpr;ctx.stroke();
        for(let k=0;k<o.n;k++){const ang=o.ph+t*o.speed+k/o.n*6.28;const px=cx+Math.cos(ang)*o.r*R,py=cy+Math.sin(ang)*o.r*R*.62;const depth=(Math.sin(ang)+1)/2;const a=.18+depth*.75;const sz=(.9+depth*1.8)*dpr;ctx.beginPath();ctx.arc(px,py,sz,0,6.28);ctx.fillStyle=`rgba(${rgb},${a})`;ctx.shadowBlur=10*dpr;ctx.shadowColor=`rgba(${rgb},.9)`;ctx.fill();ctx.shadowBlur=0;}
      }
      raf=requestAnimationFrame(draw);
    };draw();
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);};
  },[]);
  return <canvas ref={ref} className="lb-halo" aria-hidden="true"/>;
}

const FEATURES=[
  {icon:Sparkles,label:'Talk to Iris',desc:'Describe what you saw or heard — Iris drafts the whole ticket.',href:'/iris',tone:''},
  {icon:Mic,label:'Voice logging',desc:'Speak it out loud on the floor. Iris transcribes and replies back.',href:'/iris',tone:'purple'},
  {icon:Ticket,label:'Guided templates',desc:'Dozens of ready-made forms for every situation, pre-filled and routed.',href:'/templates',tone:'amber'},
  {icon:FileBarChart2,label:'30+ reports · 7 formats',desc:'Filterable, exportable reports for every category, studio and team.',href:'/reports',tone:'green'},
  {icon:GraduationCap,label:'Trainer scorecards',desc:'Weighted assessments and feedback, consolidated per trainer.',href:'/trainers',tone:''},
  {icon:ShieldCheck,label:'Private resolutions',desc:'Only the owner and their manager ever see resolution notes.',href:'/tickets',tone:'purple'},
];

export function LandingHero(){
  const{user,theme}=useApp();
  const pal: 'gold'|'blue'=theme==='dark'?'gold':'blue';
  const[tickets,setTickets]=useState<TicketLite[]>([]);
  const[booted,setBooted]=useState(false);
  const stage=useRef<HTMLElement>(null);
  const[tilt,setTilt]=useState({x:0,y:0});

  useEffect(()=>{void api<{tickets:TicketLite[]}>('/api/tickets').then(d=>setTickets(d.tickets)).catch(()=>{});},[]);
  useEffect(()=>{
    if(window.matchMedia('(pointer: coarse)').matches||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const on=(e:MouseEvent)=>{const r=stage.current?.getBoundingClientRect();if(!r)return;setTilt({x:(e.clientX-r.left)/r.width-.5,y:(e.clientY-r.top)/r.height-.5});};
    window.addEventListener('mousemove',on,{passive:true});return()=>window.removeEventListener('mousemove',on);
  },[]);

  const open=tickets.filter(t=>!['resolved','closed','recorded'].includes(t.status));
  const today=tickets.filter(t=>t.resolvedAt&&new Date(t.resolvedAt).toDateString()===new Date().toDateString());
  const critical=open.filter(t=>t.priority==='critical').length;
  const stats=useMemo(()=>[{l:'Tickets logged',v:tickets.length},{l:'Open right now',v:open.length},{l:'Resolved today',v:today.length},{l:'Studios live',v:STUDIOS.length}],[tickets.length,open.length,today.length]);
  // Reveal is time-based, never gated on image load events (which don't fire for cached images).
  // It starts only after the opening animation lifts, so the hero choreography
  // (title reveal, frame rise, stat cards) plays as the curtain parts.
  const[introDone,setIntroDone]=useState(false);
  const[ready,setReady]=useState(false);
  const[sealed,setSealed]=useState(false);
  useEffect(()=>{if(!introDone)return;const t=setTimeout(()=>setReady(true),120);return()=>clearTimeout(t);},[introDone]);
  // The identity scan runs its course, then seals: no infinite loop.
  useEffect(()=>{if(!ready)return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setSealed(true);return;}const t=setTimeout(()=>setSealed(true),1600+2*2600);return()=>clearTimeout(t);},[ready]);

  return (
    <div className={'lb'+(ready?' lb-ready':'')}>
      {!introDone&&<IntroOverlay palette={pal} onDone={()=>setIntroDone(true)}/>}
      <div className="lb-bg" aria-hidden="true"/>
      <header className="lb-top">
        <Link href="/" className="lb-brand"><IrisLockup size={46} palette={pal}/></Link>
        <nav className="lb-nav"><Link href="/iris">Iris</Link><Link href="/tickets">Tickets</Link><Link href="/templates">Templates</Link><Link href="/reports">Reports</Link><Link href="/dashboard" className="btn btn-primary btn-sm">Enter workspace <ArrowUpRight size={12}/></Link></nav>
      </header>

      <section className="lb-stage" ref={stage}>
        {/* Centre: Iris */}
        <div className="lb-center" style={{transform:`translate3d(${tilt.x*-14}px,${tilt.y*-10}px,0)`}}>
          <Halo rgb={theme==="dark"?"255,209,102":"21,84,214"}/>
          <RadarRings className="radar-rings lb-radar"/>
          <div className="lb-glow"/>
          <div className={'lb-frame'+(sealed?' sealed':'')}>
            <img src="/images/iris-hero-dark.webp" alt="Iris — the Physique 57 India operations assistant" className="lb-img lb-img-dark" fetchPriority="high"/>
            <img src="/images/iris-hero.webp" alt="" aria-hidden="true" className="lb-img lb-img-light"/>
            <div className="lb-frame-fade"/>
            <span className="lb-corner tl"/><span className="lb-corner tr"/><span className="lb-corner bl"/><span className="lb-corner br"/>
            {!sealed&&<div className="lb-scan" aria-hidden="true"/>}
            <div className={'lb-locked'+(sealed?' on':'')} role="status"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6.2l2.6 2.6L10 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>IDENTITY LOCKED</div>
          </div>
          {!booted&&<BootSequence onDone={()=>setBooted(true)}/>}
          <div className="lb-status">
            <span className="lb-status-dot"/><span>IRIS · ONLINE</span><i/><span>{open.length} OPEN</span>{critical>0&&<><i/><span className="lb-status-crit">{critical} CRITICAL</span></>}
          </div>
        </div>

        {/* Left: headline */}
        <div className="lb-left">
          <div className="lb-eyebrow"><IrisEyeMark size={16} palette={pal}/> ISSUE RESOLUTION &amp; INTELLIGENCE SYSTEM</div>
          <h1 className="lb-title"><span className="lb-w">Meet</span> <span className="lb-w lb-gold">Iris.</span></h1>
          <p className="lb-tag">Your team&rsquo;s ticket intelligence that<br/><Typewriter/></p>
          <p className="lb-sub">Say what happened. Iris classifies it, links the right member or class, routes it to the right desk and tracks it through to resolution.</p>
          <div className="lb-cta">
            <Link href="/iris" className="btn btn-primary lb-cta-p"><Sparkles size={15}/> Start logging with Iris</Link>
            <Link href="/dashboard" className="btn lb-cta-s">Command centre <ChevronRight size={14}/></Link>
          </div>
        </div>

        {/* Right: live stats + cards */}
        <div className="lb-right">
          <div className="lb-stats">{stats.map((s,i)=><div className="lb-stat" key={s.l} style={{animationDelay:(1.1+i*.1)+'s'}}><strong><CountUp value={s.v}/></strong><span>{s.l}</span></div>)}</div>
          <div className="lb-cards">
            <div className="lb-card" style={{animationDelay:'1.4s'}}><span className="metric-icon amber"><Ticket size={13}/></span><div><strong>Bike fault · PowerCycle</strong><small>Auto-routed to Ops · 48h relapse check set</small></div></div>
            <div className="lb-card" style={{animationDelay:'1.6s'}}><span className="metric-icon green"><ShieldCheck size={13}/></span><div><strong>Resolution locked</strong><small>Visible to owner &amp; manager only</small></div></div>
            <div className="lb-card" style={{animationDelay:'1.8s'}}><span className="metric-icon purple"><Mic size={13}/></span><div><strong>Voice-to-ticket</strong><small>“AC at Kemps blowing warm air” → filed</small></div></div>
          </div>
          <Link href="/reports" className="lb-link">Explore 30+ reports <ArrowRight size={13}/></Link>
        </div>
      </section>

      <div className="lb-ticker" aria-hidden="true"><div className="lb-ticker-track">{[...CATEGORIES,...CATEGORIES].map((c,i)=><span key={i}><i/>{c}</span>)}</div></div>

      <section className="lb-features" id="features">
        <div className="lb-features-head"><div className="eyebrow" style={{color:'var(--l-gold)'}}>EVERYTHING IN ONE PLACE</div><h2>Built for the pace of a studio floor</h2></div>
        <div className="landing-feature-grid">{FEATURES.map((f,i)=>{const I=f.icon;return <Link href={f.href} key={f.label} className="landing-feature-card" style={{animationDelay:(i*.06)+'s'}}><span className={'metric-icon '+f.tone} style={{marginBottom:14}}><I size={17}/></span><strong>{f.label}</strong><p>{f.desc}</p><span className="landing-feature-arrow"><ArrowUpRight size={14}/></span></Link>;})}</div>
      </section>

      <footer className="landing-footer"><span>{user?`Signed in as ${user.name}`:'Preview workspace · sign in from any page'}</span><span>Crafted for Physique 57 India <span style={{color:'var(--l-gold)'}}>✧</span></span></footer>
    </div>
  );
}

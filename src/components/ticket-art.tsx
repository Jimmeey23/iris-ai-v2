/**
 * Ticket illustration set — the same visual grammar as `graphics.tsx`: thin strokes,
 * rounded joins, a single hue carried by `currentColor`, and a soft stage behind the
 * subject. Every piece is inline SVG, so it themes automatically, prints, scales to
 * any size and costs a few hundred bytes instead of a raster round-trip.
 *
 * The one raster exception is `PersonPhoto`, which shows a real trainer headshot when
 * we have one and falls back to the initials avatar when we do not.
 */
"use client";
import {useEffect,useState} from 'react';
import Image from 'next/image';
import {getTrainerImage} from '@/lib/constants';
import {Avatar} from './ui';

/* ── Category glyphs ──────────────────────────────────────────────────────── */

/** Each category gets its own line-art subject drawn on a 200×140 stage. */
function Glyph({id,tone='accent',children}:{id:string;tone?:string;children:React.ReactNode}){
  const hue=`var(--${tone})`;
  return <svg viewBox="0 0 200 140" fill="none" aria-hidden="true" className="ticket-art-svg" style={{color:hue}}>
    <defs>
      <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.55">
        <stop offset="0" stopColor="currentColor" stopOpacity="0.2"/>
        <stop offset="1" stopColor="currentColor" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="currentColor" stopOpacity="0.95"/>
        <stop offset="1" stopColor="currentColor" stopOpacity="0.4"/>
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="72" rx="74" ry="54" fill={`url(#${id}-glow)`}/>
    <g stroke={`url(#${id}-fade)`} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">{children}</g>
  </svg>;
}

/** Category → the accent colour its artwork is drawn in. */
export const CATEGORY_TONE:Record<string,string>={
  'Scheduling':'accent','Class Experience':'purple','Trainer Feedback':'purple','Repair and Maintenance':'amber',
  'Studio Amenities and Facilities':'blue','Operating Systems':'blue','Tech Issues':'blue',
  'Pricing and Memberships':'green','Customer Service and Communication':'accent','Brand Feedback':'purple',
  'Safety and Security':'red','Theft and Lost Items':'red','Miscellaneous':'accent',
};

export function CategoryArt({category,className=''}:{category:string;className?:string}){
  const tone=CATEGORY_TONE[category]||'accent';
  const id='cat-'+category.toLowerCase().replace(/[^a-z]+/g,'-');
  const art=(()=>{switch(category){
    case 'Scheduling':return <>
      <rect x="62" y="38" width="76" height="66" rx="9"/>
      <path d="M62 58h76M80 30v14M120 30v14"/>
      <path d="M78 74h12M110 74h12M78 90h12M110 90h12" strokeOpacity=".55"/>
      <circle cx="138" cy="94" r="17" strokeOpacity=".9"/><path d="M138 86v9l6 4"/>
    </>;
    case 'Class Experience':return <>
      <path d="M46 98c0-16 12-27 28-27s28 11 28 27"/><circle cx="74" cy="52" r="14"/>
      <path d="M112 98c0-12 9-20 20-20s20 8 20 20" strokeOpacity=".5"/><circle cx="132" cy="60" r="10" strokeOpacity=".5"/>
      <path d="M34 104h132" strokeOpacity=".2" strokeDasharray="1 7"/>
      <path d="M150 34l3-8 3 8 8 3-8 3-3 8-3-8-8-3z" strokeOpacity=".6"/>
    </>;
    case 'Trainer Feedback':return <>
      <circle cx="100" cy="52" r="16"/><path d="M68 104c0-18 14-30 32-30s32 12 32 30"/>
      <path d="M100 24l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" strokeOpacity=".55" transform="translate(0,-4) scale(1)"/>
      <path d="M146 60l4-9 4 9 9 4-9 4-4 9-4-9-9-4z" strokeOpacity=".5"/>
    </>;
    case 'Repair and Maintenance':return <>
      <path d="M118 46a17 17 0 00-23 22L62 101a8 8 0 0011 11l33-33a17 17 0 0022-23l-11 11-11-3-3-11z"/>
      <circle cx="140" cy="46" r="15" strokeOpacity=".45"/><path d="M140 36v20M130 46h20" strokeOpacity=".45"/>
    </>;
    case 'Studio Amenities and Facilities':return <>
      <path d="M46 102V60l30-20 30 20v42"/><path d="M106 102V72h40v30"/><path d="M36 102h132"/>
      <rect x="64" y="72" width="16" height="16" rx="3" strokeOpacity=".55"/>
      <path d="M120 84h12M120 92h12" strokeOpacity=".5"/>
    </>;
    case 'Operating Systems':return <>
      <rect x="52" y="40" width="96" height="60" rx="8"/><path d="M52 58h96" strokeOpacity=".5"/>
      <circle cx="64" cy="49" r="2.6" strokeOpacity=".7"/><circle cx="74" cy="49" r="2.6" strokeOpacity=".7"/>
      <path d="M72 74l10 9-10 9M92 92h24" strokeOpacity=".7"/>
      <path d="M86 112h28M100 100v12" strokeOpacity=".4"/>
    </>;
    case 'Tech Issues':return <>
      <rect x="56" y="42" width="88" height="58" rx="8"/><path d="M84 112h32M100 100v12" strokeOpacity=".45"/>
      <path d="M104 54l-14 22h20l-14 22" strokeWidth="2.4"/>
      <path d="M148 50l3-7 3 7 7 3-7 3-3 7-3-7-7-3z" strokeOpacity=".5"/>
    </>;
    case 'Pricing and Memberships':return <>
      <rect x="48" y="50" width="104" height="60" rx="10"/><path d="M48 68h104" strokeOpacity=".5"/>
      <path d="M66 88h26M66 98h14" strokeOpacity=".6"/>
      <circle cx="130" cy="92" r="15"/><path d="M130 85v14M126 89h6a3.5 3.5 0 010 7h-4a3.5 3.5 0 000 7h6" strokeOpacity=".75" strokeWidth="1.4"/>
      <path d="M62 38l8 8-8 8" strokeOpacity=".35"/>
    </>;
    case 'Customer Service and Communication':return <>
      <path d="M46 44h78a8 8 0 018 8v30a8 8 0 01-8 8H78l-20 16V90h-12a8 8 0 01-8-8V52a8 8 0 018-8z"/>
      <path d="M64 60h42M64 72h26" strokeOpacity=".55"/>
      <path d="M134 62h24a8 8 0 018 8v22a8 8 0 01-8 8h-4v12l-14-12h-6a8 8 0 01-8-8" strokeOpacity=".45"/>
    </>;
    case 'Brand Feedback':return <>
      <path d="M100 32l17 34 38 5-28 26 7 37-34-18-34 18 7-37-28-26 38-5z"/>
      <path d="M40 112h120" strokeOpacity=".2" strokeDasharray="1 7"/>
    </>;
    case 'Safety and Security':return <>
      <path d="M100 28l40 15v30c0 26-17 42-40 51-23-9-40-25-40-51V43z"/>
      <path d="M100 58v22M100 90v3" strokeWidth="2.6"/>
      <path d="M36 70h16M148 70h16" strokeOpacity=".35"/>
    </>;
    case 'Theft and Lost Items':return <>
      <rect x="58" y="62" width="84" height="48" rx="9"/><path d="M76 62V50a24 24 0 0148 0v12"/>
      <circle cx="100" cy="84" r="6"/><path d="M100 90v8"/>
      <path d="M40 40l24 18M160 40l-24 18" strokeOpacity=".3"/>
    </>;
    default:return <>
      <rect x="54" y="44" width="92" height="60" rx="10"/><path d="M54 64h92" strokeOpacity=".5"/>
      <path d="M72 82h40M72 92h24" strokeOpacity=".55"/>
      <circle cx="140" cy="36" r="10" strokeOpacity=".45"/>
    </>;
  }})();
  return <div className={'ticket-art '+className} data-tone={tone}><Glyph id={id} tone={tone}>{art}</Glyph></div>;
}

/* ── Hero backdrop ────────────────────────────────────────────────────────── */

/** Decorative concentric arcs + dot field behind the ticket hero. Purely ornamental. */
export function HeroBackdrop({tone='accent'}:{tone?:string}){
  return <svg className="hero-backdrop" viewBox="0 0 480 220" fill="none" aria-hidden="true" style={{color:`var(--${tone})`}}>
    <defs>
      <pattern id="hb-dots" width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="1.4" cy="1.4" r="1.4" fill="currentColor" fillOpacity="0.5"/>
      </pattern>
      <linearGradient id="hb-mask" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="white" stopOpacity="0"/><stop offset="1" stopColor="white" stopOpacity="1"/>
      </linearGradient>
      <mask id="hb-fade"><rect width="480" height="220" fill="url(#hb-mask)"/></mask>
    </defs>
    <g mask="url(#hb-fade)" opacity="0.5">
      <rect width="480" height="220" fill="url(#hb-dots)" opacity="0.28"/>
      {[62,104,146,188].map(r=><circle key={r} cx="430" cy="34" r={r} stroke="currentColor" strokeOpacity="0.16" strokeWidth="1"/>)}
    </g>
  </svg>;
}

/* ── SLA ring ─────────────────────────────────────────────────────────────── */

/** How much of the follow-up window has been spent, as a ring. Reuses `.progress-ring`. */
export function SlaRing({createdAt,slaDueAt,status,size=74}:{createdAt:string;slaDueAt?:string|null;status:string;size?:number}){
  // Ticks with the countdown beside it so the ring and the number never disagree.
  const[now,setNow]=useState(()=>new Date(createdAt).getTime());
  useEffect(()=>{const first=setTimeout(()=>setNow(Date.now()),0);const t=setInterval(()=>setNow(Date.now()),30000);return()=>{clearTimeout(first);clearInterval(t);};},[]);
  const done=['resolved','closed','recorded'].includes(status);
  const start=new Date(createdAt).getTime();
  const due=slaDueAt?new Date(slaDueAt).getTime():0;
  const span=due-start;
  const spent=span>0?Math.min(1.35,(now-start)/span):0;
  // No follow-up window means there is nothing to fill: show the bare track, not a
  // full ring, which would otherwise read as "complete".
  const pct=!slaDueAt?0:done?1:Math.min(1,spent);
  const tone=!slaDueAt?'muted':done?'green':spent>=1?'red':spent>=0.75?'amber':'green';
  const r=(size-9)/2, c=2*Math.PI*r;
  const label=!slaDueAt?'—':done?'done':Math.round(Math.min(spent,1.35)*100)+'%';
  return <div className="progress-ring sla-ring" style={{width:size,height:size,color:`var(--${tone})`}} role="img" aria-label={`Follow-up window ${label} elapsed`}>
    <svg viewBox={`0 0 ${size} ${size}`}>
      <circle className="pr-track" cx={size/2} cy={size/2} r={r} strokeWidth="5"/>
      <circle className="pr-value" cx={size/2} cy={size/2} r={r} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c*(1-pct)} transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
    <b>{label}</b>
  </div>;
}

/* ── People ───────────────────────────────────────────────────────────────── */

/** A real headshot when we have one on file, the initials avatar when we do not. */
export function PersonPhoto({name,size=44,tone='',caption}:{name:string;size?:number;tone?:string;caption?:string}){
  const raw=getTrainerImage(name);const src=raw?encodeURI(raw):null;
  if(!src)return <span className="person-photo person-photo-fallback" style={{width:size,height:size}}><Avatar name={name} tone={tone} large={size>40}/></span>;
  return <span className="person-photo" style={{width:size,height:size}} title={caption||name}>
    <Image src={src} alt={name} width={size} height={size} className="person-photo-img" unoptimized/>
  </span>;
}

/* ── Sentiment ────────────────────────────────────────────────────────────── */

const SENTIMENT:Record<string,{tone:string;level:number;face:string}>={
  positive:{tone:'green',level:4,face:'M78 86c6 7 14 11 22 11s16-4 22-11'},
  neutral:{tone:'blue',level:2.5,face:'M78 90h44'},
  frustrated:{tone:'amber',level:1.5,face:'M78 95c6-7 14-11 22-11s16 4 22 11'},
  negative:{tone:'red',level:0.6,face:'M76 98c7-9 17-14 24-14s17 5 24 14'},
};

/** A face plus a four-step meter — sentiment read at a glance, not as a word. */
export function SentimentArt({sentiment}:{sentiment:string}){
  const s=SENTIMENT[sentiment]||SENTIMENT.neutral;
  return <div className="sentiment-art" style={{color:`var(--${s.tone})`}}>
    <svg viewBox="0 0 200 140" fill="none" aria-hidden="true" className="sentiment-face">
      <circle cx="100" cy="72" r="46" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.7"/>
      <circle cx="82" cy="58" r="4.2" fill="currentColor"/><circle cx="118" cy="58" r="4.2" fill="currentColor"/>
      <path d={s.face} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
    </svg>
    <div className="sentiment-meter" aria-label={`Sentiment: ${sentiment}`}>
      {[1,2,3,4].map(n=><span key={n} className={n<=Math.round(s.level)?'on':''}/>)}
    </div>
    <small>{sentiment}</small>
  </div>;
}

/* ── Timeline icons ───────────────────────────────────────────────────────── */

/** A small marker per activity type, so the timeline scans by shape as well as text. */
export function ActivityGlyph({action}:{action:string}){
  const kind=action.includes('resolv')||action.includes('clos')?'done'
    :action.includes('escalat')?'alert'
    :action.includes('assign')||action.includes('rout')?'owner'
    :action.includes('link')||action.includes('duplicat')?'link'
    :action.includes('comment')||action.includes('note')?'note':'created';
  const path={
    done:'M5 10.5l3.4 3.4L15 6.6',alert:'M10 4.5l6.5 11h-13z M10 9v3 M10 14.2v.3',
    owner:'M10 9.5a3 3 0 100-6 3 3 0 000 6z M4.5 16.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5',
    link:'M8.5 11.5l3-3 M7 13a3 3 0 010-4.2l1-1a3 3 0 014.2 0 M13 7a3 3 0 010 4.2l-1 1a3 3 0 01-4.2 0',
    note:'M4.5 5.5h11v7h-6l-3 3v-3h-2z',created:'M10 4.5v11 M4.5 10h11',
  }[kind];
  return <span className={'activity-glyph tg-'+kind} aria-hidden="true">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>
  </span>;
}

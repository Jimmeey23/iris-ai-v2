"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

const STAGES=[
  {at:0,label:'Waking Iris…'},
  {at:22,label:'Linking studios…'},
  {at:48,label:'Loading taxonomy…'},
  {at:74,label:'Calibrating routes…'},
  {at:94,label:'Iris online'},
];

/** Hard ceiling — the curtain never outstays this, even if the clip stalls. */
const MAX_MS=10500;
/** Fallback duration when the video can't play at all (blocked autoplay, decode error). */
const FALLBACK_MS=2300;
const EXIT_MS=700;

const SOURCES:Record<'gold'|'blue',{src:string;poster:string}>={
  // Dark mode → the gold cinematic opening.
  gold:{src:'/video/iris-intro-dark.mp4',poster:'/video/iris-intro-dark.webp'},
  // Light mode → the blue circuitry opening.
  blue:{src:'/video/iris-intro-light.mp4',poster:'/video/iris-intro-light.webp'},
};

/**
 * Full-screen cinematic opening for the home page: the branded IRIS Ai clip
 * plays full-bleed (gold in dark mode, blue in light) with the wordmark and a
 * staged progress line layered over it, then the whole curtain lifts to reveal
 * the hero. Plays once per tab session, skippable, bypassed entirely for
 * reduced-motion users, and it degrades to a timed curtain if the video cannot
 * play (blocked autoplay, decode failure, missing file).
 */
export function IntroOverlay({onDone,palette='gold'}:{onDone:()=>void;palette?:'gold'|'blue'}){
  const[progress,setProgress]=useState(0);
  const[leaving,setLeaving]=useState(false);
  const[playing,setPlaying]=useState(false);
  const done=useRef(false);
  const video=useRef<HTMLVideoElement>(null);
  // Held in a ref so the opening sequence below is set up exactly once, even if
  // the parent hands us a new callback identity on re-render.
  const finish=useRef(onDone);
  useEffect(()=>{finish.current=onDone;},[onDone]);

  /** Lift the curtain, then hand the page over — used by both the clip end and the timers. */
  const close=useCallback(()=>{
    if(done.current)return;
    done.current=true;
    sessionStorage.setItem('iris-intro-seen','1');
    setLeaving(true);
    setTimeout(()=>finish.current(),EXIT_MS);
  },[]);

  /** Skip: no curtain animation, straight to the hero. */
  const skip=useCallback(()=>{
    if(done.current)return;
    done.current=true;
    sessionStorage.setItem('iris-intro-seen','1');
    finish.current();
  },[]);

  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){finish.current();return;}
    if(sessionStorage.getItem('iris-intro-seen')){finish.current();return;}

    const el=video.current;
    // Attempt playback. Browsers only autoplay muted inline video, and even then
    // the promise can reject — fall back to a plain timed curtain when it does.
    const play=el?.play();
    let fallback=0;
    if(play){
      void play.then(()=>setPlaying(true)).catch(()=>{
        fallback=window.setTimeout(close,FALLBACK_MS);
      });
    }else{
      fallback=window.setTimeout(close,FALLBACK_MS);
    }

    // Safety net: never hold the page hostage to a stalled clip.
    const ceiling=window.setTimeout(close,MAX_MS);

    const prev=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'||e.key==='Enter'||e.key===' '){e.preventDefault();skip();}};
    window.addEventListener('keydown',onKey);
    return()=>{
      clearTimeout(ceiling);
      if(fallback)clearTimeout(fallback);
      document.body.style.overflow=prev;
      window.removeEventListener('keydown',onKey);
    };
  },[close,skip]);

  // Progress tracks the clip itself so the status line stays honest.
  const onTime=()=>{
    const el=video.current;
    if(!el||!el.duration||!isFinite(el.duration))return;
    setProgress(Math.min(100,Math.round(el.currentTime/el.duration*100)));
  };

  const stage=[...STAGES].reverse().find(s=>progress>=s.at)??STAGES[0];
  const{src,poster}=SOURCES[palette];

  return (
    <div className={'intro intro-video-mode'+(leaving?' intro-leave':'')} role="presentation" aria-hidden="true" onClick={skip}>
      <video
        ref={video}
        className={'intro-video'+(playing?' on':'')}
        src={src}
        poster={poster}
        muted
        playsInline
        autoPlay
        preload="auto"
        onTimeUpdate={onTime}
        onEnded={close}
        onError={()=>{window.setTimeout(close,FALLBACK_MS);}}
      />
      <div className="intro-video-scrim"/>
      <div className="intro-inner">
        <div className="intro-word" aria-hidden="true">
          {'IRIS'.split('').map((ch,i)=><span key={i} style={{animationDelay:(0.35+i*0.07)+'s'}}>{ch}</span>)}
          <em style={{animationDelay:'0.7s'}}>Ai</em>
        </div>
        <div className="intro-sub">ISSUE RESOLUTION &amp; INTELLIGENCE SYSTEM</div>
        <div className="intro-tag">Operations intelligence, choreographed.</div>
        <div className="intro-bar"><span style={{width:progress+'%'}}/></div>
        <div className="intro-status"><span className="intro-pct">{progress}%</span><span className="intro-stage">{stage.label}</span></div>
      </div>
      <div className="intro-skip">Click anywhere to skip</div>
    </div>
  );
}

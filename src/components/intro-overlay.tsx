"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';

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

/** The store never changes after mount, so subscribing is a no-op. It has to be
 *  referentially stable or `useSyncExternalStore` re-subscribes every render. */
const subscribeNoop=()=>()=>{};
/** On the server the curtain must not exist — see `shouldPlay`. */
const serverSnapshot=()=>false;

/**
 * Should the curtain play on this visit?
 *
 * Read through `useSyncExternalStore` rather than `useState` + an effect, for two
 * reasons. First, it depends on `matchMedia` and `sessionStorage`, neither of
 * which exists during server rendering, so the answer genuinely differs between
 * server and client — which is exactly what that hook is for. Second, and more
 * importantly, the server snapshot is `false`, so the `<video>` element is absent
 * from the SSR markup.
 *
 * That matters: the clip used to be in the initial HTML with `preload="auto"`,
 * so the browser started pulling a 1.9MB (dark) or 4.6MB (light) file from the
 * HTML stream itself — before a line of JS had run, and including on repeat
 * visits where the effect immediately bailed out and threw it away. Returning
 * visitors now render no curtain at all, not even a one-frame black flash.
 */
function shouldPlay(){
  if(typeof window==='undefined')return false;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
  try{return !sessionStorage.getItem('iris-intro-seen');}catch{return true;}
}

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

  const armed=useSyncExternalStore(subscribeNoop,shouldPlay,serverSnapshot);

  /** Lift the curtain, then hand the page over — used by both the clip end and the timers. */
  const close=useCallback(()=>{
    if(done.current)return;
    done.current=true;
    setLeaving(true);
    // The "seen" flag is written at the same moment we hand over, not when the
    // exit starts. Writing it earlier would flip `armed` mid-animation and
    // unmount the video while the curtain was still lifting.
    window.setTimeout(()=>{
      try{sessionStorage.setItem('iris-intro-seen','1');}catch{}
      finish.current();
    },EXIT_MS);
  },[]);

  /** Skip: no curtain animation, straight to the hero. */
  const skip=useCallback(()=>{
    if(done.current)return;
    done.current=true;
    try{sessionStorage.setItem('iris-intro-seen','1');}catch{}
    finish.current();
  },[]);

  useEffect(()=>{
    // Nothing to play — release the page immediately and render no curtain.
    if(!armed){finish.current();return;}

    const el=video.current;
    // React does not emit `muted` into the SSR markup (it sets the DOM property on
    // hydration), so a clip that carries an audio track is treated as unmuted and
    // blocked by autoplay policy. Assert it here before asking to play.
    if(el){el.muted=true;el.defaultMuted=true;}
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
  },[armed,close,skip]);

  // Progress tracks the clip itself so the status line stays honest.
  const onTime=()=>{
    const el=video.current;
    if(!el||!el.duration||!isFinite(el.duration))return;
    setProgress(Math.min(100,Math.round(el.currentTime/el.duration*100)));
  };

  // Every hook has run, so bailing out here is safe — and it is what keeps the
  // curtain out of the HTML for the visits that were never going to show it.
  if(!armed)return null;

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
        /* Mounted only once we know we intend to play, so eager preloading is
           now the right call instead of a multi-megabyte waste on skipped visits. */
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

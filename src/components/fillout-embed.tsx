"use client";
import {useEffect,useRef,useState} from 'react';
import type {EmbedKind} from '@/lib/forms';

const SCRIPTS:Record<EmbedKind,string>={
  'fillout-v1':'https://server.fillout.com/embed/v1/',
  'zite-v2':'https://server.fillout.com/embed/v2-zite/',
};

/**
 * Renders one Fillout or Zite form. Both runtimes work by scanning the DOM for a
 * `data-*` host element when their script executes, so switching forms has to
 * re-run the script — it will not notice a host that mounts after it loaded.
 *
 * Mount this with `key={embedId}`: the loading state lives in this component, and
 * a remount is what resets it when the reader picks a different form.
 */
export function FilloutEmbed({embedId,kind,height,params}:{embedId:string;kind:EmbedKind;height:number;params?:Record<string,string>}){
  const[ready,setReady]=useState(false);
  const[slow,setSlow]=useState(false);
  const host=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    // The form is ready when the embed script has put its iframe in the host —
    // not when the script file finishes loading, which says nothing about whether
    // it found this host or managed to render into it.
    const node=host.current;
    if(!node)return;
    const check=()=>{if(node.querySelector('iframe')){setReady(true);return true;}return false;};
    const observer=new MutationObserver(()=>{if(check())observer.disconnect();});
    if(!check())observer.observe(node,{childList:true,subtree:true});

    // Remove any previous copy so the freshly appended script re-scans for this host.
    for(const old of document.querySelectorAll(`script[src="${SCRIPTS[kind]}"]`))old.remove();
    const script=document.createElement('script');
    script.src=SCRIPTS[kind];
    script.async=true;
    document.body.appendChild(script);

    const timer=setTimeout(()=>setSlow(true),6000);
    return()=>{observer.disconnect();clearTimeout(timer);};
  },[kind,embedId]);

  const attrs:Record<string,string>=kind==='zite-v2'
    ?{'data-zite-id':embedId,'data-zite-embed-type':'standard','data-zite-inherit-parameters':''}
    :{'data-fillout-id':embedId,'data-fillout-embed-type':'standard','data-fillout-inherit-parameters':'','data-fillout-dynamic-resize':''};
  for(const[k,v]of Object.entries(params??{}))attrs[`data-${kind==='zite-v2'?'zite':'fillout'}-${k}`]=v;

  return (
    <div className="form-embed" style={{minHeight:height}}>
      {!ready&&(
        <div className="form-embed-loading" style={{height}}>
          <div className="form-embed-skeleton">
            {[0,1,2,3,4].map(i=><span key={i} className="skeleton-line" style={{height:i===0?30:16,animationDelay:i*90+'ms'}}/>)}
          </div>
          <p className="eyebrow">{slow?'Still loading the form…':'Loading form'}</p>
        </div>
      )}
      <div ref={host} style={{width:'100%',height}} {...attrs}/>
    </div>
  );
}

"use client";
import {useEffect} from 'react';

/** Segment error boundary. Server-side failures are already logged with the same
 *  digest by `onRequestError` in src/instrumentation.ts; this logs the client side
 *  so a reported digest can be matched to both halves in the Vercel logs. */
export default function WorkspaceError({error,retry}:{error:Error&{digest?:string};retry:()=>void}){
  useEffect(()=>{
    console.error(JSON.stringify({level:'error',source:'error-boundary',message:error.message,digest:error.digest,path:typeof window!=='undefined'?window.location.pathname:undefined}));
  },[error]);
  return <main style={{minHeight:'80vh',display:'grid',placeItems:'center',padding:30}}><section className="card card-pad" style={{maxWidth:460,textAlign:'center'}}><div className="eyebrow accent" style={{marginBottom:15}}>IRIS WORKSPACE</div><h1 style={{fontSize:25}}>Let’s take another look.</h1><p className="secondary" style={{margin:'15px 0 22px'}}>This view couldn’t be loaded. Your saved tickets and settings are safe. Refresh the view or return to your workspace.</p><div className="flex-row" style={{justifyContent:'center'}}><button className="btn btn-primary" onClick={retry}>Try again</button><a href="/dashboard" className="btn">Open workspace</a></div>{error.digest&&<p className="muted" style={{marginTop:18,fontSize:11}}>Reference: <code>{error.digest}</code></p>}</section></main>;
}

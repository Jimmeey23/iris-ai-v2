"use client";
import {useEffect} from 'react';

/** Replaces the root layout when it fails, so it cannot rely on globals.css, fonts
 *  or AppProvider — everything here is inline and self-contained. */
export default function GlobalError({error,retry}:{error:Error&{digest?:string};retry:()=>void}){
  useEffect(()=>{
    console.error(JSON.stringify({level:'error',source:'global-error',message:error.message,digest:error.digest,path:typeof window!=='undefined'?window.location.pathname:undefined}));
  },[error]);
  const btn:React.CSSProperties={font:'inherit',fontSize:14,fontWeight:600,padding:'10px 18px',borderRadius:10,border:'1px solid #2a2a33',background:'transparent',color:'inherit',cursor:'pointer',textDecoration:'none'};
  return <html lang="en">
    <head><title>Something went wrong · IRIS</title><meta name="robots" content="noindex,nofollow"/></head>
    <body style={{margin:0,minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#0a0a0d',color:'#ececf1',fontFamily:'system-ui,-apple-system,"Segoe UI",sans-serif'}}>
      <main style={{maxWidth:440,textAlign:'center',padding:32,borderRadius:18,border:'1px solid #22222b',background:'#131318'}}>
        <div style={{fontSize:11,letterSpacing:'.18em',fontWeight:700,color:'#b69cff',marginBottom:14}}>IRIS WORKSPACE</div>
        <h1 style={{fontSize:24,margin:'0 0 12px'}}>IRIS hit an unexpected error.</h1>
        <p style={{margin:'0 0 22px',color:'#a1a1ad',lineHeight:1.5}}>Your saved tickets and settings are safe. Try again, or reload the workspace.</p>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button type="button" onClick={retry} style={{...btn,background:'#ececf1',color:'#0a0a0d',borderColor:'#ececf1'}}>Try again</button>
          {/* A plain <a>, not <Link>: a full reload is the point — the root layout just failed. */}
          <a href="/dashboard" style={btn}>Reload workspace</a>
        </div>
        {error.digest&&<p style={{marginTop:18,fontSize:11,color:'#6e6e7a'}}>Reference: <code>{error.digest}</code></p>}
      </main>
    </body>
  </html>;
}

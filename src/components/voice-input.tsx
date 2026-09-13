"use client";
import {useRef,useState,useEffect} from 'react';
import {Mic,Square,Loader2} from 'lucide-react';
import {useApp} from './ui';

type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>;resultIndex:number})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};

/**
 * Voice capture with two layered strategies: the browser's native Speech
 * Recognition (fast, free, works well on open web pages) with an automatic
 * fallback to record + server-side Whisper transcription — which is what
 * actually works inside sandboxed preview iframes where the Web Speech API's
 * network permission is blocked. Reports `onVoiceUsed` so the chat can speak
 * its reply back once the member used voice at least once.
 */
export function VoiceInput({onText,onVoiceUsed,disabled=false}:{onText:(text:string)=>void;onVoiceUsed?:()=>void;disabled?:boolean}){
  const{notify}=useApp();
  const[recording,setRecording]=useState(false);
  const[processing,setProcessing]=useState(false);
  const[supported,setSupported]=useState(true);
  const recognizer=useRef<Recognition|null>(null);
  const recorder=useRef<MediaRecorder|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const mounted=useRef(true);
  const fellBack=useRef(false);

  useEffect(()=>{
    const w=window as unknown as {SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown};
    setSupported(Boolean(w.SpeechRecognition||w.webkitSpeechRecognition||(navigator.mediaDevices&&window.MediaRecorder)));
    return()=>{mounted.current=false;recognizer.current?.stop();if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());};
  },[]);

  async function recordAndTranscribe(){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      notify('Voice input needs microphone access, which this browser or preview window is blocking. You can still type your message.','error');
      return;
    }
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      stream.current=s;
      const mimeType=['audio/webm','audio/mp4','audio/ogg'].find(t=>window.MediaRecorder.isTypeSupported(t))||'';
      const r=new MediaRecorder(s,mimeType?{mimeType}:undefined);
      recorder.current=r;
      const chunks:Blob[]=[];
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onstop=async()=>{
        s.getTracks().forEach(t=>t.stop());
        if(!mounted.current)return;
        setRecording(false);
        if(!chunks.length){notify('No audio was captured. Try holding the mic closer and speaking right after pressing record.','error');return;}
        setProcessing(true);
        try{
          const file=new File([new Blob(chunks,{type:r.mimeType||'audio/webm'})],'voice.webm',{type:r.mimeType||'audio/webm'});
          const form=new FormData();form.append('audio',file);
          const response=await fetch('/api/iris/transcribe',{method:'POST',body:form});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||'Transcription unavailable');
          if(!data.text?.trim())throw new Error('Didn\u2019t catch that — the recording came back empty. Try again a little closer to the mic.');
          onText(data.text);
          onVoiceUsed?.();
          notify('Transcribed — review the text, then send.');
        }catch(e){notify((e as Error).message,'error');}
        finally{setProcessing(false);}
      };
      r.start();
      setRecording(true);
      setTimeout(()=>{if(r.state==='recording')r.stop();},60000);
    }catch(e){
      const name=(e as DOMException)?.name;
      notify(name==='NotAllowedError'?'Microphone access was blocked. Allow microphone access for this site, then try again.':'Microphone access is unavailable here. You can still type your message.','error');
    }
  }

  async function start(){
    if(recording){recognizer.current?.stop();if(recorder.current?.state==='recording')recorder.current.stop();setRecording(false);return;}
    const w=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
    const Speech=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(Speech&&!fellBack.current){
      try{
        const r=new Speech();
        r.lang='en-IN';r.continuous=true;r.interimResults=false;
        r.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)text+=e.results[i][0].transcript+' ';if(text.trim()){onText(text.trim());onVoiceUsed?.();}};
        r.onerror=e=>{
          setRecording(false);
          if(['not-allowed','service-not-allowed','network'].includes(e.error)){
            fellBack.current=true;
            notify('Switching to recorded voice capture for this browser…');
            void recordAndTranscribe();
            return;
          }
          notify('Voice recognition hit a snag. Retrying with recorded audio…','error');
          fellBack.current=true;void recordAndTranscribe();
        };
        r.onend=()=>setRecording(false);
        recognizer.current=r;
        r.start();
        setRecording(true);
        notify('Listening — speak now. Tap stop when you\u2019re done.');
        return;
      }catch{fellBack.current=true;}
    }
    void recordAndTranscribe();
  }

  return (
    <button
      type="button"
      disabled={disabled||processing||!supported}
      title={!supported?'Voice input is not available in this browser':recording?'Stop recording':'Voice to ticket'}
      aria-label={recording?'Stop voice dictation':'Start voice dictation'}
      className={'icon-btn'+(recording?' voice-recording':'')}
      onClick={()=>void start()}
    >
      {processing?<Loader2 size={15} className="animate-spin"/>:recording?<Square size={13}/>:<Mic size={15}/>}
    </button>
  );
}

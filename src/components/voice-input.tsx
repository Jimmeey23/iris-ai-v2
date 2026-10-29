"use client";
import {useRef,useState,useEffect,useSyncExternalStore} from 'react';
import {Mic,Square,Loader2} from 'lucide-react';
import {useApp} from './ui';

type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>;resultIndex:number})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};

// Speech-recognition/mic support never changes after mount, so there is nothing to subscribe
// to — this store exists only to give `useSyncExternalStore` a real client snapshot while
// keeping the server snapshot `false`, avoiding a hydration mismatch without setState-in-effect.
const noopSubscribe = () => () => {};
const getVoiceSupportSnapshot = () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition || (navigator.mediaDevices && window.MediaRecorder));
};
const getVoiceSupportServerSnapshot = () => false;

export type VoiceCommand = 'approve' | 'review' | 'reset' | 'discard' | 'send';

export function parseVoiceCommand(text: string): VoiceCommand | null {
  const clean = text.trim().toLowerCase().replace(/[.,!?;]/g, '');
  if (/^(approve|approve ticket|log ticket|create ticket|confirm ticket|file ticket|yes approve)$/i.test(clean)) return 'approve';
  if (/^(review draft|review ticket|show draft|open draft|see draft|check draft)$/i.test(clean)) return 'review';
  if (/^(discard draft|discard ticket|delete draft|trash draft)$/i.test(clean)) return 'discard';
  if (/^(start fresh|new chat|reset chat|clear chat|new ticket|start over)$/i.test(clean)) return 'reset';
  if (/^(send|send message|submit)$/i.test(clean)) return 'send';
  return null;
}

/**
 * Voice capture with dual layered strategy:
 * 1. MediaRecorder + server transcription (gpt-transcribe, primed with studio, trainer and
 *    equipment names) — the accurate path, used whenever OpenAI is connected
 * 2. Web Speech API as the fallback when server transcription is not connected
 * Supports direct voice commands ("approve ticket", "review draft", "start fresh")
 */
export function VoiceInput({
  onText,
  onVoiceUsed,
  onVoiceCommand,
  disabled = false,
}: {
  onText: (text: string) => void;
  onVoiceUsed?: () => void;
  onVoiceCommand?: (cmd: VoiceCommand) => void;
  disabled?: boolean;
}) {
  const { notify } = useApp();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  // Speech-recognition support can only be known in the browser; the server snapshot is
  // `false` so hydration always matches, and the real value is read on the client render.
  const supported = useSyncExternalStore(noopSubscribe, getVoiceSupportSnapshot, getVoiceSupportServerSnapshot);
  const recognizer = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  /** Set once the server says transcription is not connected, so later taps go straight to the browser. */
  const serverUnavailable = useRef(false);

  useEffect(() => {
    return () => {
      mounted.current = false;
      recognizer.current?.stop();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleRecognizedText(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    onVoiceUsed?.();

    // Check for voice command
    const cmd = parseVoiceCommand(trimmed);
    if (cmd && onVoiceCommand) {
      notify(`Voice command recognized: "${trimmed}"`);
      onVoiceCommand(cmd);
      return;
    }

    onText(trimmed);
  }

  async function recordAndTranscribe() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      notify('Voice input needs microphone access. You can still type your message.', 'error');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => window.MediaRecorder.isTypeSupported(t)) || '';
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = async () => {
        s.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        if (!chunks.length) {
          notify('No audio was captured. Try speaking closer to the mic.', 'error');
          return;
        }
        setProcessing(true);
        try {
          const file = new File([new Blob(chunks, { type: r.mimeType || 'audio/webm' })], 'voice.webm', {
            type: r.mimeType || 'audio/webm',
          });
          const form = new FormData();
          form.append('audio', file);
          const response = await fetch('/api/iris/transcribe', { method: 'POST', body: form });
          const data = await response.json();
          if (response.status === 503 && browserSpeech()) {
            serverUnavailable.current = true;
            notify('High-accuracy transcription is not connected — using browser dictation. Please repeat that.', 'error');
            startBrowserSpeech();
            return;
          }
          if (!response.ok) throw new Error(data.error || 'Transcription unavailable');
          if (!data.text?.trim()) throw new Error('Didn’t catch that — try speaking a little closer to the mic.');
          handleRecognizedText(data.text);
          notify('Voice captured — ready.');
        } catch (e) {
          notify((e as Error).message, 'error');
        } finally {
          setProcessing(false);
        }
      };
      r.start();
      setRecording(true);
      notify('Listening — describe the issue, then tap the mic to stop.');
      setTimeout(() => {
        if (r.state === 'recording') r.stop();
      }, 120000);
    } catch (e) {
      const name = (e as DOMException)?.name;
      notify(
        name === 'NotAllowedError'
          ? 'Microphone access was blocked. Please allow mic permission in your browser.'
          : 'Microphone access unavailable.',
        'error'
      );
    }
  }

  function browserSpeech() {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition;
  }

  function startBrowserSpeech() {
    const Speech = browserSpeech();
    if (!Speech) return;
    try {
      const r = new Speech();
      r.lang = 'en-IN';
      r.continuous = true;
      r.interimResults = false;
      r.onresult = (e) => {
        let text = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
        }
        if (text.trim()) handleRecognizedText(text);
      };
      r.onerror = (e) => {
        setRecording(false);
        notify(e.error === 'not-allowed' ? 'Microphone access was blocked. Please allow mic permission in your browser.' : 'Didn\u2019t catch that \u2014 try again, or type your message.', 'error');
      };
      r.onend = () => setRecording(false);
      recognizer.current = r;
      r.start();
      setRecording(true);
      notify('Listening — speak your issue or voice command ("approve ticket", "review draft", etc.). Tap mic to stop.');
    } catch {
      notify('Voice input is not available in this browser.', 'error');
    }
  }

  async function start() {
    if (recording) {
      recognizer.current?.stop();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      setRecording(false);
      return;
    }
    const canRecord = Boolean(navigator.mediaDevices && typeof window.MediaRecorder !== "undefined");
    if (canRecord && !serverUnavailable.current) {
      void recordAndTranscribe();
      return;
    }
    startBrowserSpeech();
  }

  return (
    <button
      type="button"
      disabled={disabled || processing || !supported}
      title={!supported ? 'Voice input is not available in this browser' : recording ? 'Stop listening' : 'Speak to Iris (Voice Command or Dictation)'}
      aria-label={recording ? 'Stop voice dictation' : 'Start voice dictation'}
      className={'icon-btn compose-action-btn' + (recording ? ' voice-recording' : '')}
      onClick={() => void start()}
    >
      {processing ? <Loader2 size={14} className="animate-spin" /> : recording ? <Square size={12} /> : <Mic size={14} />}
    </button>
  );
}

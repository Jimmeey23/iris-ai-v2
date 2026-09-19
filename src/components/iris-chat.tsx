"use client";
import Link from 'next/link';
import { useEffect, useState, useRef, useMemo } from 'react';
import {
  Sparkles,
  ArrowUp,
  Plus,
  FileCheck2,
  CheckCircle2,
  Send,
  ArrowUpRight,
  Loader2,
  PencilLine,
  LockKeyhole,
  Copy,
  Eraser,
  Download,
  Volume2,
  VolumeX,
  FileText,
  FileJson,
  FileType,
  Trash2,
  History,
  Image as ImageIcon,
  Clock,
  ExternalLink,
  Zap,
  Gift,
  MessageSquare,
  Radio,
} from 'lucide-react';
import { api, useApp, Modal, Field, Badge, Loading } from './ui';
import { MultiSelect } from './multi-select';
import { DraftDocument } from './ticket-composer';
import { TicketDialog } from './ticket-detail';
import { VoiceInput, parseVoiceCommand } from './voice-input';
import type { VoiceCommand } from './voice-input';
import { IrisContextBar } from './iris-context-bar';
import { FileUpload, AttachmentPreviewList } from './file-upload';
import type { UploadedFile } from './file-upload';
import { MomenceActionCenter } from './momence-action-center';
import type { IrisTurn, IrisMessage } from '@/lib/iris-contract';
import type { PickerOption } from '@/lib/ticket-contract';
import { display } from '@/lib/display';
import { STUDIOS } from '@/lib/constants';
import { toPlainText, toMarkdown, toJson, downloadText } from '@/lib/chat-export';
import { extractContext } from '@/lib/context-extractor';

interface HistorySessionItem {
  id: string;
  title: string;
  phase: string;
  createdAt: string;
  updatedAt: string;
  ticketId?: number;
  ticketNumber?: string;
  messageCount: number;
  lastMessage?: string;
  collected?: Record<string, unknown>;
}

/**
 * Sends a turn and reads the reply as it is written.
 *
 * Iris answers in two parts: the acknowledgement, which the model writes first and which is
 * streamed here character by character, and the turn itself — field, options, draft — which
 * arrives whole at the end because the UI renders state from it. If the browser or a proxy
 * cannot give us a readable stream, this falls back to waiting for the whole reply.
 */
export async function streamTurn(
  payload: Record<string, unknown>,
  onDelta: (chunk: string) => void
): Promise<IrisTurn> {
  const res = await fetch('/api/iris/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ ...payload, stream: true }),
  });

  // An error before the stream opens is still an ordinary JSON error response.
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error('The server returned an unexpected response. Please retry.');
    }
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed');
    return data as IrisTurn;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let turn: IrisTurn | undefined;
  let failure = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays in the buffer.
    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = frame.match(/^event: (.*)$/m)?.[1];
      const raw = frame.match(/^data: (.*)$/m)?.[1];
      if (event && raw) {
        try {
          const data = JSON.parse(raw);
          if (event === 'ack' && typeof data.text === 'string') onDelta(data.text);
          else if (event === 'turn') turn = data as IrisTurn;
          else if (event === 'error') failure = String(data.error || 'Request failed');
        } catch {
          // A frame we cannot parse is not worth killing the turn over.
        }
      }
      split = buffer.indexOf('\n\n');
    }
  }

  if (failure) throw new Error(failure);
  if (!turn) throw new Error('The reply ended before it was complete. Please retry.');
  return turn;
}

export function IrisChat({ presetCategory, presetSubcategory }: { presetCategory?: string; presetSubcategory?: string }) {
  const { notify, user, theme } = useApp();
  const [turn, setTurn] = useState<IrisTurn>();
  const [messages, setMessages] = useState<IrisMessage[]>([]);
  const [text, setText] = useState('');
  const [streamed, setStreamed] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>([]);
  const [pendingContext, setPendingContext] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [ticketId, setTicketId] = useState<number>();
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'builder' | 'action_center'>('builder');
  const scroller = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const turnRef = useRef<IrisTurn | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(new Date().toISOString());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageTimestamps = useRef(new WeakMap<IrisMessage, string>());

  useEffect(() => {
    const v = localStorage.getItem('iris-voice-replies');
    if (v) setVoiceMode(v === '1');
  }, []);

  // Auto-resize chat textarea: compact initially, expands only as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const targetHeight = text ? Math.min(Math.max(scrollHeight, 38), 160) : 38;
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [text]);

  // Real-time context heuristic extraction as user types or speaks
  const liveContext = useMemo(() => {
    if (!text.trim()) return {};
    return extractContext(text.trim());
  }, [text]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function apply(d: IrisTurn, replace = false) {
    turnRef.current = d;
    setTurn(d);
    if (d.sessionId) {
      localStorage.setItem('iris-conversation', d.sessionId);
    }
    if (d.history && d.history.length > 0) {
      setMessages(d.history);
    } else if (replace) {
      setMessages(d.message ? [{ role: 'assistant', content: d.message }] : []);
    } else if (d.message) {
      setMessages((m) => [...m, { role: 'assistant', content: d.message }]);
    }
  }

  async function start(fresh = false) {
    setBusy(true);
    setError('');
    try {
      const stored = !fresh && !presetCategory ? localStorage.getItem('iris-conversation') : null;
      if (stored) {
        try {
          const d = await api<IrisTurn>('/api/iris/chat?sessionId=' + encodeURIComponent(stored));
          if (d.sessionId) {
            apply(d, true);
            setBusy(false);
            return;
          }
        } catch {
          localStorage.removeItem('iris-conversation');
        }
      }
      const d = await api<IrisTurn>('/api/iris/chat', {
        method: 'POST',
        body: JSON.stringify({ preset: presetCategory ? { category: presetCategory, subcategory: presetSubcategory } : undefined }),
      });
      apply(d, true);
      setText('');
      startedAt.current = new Date().toISOString();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void start();
  }, [presetCategory, presetSubcategory]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, turn?.lookup]);

  /** Spoken reply: tries OpenAI TTS, with automatic seamless fallback to SpeechSynthesisUtterance */
  async function speak(sentence: string) {
    if (!voiceMode) return;
    const clean = sentence.replace(/[*_#`•]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    setSpeaking(true);
    try {
      const res = await fetch('/api/iris/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean.slice(0, 800) }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = audioRef.current || new Audio();
        audioRef.current = audio;
        audio.src = url;
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play().catch(() => setSpeaking(false));
        return;
      }
    } catch {
      // Server TTS failed or not configured, fallback to browser synthesis
    }

    // Native browser Web Speech Synthesis fallback
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'en-IN';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => /female|natural|samantha|zira|karen|veena/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
        return;
      } catch {
        setSpeaking(false);
      }
    }
    setSpeaking(false);
  }

  async function send(
    message?: string,
    label?: string,
    selection?: { module: 'members' | 'sessions'; id: string },
    patch?: Record<string, string>,
    fromVoice = false
  ) {
    const current = turnRef.current;
    if (!current || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');

    // Combine real-time detected context, manual context tab overrides, and explicit patches
    const mergedPatch = { ...liveContext, ...pendingContext, ...(patch || {}) };

    // Upload files if any are attached
    let uploadedIds: string[] = [];
    if (attachments.length > 0) {
      setUploadingFiles(true);
      try {
        const formData = new FormData();
        formData.append('sessionId', current.sessionId);
        attachments.forEach((f) => {
          if (f.file) {
            formData.append('file', f.file);
          } else {
            formData.append('file', new Blob([f.preview || ''], { type: f.fileType }), f.fileName);
          }
        });
        const uploadRes = await api<{ attachments: Array<{ id: string; fileName: string }> }>('/api/iris/upload', {
          method: 'POST',
          body: formData,
        });
        uploadedIds = uploadRes.attachments.map((a) => a.id);
      } catch (err) {
        // Surface it: silently dropping the files left the user believing they had sent them.
        setBusy(false);
        lock.current = false;
        setUploadingFiles(false);
        notify(`Attachment upload failed — ${(err as Error).message}`, 'error');
        return;
      } finally {
        setUploadingFiles(false);
      }
    }

    const attachmentNote = attachments.length > 0 ? ` [Attached: ${attachments.map((a) => a.fileName).join(', ')}]` : '';
    const shown = (label || message || (attachments.length ? `Sent ${attachments.length} attachment(s)` : undefined)) + (message ? attachmentNote : '');
    if (shown) setMessages((m) => [...m, { role: 'user', content: shown }]);
    // Clear the composer the moment the message joins the transcript. Clearing only after
    // the reply came back left the text sitting in the box for the whole round-trip —
    // long enough to look like the send had failed, and to invite a double send.
    const sentText = text;
    setText('');

    // The acknowledgement arrives as one validated piece and the question arrives live, so
    // both are fed through a typewriter: the reporter sees a sentence being typed at a pace
    // that does not jump when a burst lands.
    let buffered = '';
    let revealed = '';
    const typer = setInterval(() => {
      if (revealed.length >= buffered.length) return;
      revealed = buffered.slice(0, revealed.length + Math.max(1, Math.ceil((buffered.length - revealed.length) / 12)));
      setStreamed(revealed);
    }, 28);

    try {
      const d = await streamTurn(
        {
          sessionId: current.sessionId,
          message,
          selection,
          patch: Object.keys(mergedPatch).length ? mergedPatch : undefined,
          attachmentIds: uploadedIds,
        },
        (chunk) => {
          buffered += chunk;
        }
      );
      apply(d);
      setAttachments([]);
      setPendingContext({});
      if (fromVoice || voiceMode) void speak(d.message);
    } catch (e) {
      setError((e as Error).message);
      if (shown) setMessages((m) => m.slice(0, -1));
      // The send failed, so give them their words back rather than making them retype.
      if (sentText) setText((t) => t || sentText);
    } finally {
      clearInterval(typer);
      setStreamed('');
      setBusy(false);
      lock.current = false;
    }
  }

  function handleVoiceCommand(cmd: VoiceCommand) {
    if (cmd === 'approve') {
      if (turn?.draft) {
        void approve();
      } else {
        notify('Draft is not ready yet. Please provide the incident details first.');
      }
    } else if (cmd === 'review') {
      if (turn?.draft) {
        setDraftOpen(true);
      } else {
        notify('No active draft to review yet.');
      }
    } else if (cmd === 'discard') {
      if (turn?.draft) {
        setDiscardOpen(true);
      } else {
        notify('No active draft to discard.');
      }
    } else if (cmd === 'reset') {
      setResetOpen(true);
    } else if (cmd === 'send') {
      if (text.trim()) void send(text.trim(), undefined, undefined, undefined, true);
    }
  }

  async function approve() {
    if (!turn || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const d = await api<{ ticket: { id: number; ticketNumber: string } }>('/api/iris/approve', {
        method: 'POST',
        body: JSON.stringify({ sessionId: turn.sessionId }),
      });
      const done = {
        ...turn,
        phase: 'complete' as const,
        message: `${d.ticket.ticketNumber} is logged and assigned to ${turn.draft?.assignedStaffName}. You can track it from Command.`,
        ticket: d.ticket,
        options: [],
      };
      apply(done);
      setDraftOpen(false);
      notify(`${d.ticket.ticketNumber} created successfully.`);
      if (voiceMode) void speak(`Ticket ${d.ticket.ticketNumber} has been logged and assigned successfully.`);
      window.dispatchEvent(new Event('iris:tickets-updated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  function edit() {
    const d = turn?.draft;
    if (!d) return;
    const r = d as unknown as Record<string, unknown>;
    const pick = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
    setEdits({
      title: d.title,
      description: d.description,
      kind: d.kind,
      category: pick('category'),
      subcategory: pick('subcategory'),
      studio: d.studio,
      memberName: d.memberName,
      memberEmail: pick('memberEmail'),
      memberPhone: pick('memberPhone'),
      classFormat: pick('classFormat'),
      trainer: pick('trainer'),
      membership: pick('membership'),
      incidentAt: d.incidentAt,
      impact: pick('impact'),
      preferredContact: pick('preferredContact'),
      requestedResolution: d.requestedResolution || '',
    });
    setEditOpen(true);
  }

  /** Throws away the server-side conversation and starts a clean one. */
  async function discard(message: string) {
    const current = turnRef.current;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (current && current.phase !== 'complete') {
        await api('/api/iris/discard', { method: 'POST', body: JSON.stringify({ sessionId: current.sessionId }) });
      }
      localStorage.removeItem('iris-conversation');
      turnRef.current = undefined;
      setTurn(undefined);
      setMessages([]);
      setEdits({});
      setPendingContext({});
      setTicketId(undefined);
      setDraftOpen(false);
      setEditOpen(false);
      notify(message);
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
      lock.current = false;
    }
    await start(true);
  }

  function toggleVoiceMode() {
    const next = !voiceMode;
    setVoiceMode(next);
    localStorage.setItem('iris-voice-replies', next ? '1' : '0');
    notify(next ? 'Iris voice replies turned ON.' : 'Voice replies turned OFF.');
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await api<{ sessions: HistorySessionItem[] }>('/api/iris/history');
      setHistorySessions(data.sessions || []);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function resumeSession(id: string) {
    setBusy(true);
    setError('');
    try {
      const d = await api<IrisTurn>('/api/iris/chat?sessionId=' + encodeURIComponent(id));
      const targetSession = { ...d, sessionId: d.sessionId || id };
      apply(targetSession, true);
      setHistoryOpen(false);
      notify('Resumed past intake session.');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function exportMeta() {
    return { staffName: user?.name || 'Studio staff', startedAt: startedAt.current, ticketNumber: turn?.ticket?.ticketNumber };
  }
  async function copyChat() {
    await navigator.clipboard
      .writeText(toPlainText(messages, exportMeta()))
      .then(() => notify('Transcript copied to clipboard.'))
      .catch(() => notify('Clipboard access was blocked.', 'error'));
    setExportOpen(false);
  }
  function clearChat() {
    void discard('Chat and draft cleared.');
  }
  async function exportAs(kind: 'txt' | 'md' | 'json' | 'png' | 'pdf' | 'docx') {
    setExportOpen(false);
    const meta = exportMeta();
    try {
      if (kind === 'txt') downloadText('iris-chat.txt', toPlainText(messages, meta));
      else if (kind === 'md') downloadText('iris-chat.md', toMarkdown(messages, meta), 'text/markdown');
      else if (kind === 'json') downloadText('iris-chat.json', toJson(messages, meta), 'application/json');
      else if (kind === 'png') {
        const { toPng } = await import('html-to-image');
        if (!scroller.current) return;
        const dataUrl = await toPng(scroller.current, {
          backgroundColor: getComputedStyle(document.body).getPropertyValue('--surface') || '#131318',
          pixelRatio: 2,
        });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'iris-chat.png';
        a.click();
      } else if (kind === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt' });
        const width = doc.internal.pageSize.getWidth() - 72;
        let y = 54;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('IRIS — Internal Ticket Log', 36, y);
        y += 22;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Logged by ${meta.staffName} · ${new Date(meta.startedAt).toLocaleString('en-IN')}`, 36, y);
        y += 24;
        for (const m of messages) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          const who = m.role === 'assistant' ? 'IRIS' : meta.staffName.toUpperCase();
          if (y > 760) {
            doc.addPage();
            y = 54;
          }
          doc.text(who, 36, y);
          y += 14;
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(m.content, width);
          for (const line of lines) {
            if (y > 770) {
              doc.addPage();
              y = 54;
            }
            doc.text(line, 36, y);
            y += 14;
          }
          y += 10;
        }
        doc.save('iris-chat.pdf');
      } else if (kind === 'docx') {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
        const doc = new Document({
          sections: [
            {
              children: [
                new Paragraph({ text: 'IRIS — Internal Ticket Log', heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ text: `Logged by ${meta.staffName} · ${new Date(meta.startedAt).toLocaleString('en-IN')}` }),
                new Paragraph({ text: '' }),
                ...messages.flatMap((m) => [
                  new Paragraph({ children: [new TextRun({ text: m.role === 'assistant' ? 'IRIS' : meta.staffName.toUpperCase(), bold: true })] }),
                  new Paragraph({ text: m.content }),
                  new Paragraph({ text: '' }),
                ]),
              ],
            },
          ],
        });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'iris-chat.docx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify('Export ready.');
    } catch {
      notify('Export failed — please try again.', 'error');
    }
  }

  function getMessageTime(m: IrisMessage) {
    let t = messageTimestamps.current.get(m);
    if (!t) {
      t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      messageTimestamps.current.set(m, t);
    }
    return t;
  }

  const collected = turn?.collected || {};
  const fieldOrder: [string, string][] = [
    ['reportedBy', 'reported_by'],
    ['kind', 'entry_type'],
    ['category', 'category'],
    ['subcategory', 'subcategory'],
    ['memberName', 'logged_for'],
    ['studio', 'studio'],
    ['area', 'area'],
    ['classFormat', 'class'],
    ['trainer', 'trainer'],
    ['incidentAt', 'when'],
    ['impact', 'impact'],
    ['requestedResolution', 'next_step'],
  ];

  return (
    <>
      <div className="chat-layout">
        <section className="card chat-panel">
          <div className="chat-ambient-glow" aria-hidden="true" />
          <div className="chat-head">
            <div className="chat-identity">
              <div className={'avatar-ring' + (speaking ? ' speaking' : '')}>
                <img src={theme === 'dark' ? '/images/iris-avatar-dark.webp' : '/images/iris-avatar-light.webp'} alt="Iris" />
                <span className="live-avatar-pulse" />
              </div>
              <div className="chat-identity-meta">
                <div className="chat-identity-title">
                  <strong>Iris</strong>
                  <span className="chat-agent-pill">Ops Assistant</span>
                </div>
                <div className="chat-identity-sub">
                  <span className="live-dot-glow" />
                  <span className="sub-text">
                    {busy
                      ? 'Analyzing studio context & logs…'
                      : speaking
                      ? 'Speaking voice response…'
                      : 'Physique 57 Ops Intelligence · Real-time Assistant'}
                  </span>
                </div>
              </div>
            </div>
            <div className="chat-toolbar">
              <button
                className={'toolbar-pill-btn' + (voiceMode ? ' active' : '')}
                title={voiceMode ? 'Voice replies ON (Tap to mute)' : 'Voice replies OFF (Tap to enable voice answers)'}
                aria-label="Toggle spoken replies"
                onClick={toggleVoiceMode}
              >
                {voiceMode ? <Volume2 size={13} className="voice-icon-pulse" /> : <VolumeX size={13} />}
                <span className="btn-txt">{voiceMode ? 'Voice ON' : 'Voice'}</span>
              </button>
              <Link
                href="/radar"
                className="toolbar-pill-btn radar-pill-btn"
                title="Live Studio Floor Operations Radar & SLA Countdown Heatmap"
              >
                <Radio size={12.5} className="radar-icon-pulse" />
                <span className="btn-txt">Ops Radar</span>
                <span className="tab-live-badge">
                  <span className="badge-pulse-dot" />
                  LIVE
                </span>
              </Link>
              <button
                className="toolbar-pill-btn"
                title="7-Day Chat History"
                aria-label="View 7-day chat history"
                onClick={() => {
                  setHistoryOpen(true);
                  void loadHistory();
                }}
              >
                <History size={13} />
                <span className="btn-txt">History</span>
                <span className="history-pill">7d</span>
              </button>
              <button className="icon-btn toolbar-icon" title="Copy transcript" aria-label="Copy transcript to clipboard" onClick={() => void copyChat()}>
                <Copy size={13} />
              </button>
              <button className="icon-btn toolbar-icon" title="Clear chat and draft" aria-label="Clear chat and draft" onClick={() => setClearOpen(true)}>
                <Eraser size={13} />
              </button>
              <div style={{ position: 'relative' }} ref={exportRef}>
                <button className="icon-btn toolbar-icon" title="Export chat" aria-label="Export chat" onClick={() => setExportOpen((v) => !v)}>
                  <Download size={13} />
                </button>
                {exportOpen && (
                  <div className="card export-popover">
                    <div className="export-popover-title">Export transcript</div>
                    {[
                      ['txt', 'Plain text', FileText],
                      ['md', 'Markdown', FileText],
                      ['json', 'JSON', FileJson],
                      ['png', 'Image (PNG)', ImageIcon],
                      ['pdf', 'PDF document', FileType],
                      ['docx', 'Word (.docx)', FileType],
                    ].map(([k, label, Icon]) => {
                      const I = Icon as typeof FileText;
                      return (
                        <button key={k as string} className="export-popover-item" onClick={() => void exportAs(k as 'txt')}>
                          <span className="export-popover-icon"><I size={14} /></span>
                          <span className="export-popover-label">{label as string}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="icon-btn" title="Start fresh conversation" aria-label="Start a new conversation" onClick={() => setResetOpen(true)}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="chat-scroll" ref={scroller}>
            <div className="chat-scroll-vignette" aria-hidden="true" />
            <div className="chat-day"><span>Internal ticket logging · Physique 57 India</span></div>
            {!turn && busy ? (
              <Loading />
            ) : (
              messages.map((m, i) => (
                <div className={'chat-message ' + (m.role === 'user' ? 'user' : '')} key={i}>
                  {m.role === 'assistant' && (
                    <span className="msg-avatar">
                      <img src={theme === 'dark' ? '/images/iris-avatar-dark.webp' : '/images/iris-avatar-light.webp'} alt="" />
                    </span>
                  )}
                  <div className="bubble-wrap">
                    <div className="bubble">
                      {m.content.startsWith('__') ? 'Selection made from Momence' : m.content}
                    </div>
                    <div className="chat-message-meta">
                      <span>{getMessageTime(m)}</span>
                      {m.role === 'user' && (
                        <span className="chat-message-status">
                          <CheckCircle2 size={9} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {busy && turn && (
              <div className="chat-message">
                <span className="msg-avatar">
                  <img src={theme === 'dark' ? '/images/iris-avatar-dark.webp' : '/images/iris-avatar-light.webp'} alt="" />
                </span>
                <div className="bubble-wrap">
                  <div className="bubble">
                    {streamed ? (
                      <span className="streaming-text">
                        {streamed}
                        <i className="stream-caret" aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="chat-status">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!busy && turn?.lookup && turn.phase !== 'complete' && (
              <div style={{ margin: '0 0 24px 36px' }}>
                <MultiSelect
                  module={turn.lookup}
                  value={[]}
                  studio={turn.lookupFilters?.studio}
                  sessionTypes={turn.lookupFilters?.sessionTypes}
                  onChange={(opts: PickerOption[]) => {
                    const o = opts[0];
                    if (o) void send(undefined, o.label, { module: turn.lookup!, id: String(o.id) });
                  }}
                  placeholder={turn.lookup === 'members' ? 'Search members by name, email or phone…' : 'Search classes by name, trainer or studio…'}
                />
              </div>
            )}
            {!busy && turn?.options?.length && turn.phase !== 'complete' ? (
              <div className="chat-options">
                {turn.options.map((o) => (
                  <button className="btn" key={o.value} onClick={() => void send(o.value, o.label)}>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
            {turn?.phase === 'draft' && (
              <div className="info-box" style={{ margin: '0 0 20px 36px', alignItems: 'center' }}>
                <FileCheck2 size={21} />
                <div className="grow">
                  <strong style={{ fontSize: 12 }}>Ticket draft ready to review</strong>
                  <p style={{ fontSize: 11 }}>Say "approve ticket" or click review to verify the assignment and resolution plan.</p>
                </div>
                <button className="btn" onClick={() => setDiscardOpen(true)}>
                  <Trash2 size={12} />
                  Discard
                </button>
                <button className="btn btn-primary" onClick={() => setDraftOpen(true)}>
                  Review draft <ArrowUpRight size={12} />
                </button>
              </div>
            )}
            {(turn?.phase === 'draft' || turn?.phase === 'complete') && (
              <div className="chat-action-callout" style={{ margin: '0 0 16px 36px' }}>
                <div className="action-callout-text">
                  <Zap size={13} className="accent" />
                  <span>
                    <strong>1-Click Momence Resolution Available:</strong> Grant class credit or draft WhatsApp care message.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary action-callout-btn"
                  onClick={() => setRightPanelTab('action_center')}
                >
                  <Gift size={12} />
                  Open Action Center
                </button>
              </div>
            )}
            {turn?.phase === 'complete' && turn.ticket && (
              <div className="card card-pad" style={{ marginLeft: 36, background: 'var(--green-bg)' }}>
                <CheckCircle2 size={25} style={{ color: 'var(--green)', marginBottom: 12 }} />
                <h3>{turn.ticket.ticketNumber} · logged</h3>
                <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                  Saved to Command with routing and a follow-up target already set.
                </p>
                <button className="btn" style={{ marginTop: 16 }} onClick={() => setTicketId(turn.ticket!.id)}>
                  Open ticket <ArrowUpRight size={12} />
                </button>
              </div>
            )}
            {turn?.notice && <div className="info-box warning" style={{ marginTop: 15 }}>{turn.notice}</div>}
            {error && (
              <div className="error-box" style={{ marginTop: 15 }}>
                {error}
                {!turn && (
                  <button className="text-btn" onClick={() => void start()}>
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          {turn?.phase !== 'complete' && (
            <form
              className="chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim() || attachments.length > 0) void send(text.trim());
              }}
            >
              {/* Context Bar positioned DIRECTLY ABOVE the chat input box */}
              <IrisContextBar
                turn={turn}
                pendingContext={pendingContext}
                liveContext={liveContext}
                onContextChange={(updates) =>
                  setPendingContext((prev) => {
                    const next = { ...prev };
                    for (const [k, v] of Object.entries(updates)) {
                      if (v === undefined) delete next[k];
                      else next[k] = v;
                    }
                    return next;
                  })
                }
                onResetContext={() => setPendingContext({})}
              />

              <div className="compose-box">
                {attachments.length > 0 && (
                  <AttachmentPreviewList
                    files={attachments}
                    onRemove={(id) => setAttachments((prev) => prev.filter((f) => f.id !== id))}
                  />
                )}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  aria-label="Message Iris"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if ((text.trim() || attachments.length > 0) && !busy) void send(text.trim());
                    }
                  }}
                  placeholder={
                    turn?.lookup
                      ? 'Search above, or add more detail…'
                      : turn?.phase === 'draft'
                      ? 'Say "approve ticket" or tell Iris what to adjust…'
                      : 'Speak or type what you noticed (e.g. "Water leak in locker room at kemps during Rohan\'s class")…'
                  }
                />
                <div className="compose-actions-bar">
                  <div className="compose-actions-left">
                    <FileUpload onFilesSelected={(files) => setAttachments(files)} files={attachments} />
                  </div>
                  <div className="compose-actions-right">
                    <VoiceInput
                      disabled={busy}
                      onVoiceCommand={handleVoiceCommand}
                      onVoiceUsed={() => {
                        if (!voiceMode) {
                          setVoiceMode(true);
                          localStorage.setItem('iris-voice-replies', '1');
                        }
                      }}
                      onText={(v) => {
                        const clean = v.trim();
                        const cmd = parseVoiceCommand(clean);
                        if (cmd) {
                          handleVoiceCommand(cmd);
                        } else {
                          setText((t) => (t ? t + ' ' + clean : clean));
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className={`icon-btn compose-action-btn send-btn ${text.trim() || attachments.length > 0 ? 'active' : ''}`}
                      disabled={busy || (!text.trim() && attachments.length === 0)}
                      aria-label="Send message"
                      title="Send message (Enter)"
                    >
                      <ArrowUp size={15} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="compose-hint">
                <span>ENTER TO SEND · VOICE COMMANDS SUPPORTED</span>
                <span>
                  <LockKeyhole size={9} style={{ display: 'inline', marginRight: 4 }} />
                  NOTHING FILED WITHOUT APPROVAL
                </span>
              </div>
            </form>
          )}
        </section>

        <aside className="card builder-panel">
          {/* Top Segmented Controller */}
          <div className="panel-tab-header">
            <button
              type="button"
              className={`panel-tab-btn ${rightPanelTab === 'builder' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('builder')}
            >
              <FileCheck2 size={12.5} />
              <span>Ticket Spec</span>
              <span className="tab-count-pill">
                {Object.keys(collected).filter((k) => fieldOrder.some(([f]) => f === k && collected[k])).length}/8
              </span>
            </button>
            <button
              type="button"
              className={`panel-tab-btn action-tab ${rightPanelTab === 'action_center' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('action_center')}
            >
              <Zap size={12.5} className="action-zap" />
              <span>Momence Actions</span>
              <span className="tab-live-badge">
                <span className="badge-pulse-dot" />
                LIVE
              </span>
            </button>
          </div>

          {rightPanelTab === 'builder' ? (
            <>
              <div className="builder-head">
                <div className="between">
                  <h3>Live ticket builder</h3>
                  <Badge tone="purple">SCHEMA</Badge>
                </div>
                <p className="muted" style={{ fontSize: 10, marginTop: 6 }}>
                  Fields populate as the conversation continues.
                </p>
                <div className="builder-progress">
                  {Array.from({ length: turn?.progress.total || 8 }).map((_, i) => (
                    <span key={i} className={i < (turn?.progress.done || 0) ? 'done' : ''} />
                  ))}
                </div>
              </div>
              <div className="builder-body">
                {!Object.keys(collected).some((k) => fieldOrder.some(([key]) => key === k)) ? (
                  <div className="builder-empty">
                    Waiting for the first details…
                    <br />
                    Mention studio, issue, trainer, or area.
                  </div>
                ) : (
                  fieldOrder
                    .filter(([key]) => collected[key] !== undefined && collected[key] !== '')
                    .map(([key, label]) => (
                      <div className="builder-line" key={key}>
                        <span className="k">{label}:</span>
                        <span className="v">{display(collected[key])}</span>
                      </div>
                    ))
                )}
                {collected.category === 'Safety and Security' && (
                  <div style={{ marginTop: 16 }}>
                    <span className="k mono" style={{ fontSize: 10 }}>
                      severity_signal
                    </span>
                    <div className="severity-meter">
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ background: 'var(--red)' }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {turn?.draft && (
                <div className="builder-footer">
                  <button className="btn btn-primary" onClick={() => setDraftOpen(true)}>
                    <FileCheck2 size={13} />
                    Review complete ticket
                  </button>
                  {turn?.phase !== 'complete' && (
                    <button className="btn" style={{ marginTop: 8 }} onClick={() => setDiscardOpen(true)}>
                      <Trash2 size={13} />
                      Discard draft
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="builder-head action-hub-head">
                <div className="between">
                  <div>
                    <h3>Momence Operations Hub</h3>
                    <p className="muted" style={{ fontSize: 10, marginTop: 3 }}>
                      Live member compensation &amp; roster controls
                    </p>
                  </div>
                  <Badge tone="green">SYNC ACTIVE</Badge>
                </div>
              </div>
              <div className="builder-body-action-center">
                <MomenceActionCenter
                  memberId={String(collected.momenceMemberId || pendingContext.momenceMemberId || '')}
                  memberName={String(collected.memberName || pendingContext.memberName || '')}
                  memberEmail={String(collected.memberEmail || '')}
                  memberPhone={String(collected.memberPhone || '')}
                  studio={String(collected.studio || pendingContext.studio || '')}
                  category={String(collected.category || pendingContext.category || '')}
                  subcategory={String(collected.subcategory || pendingContext.subcategory || '')}
                  sessionId={String(collected.momenceSessionId || pendingContext.momenceSessionId || '')}
                  classFormat={String(collected.classFormat || pendingContext.classFormat || '')}
                  trainer={String(collected.trainer || pendingContext.trainer || '')}
                  issueSummary={String(collected.title || collected.description || '')}
                />
              </div>
            </>
          )}
        </aside>
      </div>

      {/* 7-DAY CHAT HISTORY MODAL */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Recent Chat History"
        description="Your individual conversations from the past 7 days."
        size="wide"
        footer={
          <>
            <button className="btn" onClick={() => setHistoryOpen(false)}>
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setHistoryOpen(false);
                void discard('Started fresh conversation.');
              }}
            >
              <Plus size={13} />
              Start New Ticket
            </button>
          </>
        }
      >
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-stone-500">
              <Loader2 size={20} className="animate-spin inline mr-2" />
              Loading history…
            </div>
          ) : historySessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-stone-500">
              No conversations in the last 7 days. Start logging an issue to begin.
            </div>
          ) : (
            historySessions.map((s) => (
              <div
                key={s.id}
                onClick={() => void resumeSession(s.id)}
                className="group flex items-start justify-between p-3 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 bg-white dark:bg-stone-900/50 cursor-pointer transition-all"
              >
                <div className="grow min-w-0 pr-3">
                  <div className="flex items-center gap-2 mb-1">
                    <strong className="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">
                      {s.title}
                    </strong>
                    {s.ticketNumber ? (
                      <Badge tone="green">{s.ticketNumber}</Badge>
                    ) : s.phase === 'draft' ? (
                      <Badge tone="purple">Draft Ready</Badge>
                    ) : (
                      <Badge tone="blue">In Progress</Badge>
                    )}
                  </div>
                  {s.lastMessage && (
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate max-w-[500px]">
                      {s.lastMessage}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-400">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(s.createdAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{s.messageCount} messages</span>
                    {s.collected?.studio ? <span>· {String(s.collected.studio)}</span> : null}
                  </div>
                </div>
                <button className="text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 p-1">
                  <ExternalLink size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title="A clean, structured ticket"
        description="Review every detail before approving it."
        size="wide"
        footer={
          <>
            <button className="btn" disabled={busy || turn?.phase === 'complete'} onClick={() => setDiscardOpen(true)}>
              <Trash2 size={13} />
              Discard draft
            </button>
            <button className="btn" disabled={turn?.phase === 'complete'} onClick={edit}>
              <PencilLine size={13} />
              Edit details
            </button>
            <button className="btn btn-primary" disabled={busy || turn?.phase === 'complete'} onClick={() => void approve()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}{' '}
              {turn?.phase === 'complete' ? 'Already logged' : 'Approve & log ticket'}
            </button>
          </>
        }
      >
        {turn?.draft && <DraftDocument draft={turn.draft} onEdit={edit} />}
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Fine-tune the details"
        description="Edits rebuild the draft and rerun routing."
        footer={
          <>
            <button className="btn" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                const patch = Object.fromEntries(Object.entries(edits).filter(([, v]) => v.trim() !== ''));
                void send(undefined, 'Updated the draft details.', undefined, patch).then(() => setEditOpen(false));
              }}
            >
              Update draft
            </button>
          </>
        }
      >
        <div className="form-grid">
          {Object.entries(edits).map(([k, v]) => (
            <Field key={k} label={k.replace(/([A-Z])/g, ' $1')} wide={k === 'description' || k === 'requestedResolution'}>
              {k === 'studio' ? (
                <select value={v} onChange={(e) => setEdits((s) => ({ ...s, [k]: e.target.value }))}>
                  {STUDIOS.map((s) => (
                    <option key={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : k === 'kind' ? (
                <select value={v} onChange={(e) => setEdits((s) => ({ ...s, [k]: e.target.value }))}>
                  {['issue', 'request', 'compliment', 'feedback'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              ) : k === 'description' || k === 'requestedResolution' ? (
                <textarea value={v} onChange={(e) => setEdits((s) => ({ ...s, [k]: e.target.value }))} />
              ) : (
                <input value={v} onChange={(e) => setEdits((s) => ({ ...s, [k]: e.target.value }))} />
              )}
            </Field>
          ))}
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Start a fresh conversation?"
        description="This clears the current chat and any unapproved draft."
        size="narrow"
        footer={
          <>
            <button className="btn" onClick={() => setResetOpen(false)}>
              Keep chatting
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setResetOpen(false);
                void discard('Started a fresh conversation. The old draft was discarded.');
              }}
            >
              Start fresh
            </button>
          </>
        }
      >
        <p className="secondary">
          Any ticket you’ve already approved won’t change. The unapproved draft is deleted and Iris starts from a clean slate.
        </p>
      </Modal>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear this chat?"
        description="The transcript and the unapproved draft are both deleted."
        size="narrow"
        footer={
          <>
            <button className="btn" onClick={() => setClearOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setClearOpen(false);
                clearChat();
              }}
            >
              <Eraser size={13} />
              Clear chat and draft
            </button>
          </>
        }
      >
        <p className="secondary">
          Export the transcript first if you need a copy. Tickets already logged are not affected.
        </p>
      </Modal>

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this draft?"
        description="Nothing is filed and the draft is deleted."
        size="narrow"
        footer={
          <>
            <button className="btn" onClick={() => setDiscardOpen(false)}>
              Keep draft
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setDiscardOpen(false);
                void discard('Draft discarded. Iris is ready for a new ticket.');
              }}
            >
              <Trash2 size={13} />
              Discard draft
            </button>
          </>
        }
      >
        <p className="secondary">
          If you only need a few corrections, close this and use <strong>Edit details</strong> instead — that keeps everything Iris already captured.
        </p>
      </Modal>

      {ticketId && <TicketDialog open id={ticketId} onClose={() => setTicketId(undefined)} />}
    </>
  );
}

"use client";
import {
  downloadText,
  toJson,
  toMarkdown,
  toPlainText,
} from "@/lib/chat-export";
import { extractContext } from "@/lib/context-extractor";
import type { IrisMessage, IrisTurn } from "@/lib/iris-contract";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UploadedFile } from "./file-upload";
import { IrisChatView } from "./iris-chat-view";
import { streamTurn } from "./iris-stream";
import { api, useApp } from "./ui";
import type { VoiceCommand } from "./voice-input";

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

export { streamTurn } from "./iris-stream";
export function useIrisChatController({
  presetCategory,
  presetSubcategory,
}: {
  presetCategory?: string;
  presetSubcategory?: string;
}) {
  const { notify, user, theme } = useApp();
  const [turn, setTurn] = useState<IrisTurn>();
  const [messages, setMessages] = useState<IrisMessage[]>([]);
  const [text, setText] = useState("");
  const [streamed, setStreamed] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>(
    [],
  );
  const [pendingContext, setPendingContext] = useState<Record<string, string>>(
    {},
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [ticketId, setTicketId] = useState<number>();
  const [voiceMode, setVoiceMode] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("iris-voice-replies") === "1",
  );
  const [speaking, setSpeaking] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<
    "builder" | "action_center"
  >("builder");
  const scroller = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const turnRef = useRef<IrisTurn | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(new Date().toISOString());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageTimestamps = useRef(new WeakMap<IrisMessage, string>());

  // Auto-resize chat textarea: compact initially, expands only as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const targetHeight = text
        ? Math.min(Math.max(scrollHeight, 38), 160)
        : 38;
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
      if (exportRef.current && !exportRef.current.contains(e.target as Node))
        setExportOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function apply(d: IrisTurn, replace = false) {
    turnRef.current = d;
    setTurn(d);
    if (d.sessionId) {
      localStorage.setItem("iris-conversation", d.sessionId);
    }
    if (d.history && d.history.length > 0) {
      setMessages(d.history);
    } else if (replace) {
      setMessages(d.message ? [{ role: "assistant", content: d.message }] : []);
    } else if (d.message) {
      setMessages((m) => [...m, { role: "assistant", content: d.message }]);
    }
  }

  async function start(fresh = false) {
    setBusy(true);
    setError("");
    try {
      const stored =
        !fresh && !presetCategory
          ? localStorage.getItem("iris-conversation")
          : null;
      if (stored) {
        try {
          const d = await api<IrisTurn>(
            "/api/iris/chat?sessionId=" + encodeURIComponent(stored),
          );
          if (d.sessionId) {
            apply(d, true);
            setBusy(false);
            return;
          }
        } catch {
          localStorage.removeItem("iris-conversation");
        }
      }
      const d = await api<IrisTurn>("/api/iris/chat", {
        method: "POST",
        body: JSON.stringify({
          preset: presetCategory
            ? { category: presetCategory, subcategory: presetSubcategory }
            : undefined,
        }),
      });
      apply(d, true);
      setText("");
      startedAt.current = new Date().toISOString();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Deferred to a microtask so the fetch-and-setState in `start` does not run synchronously
    // during the effect's commit phase (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void start();
    });
    // `start` closes over state that changes every render; only the preset actually
    // identifies when this should re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCategory, presetSubcategory]);

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, turn?.lookup]);

  /** Spoken reply: tries OpenAI TTS, with automatic seamless fallback to SpeechSynthesisUtterance */
  async function speak(sentence: string) {
    if (!voiceMode) return;
    const clean = sentence
      .replace(/[*_#`•]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;

    setSpeaking(true);
    try {
      const res = await fetch("/api/iris/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = "en-IN";
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) =>
            /female|natural|samantha|zira|karen|veena/i.test(v.name),
          ) || voices.find((v) => v.lang.startsWith("en"));
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
    selection?: { module: "members" | "sessions"; id: string },
    patch?: Record<string, string>,
    fromVoice = false,
  ) {
    const current = turnRef.current;
    if (!current || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");

    // Combine real-time detected context, manual context tab overrides, and explicit patches
    const mergedPatch = { ...liveContext, ...pendingContext, ...(patch || {}) };

    // Upload files if any are attached
    let uploadedIds: string[] = [];
    if (attachments.length > 0) {
      setUploadingFiles(true);
      try {
        const formData = new FormData();
        formData.append("sessionId", current.sessionId);
        attachments.forEach((f) => {
          if (f.file) {
            formData.append("file", f.file);
          } else {
            formData.append(
              "file",
              new Blob([f.preview || ""], { type: f.fileType }),
              f.fileName,
            );
          }
        });
        const uploadRes = await api<{
          attachments: Array<{ id: string; fileName: string }>;
        }>("/api/iris/upload", {
          method: "POST",
          body: formData,
        });
        uploadedIds = uploadRes.attachments.map((a) => a.id);
      } catch (err) {
        // Surface it: silently dropping the files left the user believing they had sent them.
        setBusy(false);
        lock.current = false;
        setUploadingFiles(false);
        notify(`Attachment upload failed — ${(err as Error).message}`, "error");
        return;
      } finally {
        setUploadingFiles(false);
      }
    }

    const attachmentNote =
      attachments.length > 0
        ? ` [Attached: ${attachments.map((a) => a.fileName).join(", ")}]`
        : "";
    const shown =
      (label ||
        message ||
        (attachments.length
          ? `Sent ${attachments.length} attachment(s)`
          : undefined)) + (message ? attachmentNote : "");
    if (shown) setMessages((m) => [...m, { role: "user", content: shown }]);
    // Clear the composer the moment the message joins the transcript. Clearing only after
    // the reply came back left the text sitting in the box for the whole round-trip —
    // long enough to look like the send had failed, and to invite a double send.
    const sentText = text;
    setText("");

    // The acknowledgement arrives as one validated piece and the question arrives live, so
    // both are fed through a typewriter: the reporter sees a sentence being typed at a pace
    // that does not jump when a burst lands.
    let buffered = "";
    let revealed = "";
    const typer = setInterval(() => {
      if (revealed.length >= buffered.length) return;
      revealed = buffered.slice(
        0,
        revealed.length +
          Math.max(1, Math.ceil((buffered.length - revealed.length) / 12)),
      );
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
        },
      );
      apply(d);
      setAttachments([]);
      setPendingContext({});
      if (fromVoice || voiceMode) void speak(d.message);
      // "Yes, that's the same one" — append this report to the ticket already open rather
      // than filing a second ticket about the same fault.
      if (d.linkedTicket) await linkToExisting();
    } catch (e) {
      setError((e as Error).message);
      if (shown) setMessages((m) => m.slice(0, -1));
      // The send failed, so give them their words back rather than making them retype.
      if (sentText) setText((t) => t || sentText);
    } finally {
      clearInterval(typer);
      setStreamed("");
      setBusy(false);
      lock.current = false;
    }
  }

  function handleVoiceCommand(cmd: VoiceCommand) {
    if (cmd === "approve") {
      if (turn?.draft) {
        void approve();
      } else {
        notify(
          "Draft is not ready yet. Please provide the incident details first.",
        );
      }
    } else if (cmd === "review") {
      if (turn?.draft) {
        setDraftOpen(true);
      } else {
        notify("No active draft to review yet.");
      }
    } else if (cmd === "discard") {
      if (turn?.draft) {
        setDiscardOpen(true);
      } else {
        notify("No active draft to discard.");
      }
    } else if (cmd === "reset") {
      setResetOpen(true);
    } else if (cmd === "send") {
      if (text.trim())
        void send(text.trim(), undefined, undefined, undefined, true);
    }
  }

  /**
   * Appends this conversation's report to a ticket that is already open.
   *
   * Nothing new is created: the report lands on the existing ticket with a date, the repeat
   * count goes up, and a fault reported three times escalates by itself.
   */
  async function linkToExisting() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{
        ticket: { id: number; ticketNumber: string };
        recurrence: number;
        escalated: boolean;
      }>("/api/iris/link", {
        method: "POST",
        body: JSON.stringify({ sessionId: turnRef.current?.sessionId }),
      });
      const done = {
        ...turnRef.current!,
        phase: "complete" as const,
        message: `Added to ${d.ticket.ticketNumber} as report #${d.recurrence}${d.escalated ? " — flagged as a repeat fault for manager review" : ""}.`,
        ticket: d.ticket,
        options: [],
        assetNote: undefined,
      };
      apply(done);
      setTicketId(d.ticket.id);
      notify(`Added to ${d.ticket.ticketNumber}.`);
      if (voiceMode)
        void speak(`This report was added to ticket ${d.ticket.ticketNumber}.`);
      window.dispatchEvent(new Event("iris:tickets-updated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!turn || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ ticket: { id: number; ticketNumber: string } }>(
        "/api/iris/approve",
        {
          method: "POST",
          body: JSON.stringify({ sessionId: turn.sessionId }),
        },
      );
      const done = {
        ...turn,
        phase: "complete" as const,
        message: `${d.ticket.ticketNumber} is logged and assigned to ${turn.draft?.assignedStaffName}. You can track it from Command.`,
        ticket: d.ticket,
        options: [],
      };
      apply(done);
      setDraftOpen(false);
      notify(`${d.ticket.ticketNumber} created successfully.`);
      if (voiceMode)
        void speak(
          `Ticket ${d.ticket.ticketNumber} has been logged and assigned successfully.`,
        );
      window.dispatchEvent(new Event("iris:tickets-updated"));
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
    const pick = (k: string) =>
      typeof r[k] === "string" ? (r[k] as string) : "";
    setEdits({
      title: d.title,
      description: d.description,
      kind: d.kind,
      category: pick("category"),
      subcategory: pick("subcategory"),
      studio: d.studio,
      memberName: d.memberName,
      memberEmail: pick("memberEmail"),
      memberPhone: pick("memberPhone"),
      classFormat: pick("classFormat"),
      trainer: pick("trainer"),
      membership: pick("membership"),
      incidentAt: d.incidentAt,
      impact: pick("impact"),
      preferredContact: pick("preferredContact"),
      requestedResolution: d.requestedResolution || "",
    });
    setEditOpen(true);
  }

  /** Throws away the server-side conversation and starts a clean one. */
  async function discard(message: string) {
    const current = turnRef.current;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (current && current.phase !== "complete") {
        await api("/api/iris/discard", {
          method: "POST",
          body: JSON.stringify({ sessionId: current.sessionId }),
        });
      }
      localStorage.removeItem("iris-conversation");
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
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
      lock.current = false;
    }
    await start(true);
  }

  function toggleVoiceMode() {
    const next = !voiceMode;
    setVoiceMode(next);
    localStorage.setItem("iris-voice-replies", next ? "1" : "0");
    notify(
      next ? "IRIS voice replies turned ON." : "Voice replies turned OFF.",
    );
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await api<{ sessions: HistorySessionItem[] }>(
        "/api/iris/history",
      );
      setHistorySessions(data.sessions || []);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function resumeSession(id: string) {
    setBusy(true);
    setError("");
    try {
      const d = await api<IrisTurn>(
        "/api/iris/chat?sessionId=" + encodeURIComponent(id),
      );
      const targetSession = { ...d, sessionId: d.sessionId || id };
      apply(targetSession, true);
      setHistoryOpen(false);
      notify("Resumed past intake session.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function exportMeta() {
    return {
      staffName: user?.name || "Studio staff",
      startedAt: startedAt.current,
      ticketNumber: turn?.ticket?.ticketNumber,
    };
  }
  async function copyChat() {
    await navigator.clipboard
      .writeText(toPlainText(messages, exportMeta()))
      .then(() => notify("Transcript copied to clipboard."))
      .catch(() => notify("Clipboard access was blocked.", "error"));
    setExportOpen(false);
  }
  function clearChat() {
    void discard("Chat and draft cleared.");
  }
  async function exportAs(
    kind: "txt" | "md" | "json" | "png" | "pdf" | "docx",
  ) {
    setExportOpen(false);
    const meta = exportMeta();
    try {
      if (kind === "txt")
        downloadText("iris-chat.txt", toPlainText(messages, meta));
      else if (kind === "md")
        downloadText(
          "iris-chat.md",
          toMarkdown(messages, meta),
          "text/markdown",
        );
      else if (kind === "json")
        downloadText(
          "iris-chat.json",
          toJson(messages, meta),
          "application/json",
        );
      else if (kind === "png") {
        const { toPng } = await import("html-to-image");
        if (!scroller.current) return;
        const dataUrl = await toPng(scroller.current, {
          backgroundColor:
            getComputedStyle(document.body).getPropertyValue("--surface") ||
            "#131318",
          pixelRatio: 2,
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "iris-chat.png";
        a.click();
      } else if (kind === "pdf") {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "pt" });
        const width = doc.internal.pageSize.getWidth() - 72;
        let y = 54;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("IRIS — Internal Ticket Log", 36, y);
        y += 22;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(
          `Logged by ${meta.staffName} · ${new Date(meta.startedAt).toLocaleString("en-IN")}`,
          36,
          y,
        );
        y += 24;
        for (const m of messages) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          const who =
            m.role === "assistant" ? "IRIS" : meta.staffName.toUpperCase();
          if (y > 760) {
            doc.addPage();
            y = 54;
          }
          doc.text(who, 36, y);
          y += 14;
          doc.setFont("helvetica", "normal");
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
        doc.save("iris-chat.pdf");
      } else if (kind === "docx") {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } =
          await import("docx");
        const doc = new Document({
          sections: [
            {
              children: [
                new Paragraph({
                  text: "IRIS — Internal Ticket Log",
                  heading: HeadingLevel.HEADING_1,
                }),
                new Paragraph({
                  text: `Logged by ${meta.staffName} · ${new Date(meta.startedAt).toLocaleString("en-IN")}`,
                }),
                new Paragraph({ text: "" }),
                ...messages.flatMap((m) => [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text:
                          m.role === "assistant"
                            ? "IRIS"
                            : meta.staffName.toUpperCase(),
                        bold: true,
                      }),
                    ],
                  }),
                  new Paragraph({ text: m.content }),
                  new Paragraph({ text: "" }),
                ]),
              ],
            },
          ],
        });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "iris-chat.docx";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify("Export ready.");
    } catch {
      notify("Export failed — please try again.", "error");
    }
  }

  function getMessageTime(m: IrisMessage) {
    let t = messageTimestamps.current.get(m);
    if (!t) {
      t = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      messageTimestamps.current.set(m, t);
    }
    return t;
  }

  const collected = turn?.collected || {};
  const fieldOrder: [string, string][] = [
    ["reportedBy", "reported_by"],
    ["kind", "entry_type"],
    ["category", "category"],
    ["subcategory", "subcategory"],
    ["memberName", "logged_for"],
    ["studio", "studio"],
    ["area", "area"],
    ["classFormat", "class"],
    ["trainer", "trainer"],
    ["incidentAt", "when"],
    ["impact", "impact"],
    ["requestedResolution", "next_step"],
  ];
  return {
    speaking,
    theme,
    busy,
    voiceMode,
    toggleVoiceMode,
    setHistoryOpen,
    loadHistory,
    copyChat,
    setClearOpen,
    exportRef,
    setExportOpen,
    exportOpen,
    exportAs,
    setResetOpen,
    scroller,
    turn,
    messages,
    getMessageTime,
    streamed,
    send,
    setDiscardOpen,
    setDraftOpen,
    setRightPanelTab,
    setTicketId,
    error,
    start,
    text,
    attachments,
    pendingContext,
    liveContext,
    setPendingContext,
    setAttachments,
    textareaRef,
    setText,
    handleVoiceCommand,
    setVoiceMode,
    rightPanelTab,
    collected,
    fieldOrder,
    historyOpen,
    discard,
    historyLoading,
    historySessions,
    resumeSession,
    draftOpen,
    edit,
    approve,
    editOpen,
    setEditOpen,
    edits,
    setEdits,
    resetOpen,
    clearOpen,
    clearChat,
    discardOpen,
    ticketId,
  };
}
export function IrisChat(props: {
  presetCategory?: string;
  presetSubcategory?: string;
}) {
  const model = useIrisChatController(props);
  return <IrisChatView model={model} />;
}

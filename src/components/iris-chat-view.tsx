"use client";
import { display } from "@/lib/display";
import type { PickerOption } from "@/lib/ticket-contract";
import {
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  Eraser,
  FileCheck2,
  FileJson,
  FileText,
  FileType,
  Gift,
  History,
  Image as ImageIcon,
  LockKeyhole,
  Plus,
  Radio,
  Trash2,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { AttachmentPreviewList, FileUpload } from "./file-upload";
import type { useIrisChatController } from "./iris-chat-controller";
import { IrisContextBar } from "./iris-context-bar";
import { MomenceActionCenter } from "./momence-action-center";
import { MultiSelect } from "./multi-select";
import { TicketDialog } from "./ticket-detail";
import { Badge, Loading } from "./ui";
import { VoiceInput, parseVoiceCommand } from "./voice-input";

export { streamTurn } from "./iris-stream";
const LazyHistoryDialogPanel = dynamic(
  () => import("./iris-chat-history-dialog"),
);
function HistoryDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  return model.historyOpen ? <LazyHistoryDialogPanel model={model} /> : null;
}
const LazyDraftDialogPanel = dynamic(() => import("./iris-chat-draft-dialog"));
function DraftDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  return model.draftOpen ? <LazyDraftDialogPanel model={model} /> : null;
}
const LazyEditDialogPanel = dynamic(() => import("./iris-chat-edit-dialog"));
function EditDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  return model.editOpen ? <LazyEditDialogPanel model={model} /> : null;
}
const LazyResetDialogPanel = dynamic(() => import("./iris-chat-reset-dialog"));
function ResetDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  return model.resetOpen ? <LazyResetDialogPanel model={model} /> : null;
}
const LazyClearDialogPanel = dynamic(() => import("./iris-chat-clear-dialog"));
function ClearDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  return model.clearOpen ? <LazyClearDialogPanel model={model} /> : null;
}
const LazyDiscardDialogPanel = dynamic(
  () => import("./iris-chat-discard-dialog"),
);
function DiscardDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  return model.discardOpen ? <LazyDiscardDialogPanel model={model} /> : null;
}
export function IrisChatView({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const {
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
  } = model;
  return (
    <>
      <div className="chat-layout">
        <section className="card chat-panel">
          <div className="chat-ambient-glow" aria-hidden="true" />
          <div className="chat-head">
            <div className="chat-identity">
              <div className={"avatar-ring" + (speaking ? " speaking" : "")}>
                <Image
                  src={
                    theme === "dark"
                      ? "/images/iris-avatar-dark.webp"
                      : "/images/iris-avatar-light.webp"
                  }
                  alt="IRIS"
                  fill
                  sizes="44px"
                />
                <span className="live-avatar-pulse" />
              </div>
              <div className="chat-identity-meta">
                <div className="chat-identity-title">
                  <strong>IRIS</strong>
                  <span className="chat-agent-pill">Ops Assistant</span>
                </div>
                <div className="chat-identity-sub">
                  <span className="live-dot-glow" />
                  <span className="sub-text">
                    {busy
                      ? "Analyzing studio context & logs…"
                      : speaking
                        ? "Speaking voice response…"
                        : "Physique 57 Ops Intelligence · Real-time Assistant"}
                  </span>
                </div>
              </div>
            </div>
            <div className="chat-toolbar">
              <button
                className={"toolbar-pill-btn" + (voiceMode ? " active" : "")}
                title={
                  voiceMode
                    ? "Voice replies ON (Tap to mute)"
                    : "Voice replies OFF (Tap to enable voice answers)"
                }
                aria-label="Toggle spoken replies"
                onClick={toggleVoiceMode}
              >
                {voiceMode ? (
                  <Volume2 size={13} className="voice-icon-pulse" />
                ) : (
                  <VolumeX size={13} />
                )}
                <span className="btn-txt">
                  {voiceMode ? "Voice ON" : "Voice"}
                </span>
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
              <button
                className="icon-btn toolbar-icon"
                title="Copy transcript"
                aria-label="Copy transcript to clipboard"
                onClick={() => void copyChat()}
              >
                <Copy size={13} />
              </button>
              <button
                className="icon-btn toolbar-icon"
                title="Clear chat and draft"
                aria-label="Clear chat and draft"
                onClick={() => setClearOpen(true)}
              >
                <Eraser size={13} />
              </button>
              <div style={{ position: "relative" }} ref={exportRef}>
                <button
                  className="icon-btn toolbar-icon"
                  title="Export chat"
                  aria-label="Export chat"
                  onClick={() => setExportOpen((v) => !v)}
                >
                  <Download size={13} />
                </button>
                {exportOpen && (
                  <div className="card export-popover">
                    <div className="export-popover-title">
                      Export transcript
                    </div>
                    {[
                      ["txt", "Plain text", FileText],
                      ["md", "Markdown", FileText],
                      ["json", "JSON", FileJson],
                      ["png", "Image (PNG)", ImageIcon],
                      ["pdf", "PDF document", FileType],
                      ["docx", "Word (.docx)", FileType],
                    ].map(([k, label, Icon]) => {
                      const I = Icon as typeof FileText;
                      return (
                        <button
                          key={k as string}
                          className="export-popover-item"
                          onClick={() => void exportAs(k as "txt")}
                        >
                          <span className="export-popover-icon">
                            <I size={14} />
                          </span>
                          <span className="export-popover-label">
                            {label as string}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className="icon-btn"
                title="Start fresh conversation"
                aria-label="Start a new conversation"
                onClick={() => setResetOpen(true)}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="chat-scroll" ref={scroller}>
            <div className="chat-scroll-vignette" aria-hidden="true" />
            <div className="chat-day">
              <span>Internal ticket logging · Physique 57 India</span>
            </div>
            {!turn && busy ? (
              <Loading />
            ) : (
              messages.map((m, i) => (
                <div
                  className={
                    "chat-message " + (m.role === "user" ? "user" : "")
                  }
                  key={i}
                >
                  {m.role === "assistant" && (
                    <span className="msg-avatar">
                      <Image
                        src={
                          theme === "dark"
                            ? "/images/iris-avatar-dark.webp"
                            : "/images/iris-avatar-light.webp"
                        }
                        alt=""
                        fill
                        sizes="30px"
                      />
                    </span>
                  )}
                  <div className="bubble-wrap">
                    <div className="bubble">
                      {m.content.startsWith("__")
                        ? "Selection made from Momence"
                        : m.content}
                    </div>
                    <div className="chat-message-meta">
                      <span>{getMessageTime(m)}</span>
                      {m.role === "user" && (
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
                  <Image
                    src={
                      theme === "dark"
                        ? "/images/iris-avatar-dark.webp"
                        : "/images/iris-avatar-light.webp"
                    }
                    alt=""
                    fill
                    sizes="30px"
                  />
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
            {!busy && turn?.lookup && turn.phase !== "complete" && (
              <div style={{ margin: "0 0 24px 36px" }}>
                <MultiSelect
                  module={turn.lookup}
                  value={[]}
                  studio={turn.lookupFilters?.studio}
                  sessionTypes={turn.lookupFilters?.sessionTypes}
                  upcoming={turn.lookupFilters?.upcoming}
                  onChange={(opts: PickerOption[]) => {
                    const o = opts[0];
                    if (o)
                      void send(undefined, o.label, {
                        module: turn.lookup!,
                        id: String(o.id),
                      });
                  }}
                  placeholder={
                    turn.lookup === "members"
                      ? "Search members by name, email or phone…"
                      : "Search classes by name, trainer or studio…"
                  }
                />
              </div>
            )}
            {!busy && turn?.options?.length && turn.phase !== "complete" ? (
              <div className="chat-options">
                {turn.options.map((o) => (
                  <button
                    className="btn"
                    key={o.value}
                    onClick={() => void send(o.value, o.label)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
            {/* What the equipment register already knows about this bike. Shown while the
                fault is being reported, which is the only moment it can change a decision. */}
            {!busy && turn?.assetNote && turn.phase !== "complete" ? (
              <div
                className="info-box"
                style={{ margin: "0 0 20px 36px", alignItems: "center" }}
              >
                <Wrench size={16} />
                <span>{turn.assetNote}</span>
              </div>
            ) : null}
            {turn?.phase === "draft" && (
              <div
                className="info-box"
                style={{ margin: "0 0 20px 36px", alignItems: "center" }}
              >
                <FileCheck2 size={21} />
                <div className="grow">
                  <strong style={{ fontSize: 12 }}>
                    Ticket draft ready to review
                  </strong>
                  <p style={{ fontSize: 11 }}>
                    Say &quot;approve ticket&quot; or click review to verify the
                    assignment and resolution plan.
                  </p>
                </div>
                <button className="btn" onClick={() => setDiscardOpen(true)}>
                  <Trash2 size={12} />
                  Discard
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setDraftOpen(true)}
                >
                  Review draft <ArrowUpRight size={12} />
                </button>
              </div>
            )}
            {(turn?.phase === "draft" || turn?.phase === "complete") && (
              <div
                className="chat-action-callout"
                style={{ margin: "0 0 16px 36px" }}
              >
                <div className="action-callout-text">
                  <Zap size={13} className="accent" />
                  <span>
                    <strong>1-Click Momence Resolution Available:</strong> Grant
                    class credit or draft WhatsApp care message.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary action-callout-btn"
                  onClick={() => setRightPanelTab("action_center")}
                >
                  <Gift size={12} />
                  Open Action Center
                </button>
              </div>
            )}
            {turn?.phase === "complete" && turn.ticket && (
              <div
                className="card card-pad"
                style={{ marginLeft: 36, background: "var(--green-bg)" }}
              >
                <CheckCircle2
                  size={25}
                  style={{ color: "var(--green)", marginBottom: 12 }}
                />
                <h3>{turn.ticket.ticketNumber} · logged</h3>
                <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                  Saved to Command with routing and a resolution target already
                  set.
                </p>
                <button
                  className="btn"
                  style={{ marginTop: 16 }}
                  onClick={() => setTicketId(turn.ticket!.id)}
                >
                  Open ticket <ArrowUpRight size={12} />
                </button>
              </div>
            )}
            {turn?.notice && (
              <div className="info-box warning" style={{ marginTop: 15 }}>
                {turn.notice}
              </div>
            )}
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

          {turn?.phase !== "complete" && (
            <form
              className="chat-compose"
              data-tour="iris-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim() || attachments.length > 0)
                  void send(text.trim());
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
                    onRemove={(id) =>
                      setAttachments((prev) => prev.filter((f) => f.id !== id))
                    }
                  />
                )}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  aria-label="Message IRIS"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if ((text.trim() || attachments.length > 0) && !busy)
                        void send(text.trim());
                    }
                  }}
                  placeholder={
                    turn?.lookup
                      ? "Search above, or add more detail…"
                      : turn?.phase === "draft"
                        ? 'Say "approve ticket" or tell IRIS what to adjust…'
                        : 'Speak or type what you noticed (e.g. "Water leak in locker room at kemps during Rohan\'s class")…'
                  }
                />
                <div className="compose-actions-bar">
                  <div className="compose-actions-left">
                    <FileUpload
                      onFilesSelected={(files) => setAttachments(files)}
                      files={attachments}
                    />
                  </div>
                  <div className="compose-actions-right">
                    <VoiceInput
                      disabled={busy}
                      onVoiceCommand={handleVoiceCommand}
                      onVoiceUsed={() => {
                        if (!voiceMode) {
                          setVoiceMode(true);
                          localStorage.setItem("iris-voice-replies", "1");
                        }
                      }}
                      onText={(v) => {
                        const clean = v.trim();
                        const cmd = parseVoiceCommand(clean);
                        if (cmd) {
                          handleVoiceCommand(cmd);
                        } else {
                          setText((t) => (t ? t + " " + clean : clean));
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className={`icon-btn compose-action-btn send-btn ${text.trim() || attachments.length > 0 ? "active" : ""}`}
                      disabled={
                        busy || (!text.trim() && attachments.length === 0)
                      }
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
                  <LockKeyhole
                    size={9}
                    style={{ display: "inline", marginRight: 4 }}
                  />
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
              className={`panel-tab-btn ${rightPanelTab === "builder" ? "active" : ""}`}
              onClick={() => setRightPanelTab("builder")}
            >
              <FileCheck2 size={12.5} />
              <span>Ticket Spec</span>
              <span className="tab-count-pill">
                {
                  Object.keys(collected).filter((k) =>
                    fieldOrder.some(([f]) => f === k && collected[k]),
                  ).length
                }
                /8
              </span>
            </button>
            <button
              type="button"
              className={`panel-tab-btn action-tab ${rightPanelTab === "action_center" ? "active" : ""}`}
              onClick={() => setRightPanelTab("action_center")}
            >
              <Zap size={12.5} className="action-zap" />
              <span>Momence Actions</span>
              <span className="tab-live-badge">
                <span className="badge-pulse-dot" />
                LIVE
              </span>
            </button>
          </div>

          {rightPanelTab === "builder" ? (
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
                  {Array.from({ length: turn?.progress.total || 8 }).map(
                    (_, i) => (
                      <span
                        key={i}
                        className={i < (turn?.progress.done || 0) ? "done" : ""}
                      />
                    ),
                  )}
                </div>
              </div>
              <div className="builder-body">
                {!Object.keys(collected).some((k) =>
                  fieldOrder.some(([key]) => key === k),
                ) ? (
                  <div className="builder-empty">
                    Waiting for the first details…
                    <br />
                    Mention studio, issue, trainer, or area.
                  </div>
                ) : (
                  fieldOrder
                    .filter(
                      ([key]) =>
                        collected[key] !== undefined && collected[key] !== "",
                    )
                    .map(([key, label]) => (
                      <div className="builder-line" key={key}>
                        <span className="k">{label}:</span>
                        <span className="v">{display(collected[key])}</span>
                      </div>
                    ))
                )}
                {collected.category === "Safety and Security" && (
                  <div style={{ marginTop: 16 }}>
                    <span className="k mono" style={{ fontSize: 10 }}>
                      severity_signal
                    </span>
                    <div className="severity-meter">
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ background: "var(--red)" }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {turn?.draft && (
                <div className="builder-footer">
                  <button
                    className="btn btn-primary"
                    onClick={() => setDraftOpen(true)}
                  >
                    <FileCheck2 size={13} />
                    Review complete ticket
                  </button>
                  {turn?.phase !== "complete" && (
                    <button
                      className="btn"
                      style={{ marginTop: 8 }}
                      onClick={() => setDiscardOpen(true)}
                    >
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
                  memberId={String(
                    collected.momenceMemberId ||
                      pendingContext.momenceMemberId ||
                      "",
                  )}
                  memberName={String(
                    collected.memberName || pendingContext.memberName || "",
                  )}
                  memberEmail={String(collected.memberEmail || "")}
                  memberPhone={String(collected.memberPhone || "")}
                  studio={String(
                    collected.studio || pendingContext.studio || "",
                  )}
                  category={String(
                    collected.category || pendingContext.category || "",
                  )}
                  subcategory={String(
                    collected.subcategory || pendingContext.subcategory || "",
                  )}
                  sessionId={String(
                    collected.momenceSessionId ||
                      pendingContext.momenceSessionId ||
                      "",
                  )}
                  classFormat={String(
                    collected.classFormat || pendingContext.classFormat || "",
                  )}
                  trainer={String(
                    collected.trainer || pendingContext.trainer || "",
                  )}
                  issueSummary={String(
                    collected.title || collected.description || "",
                  )}
                />
              </div>
            </>
          )}
        </aside>
      </div>

      {/* 7-DAY CHAT HISTORY MODAL */}
      <HistoryDialogPanel model={model} />

      <DraftDialogPanel model={model} />

      <EditDialogPanel model={model} />

      <ResetDialogPanel model={model} />

      <ClearDialogPanel model={model} />

      <DiscardDialogPanel model={model} />

      {ticketId && (
        <TicketDialog
          open
          id={ticketId}
          onClose={() => setTicketId(undefined)}
        />
      )}
    </>
  );
}

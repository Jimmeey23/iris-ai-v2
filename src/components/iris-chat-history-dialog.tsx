"use client";
import { indiaDate } from "@/lib/display";
import { Clock, ExternalLink, Loader2, Plus } from "lucide-react";
import type { useIrisChatController } from "./iris-chat-controller";
import { Badge, Modal } from "./ui";

export { streamTurn } from "./iris-stream";
export default function HistoryDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const {
    setHistoryOpen,
    collected,
    historyOpen,
    discard,
    historyLoading,
    historySessions,
    resumeSession,
  } = model;
  return (
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
              void discard("Started fresh conversation.");
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
          <div className="py-8 text-center text-sm text-muted">
            <Loader2 size={20} className="animate-spin inline mr-2" />
            Loading history…
          </div>
        ) : historySessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No conversations in the last 7 days. Start logging an issue to
            begin.
          </div>
        ) : (
          historySessions.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => void resumeSession(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void resumeSession(s.id);
                }
              }}
              className="group flex items-start justify-between p-3 rounded-lg border border-border hover:border-border-strong bg-surface cursor-pointer transition-all"
            >
              <div className="grow min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <strong className="text-xs font-semibold text-text truncate">
                    {s.title}
                  </strong>
                  {s.ticketNumber ? (
                    <Badge tone="green">{s.ticketNumber}</Badge>
                  ) : s.phase === "draft" ? (
                    <Badge tone="purple">Draft ready</Badge>
                  ) : (
                    <Badge tone="blue">In progress</Badge>
                  )}
                </div>
                {s.lastMessage && (
                  <p className="text-xs text-muted truncate max-w-[500px]">
                    {s.lastMessage}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {indiaDate(s.createdAt)}
                  </span>
                  <span>{s.messageCount} messages</span>
                  {s.collected?.studio ? (
                    <span>· {String(s.collected.studio)}</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                aria-label={"Open conversation " + s.title}
                className="text-muted group-hover:text-text p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  void resumeSession(s.id);
                }}
              >
                <ExternalLink size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

"use client";
import { Loader2, PencilLine, Send, Trash2 } from "lucide-react";
import { DraftDocument } from "./draft-document";
import type { useIrisChatController } from "./iris-chat-controller";
import { Modal } from "./ui";

export { streamTurn } from "./iris-stream";
export default function DraftDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const { busy, turn, setDiscardOpen, setDraftOpen, draftOpen, edit, approve } =
    model;
  return (
    <Modal
      open={draftOpen}
      onClose={() => setDraftOpen(false)}
      title="A clean, structured ticket"
      description="Review every detail before approving it."
      size="wide"
      footer={
        <>
          <button
            className="btn"
            disabled={busy || turn?.phase === "complete"}
            onClick={() => setDiscardOpen(true)}
          >
            <Trash2 size={13} />
            Discard draft
          </button>
          <button
            className="btn"
            disabled={turn?.phase === "complete"}
            onClick={edit}
          >
            <PencilLine size={13} />
            Edit details
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || turn?.phase === "complete"}
            onClick={() => void approve()}
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}{" "}
            {turn?.phase === "complete"
              ? "Already logged"
              : "Approve & log ticket"}
          </button>
        </>
      }
    >
      {turn?.draft && <DraftDocument draft={turn.draft} onEdit={edit} />}
    </Modal>
  );
}

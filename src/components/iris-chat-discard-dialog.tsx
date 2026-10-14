"use client";
import { Trash2 } from "lucide-react";
import type { useIrisChatController } from "./iris-chat-controller";
import { Modal } from "./ui";

export { streamTurn } from "./iris-stream";
export default function DiscardDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const { setDiscardOpen, discard, discardOpen } = model;
  return (
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
              void discard("Draft discarded. IRIS is ready for a new ticket.");
            }}
          >
            <Trash2 size={13} />
            Discard draft
          </button>
        </>
      }
    >
      <p className="secondary">
        If you only need a few corrections, close this and use{" "}
        <strong>Edit details</strong> instead — that keeps everything IRIS
        already captured.
      </p>
    </Modal>
  );
}

"use client";
import { Eraser } from "lucide-react";
import type { useIrisChatController } from "./iris-chat-controller";
import { Modal } from "./ui";

export { streamTurn } from "./iris-stream";
export default function ClearDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const { setClearOpen, clearOpen, clearChat } = model;
  return (
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
        Export the transcript first if you need a copy. Tickets already logged
        are not affected.
      </p>
    </Modal>
  );
}

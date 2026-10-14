"use client";
import type { useIrisChatController } from "./iris-chat-controller";
import { Modal } from "./ui";

export { streamTurn } from "./iris-stream";
export default function ResetDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const { setResetOpen, discard, resetOpen } = model;
  return (
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
              void discard(
                "Started a fresh conversation. The old draft was discarded.",
              );
            }}
          >
            Start fresh
          </button>
        </>
      }
    >
      <p className="secondary">
        Any ticket you’ve already approved won’t change. The unapproved draft is
        deleted and IRIS starts from a clean slate.
      </p>
    </Modal>
  );
}

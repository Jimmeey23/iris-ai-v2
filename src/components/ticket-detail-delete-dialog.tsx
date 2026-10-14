"use client";
import { Loader2, Trash2 } from "lucide-react";
import type { useTicketDialogController } from "./ticket-detail-controller";
import { Field, Modal } from "./ui";
export default function DeleteDialogPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const {
    open,
    onClose,
    t,
    busy,
    setDeleteConfirmation,
    setDeleteOpen,
    deleteOpen,
    deleteConfirmation,
    deleteTicket,
  } = model;
  if (!t) return null;
  return (
    <Modal
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      title="Delete ticket"
      description="This permanently removes the ticket and its comments, activity, resolution records, links and notifications."
      size="narrow"
      footer={
        <>
          <button
            className="btn"
            disabled={busy}
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={busy || deleteConfirmation !== t.ticketNumber}
            onClick={() => void deleteTicket()}
          >
            {busy ? (
              <Loader2 className="spin" size={13} />
            ) : (
              <Trash2 size={13} />
            )}
            Delete permanently
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="error-box">
          Deletion cannot be undone. The IRIS conversation is retained but
          unlinked from this ticket.
        </div>
        <Field label={`Enter ${t.ticketNumber} to confirm`}>
          <input
            autoComplete="off"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

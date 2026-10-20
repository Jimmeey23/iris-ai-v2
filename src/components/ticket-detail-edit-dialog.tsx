"use client";
import { Loader2, Pencil } from "lucide-react";
import type { useTicketDialogController } from "./ticket-detail-controller";
import { Field, Modal } from "./ui";
export default function EditDialogPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const {
    open,
    onClose,
    t,
    user,
    busy,
    editOpen,
    setEditOpen,
    edit,
    saveEdit,
    setEdit,
  } = model;
  if (!t) return null;
  return (
    <Modal
      open={editOpen}
      onClose={() => setEditOpen(false)}
      title={`Edit ${t.ticketNumber}`}
      description={
        user?.role === "admin"
          ? "Update the ticket's documented facts. Routing, priority and status remain in the ticket workspace."
          : "Correct the details you filed. Routing, priority and status stay with the assigned owner, and every change is recorded on the ticket's activity log."
      }
      size="wide"
      footer={
        <>
          <button
            className="btn"
            disabled={busy}
            onClick={() => setEditOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              edit.title.trim().length < 3 ||
              edit.description.trim().length < 12 ||
              edit.memberName.trim().length < 2 ||
              !edit.studio.trim()
            }
            onClick={() => void saveEdit()}
          >
            {busy ? (
              <Loader2 className="spin" size={13} />
            ) : (
              <Pencil size={13} />
            )}
            Save changes
          </button>
        </>
      }
    >
      <div className="ticket-admin-edit-grid">
        <Field label="Title">
          <input
            value={edit.title}
            onChange={(e) => setEdit((v) => ({ ...v, title: e.target.value }))}
          />
        </Field>
        <Field label="Summary">
          <input
            value={edit.summary}
            onChange={(e) =>
              setEdit((v) => ({ ...v, summary: e.target.value }))
            }
          />
        </Field>
        {user?.role === "admin" && (
          <Field label="Action required">
            <select
              value={edit.resolutionRequired ? "required" : "record_only"}
              onChange={(e) =>
                setEdit((v) => ({
                  ...v,
                  resolutionRequired: e.target.value === "required",
                }))
              }
            >
              <option value="required">Requires resolution</option>
              <option value="record_only">Record only</option>
            </select>
          </Field>
        )}
        <Field label="What happened">
          <textarea
            value={edit.description}
            onChange={(e) =>
              setEdit((v) => ({ ...v, description: e.target.value }))
            }
          />
        </Field>
        <Field label="Requested outcome">
          <textarea
            value={edit.requestedResolution}
            onChange={(e) =>
              setEdit((v) => ({
                ...v,
                requestedResolution: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Member">
          <input
            value={edit.memberName}
            onChange={(e) =>
              setEdit((v) => ({ ...v, memberName: e.target.value }))
            }
          />
        </Field>
        <Field label="Member email">
          <input
            type="email"
            value={edit.memberEmail}
            onChange={(e) =>
              setEdit((v) => ({ ...v, memberEmail: e.target.value }))
            }
          />
        </Field>
        <Field label="Member phone">
          <input
            value={edit.memberPhone}
            onChange={(e) =>
              setEdit((v) => ({ ...v, memberPhone: e.target.value }))
            }
          />
        </Field>
        <Field label="Follow-up preference">
          <input
            value={edit.preferredContact}
            onChange={(e) =>
              setEdit((v) => ({ ...v, preferredContact: e.target.value }))
            }
          />
        </Field>
        <Field label="Studio Space">
          <input
            value={edit.studio}
            onChange={(e) => setEdit((v) => ({ ...v, studio: e.target.value }))}
          />
        </Field>
        <Field label="When it happened">
          <input
            value={edit.incidentAt}
            onChange={(e) =>
              setEdit((v) => ({ ...v, incidentAt: e.target.value }))
            }
          />
        </Field>
        <Field label="Class">
          <input
            value={edit.classFormat}
            onChange={(e) =>
              setEdit((v) => ({ ...v, classFormat: e.target.value }))
            }
          />
        </Field>
        <Field label="Studio Instructor">
          <input
            value={edit.trainer}
            onChange={(e) =>
              setEdit((v) => ({ ...v, trainer: e.target.value }))
            }
          />
        </Field>
        <Field label="Community access package">
          <input
            value={edit.membership}
            onChange={(e) =>
              setEdit((v) => ({ ...v, membership: e.target.value }))
            }
          />
        </Field>
        <Field label="Reported impact">
          <textarea
            value={edit.impact}
            onChange={(e) => setEdit((v) => ({ ...v, impact: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

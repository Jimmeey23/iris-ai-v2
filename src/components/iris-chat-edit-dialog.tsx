"use client";
import { STUDIOS } from "@/lib/constants";
import type { useIrisChatController } from "./iris-chat-controller";
import { Field, Modal } from "./ui";

export { streamTurn } from "./iris-stream";
export default function EditDialogPanel({
  model,
}: {
  model: ReturnType<typeof useIrisChatController>;
}) {
  const { busy, send, editOpen, setEditOpen, edits, setEdits } = model;
  return (
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
              const patch = Object.fromEntries(
                Object.entries(edits).filter(([, v]) => v.trim() !== ""),
              );
              void send(
                undefined,
                "Updated the draft details.",
                undefined,
                patch,
              ).then(() => setEditOpen(false));
            }}
          >
            Update draft
          </button>
        </>
      }
    >
      <div className="form-grid">
        {Object.entries(edits).map(([k, v]) => (
          <Field
            key={k}
            label={k.replace(/([A-Z])/g, " $1")}
            wide={k === "description" || k === "requestedResolution"}
          >
            {k === "studio" ? (
              <select
                value={v}
                onChange={(e) =>
                  setEdits((s) => ({ ...s, [k]: e.target.value }))
                }
              >
                {STUDIOS.map((s) => (
                  <option key={s.id}>{s.name}</option>
                ))}
              </select>
            ) : k === "kind" ? (
              <select
                value={v}
                onChange={(e) =>
                  setEdits((s) => ({ ...s, [k]: e.target.value }))
                }
              >
                {["issue", "request", "compliment", "feedback"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            ) : k === "description" || k === "requestedResolution" ? (
              <textarea
                value={v}
                onChange={(e) =>
                  setEdits((s) => ({ ...s, [k]: e.target.value }))
                }
              />
            ) : (
              <input
                value={v}
                onChange={(e) =>
                  setEdits((s) => ({ ...s, [k]: e.target.value }))
                }
              />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  );
}

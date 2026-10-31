"use client";
import { indiaDate } from "@/lib/display";
import { Send } from "lucide-react";
import { MentionBox, MentionText } from "./mention-box";
import { ActivityGlyph } from "./ticket-art";
import type { useTicketDialogController } from "./ticket-detail-controller";
export default function TicketActivityPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const {
    busy,
    bundle,
    id,
    mentionPeople,
    note,
    setNote,
    setMentioned,
    addNote,
  } = model;
  if (!bundle) return null;
  return (
    <div className="ticket-detail-grid">
      <div className="stack">
        <h3>Care team notes</h3>
        {bundle.comments.map((n) => (
          <div className="note-item" key={n.id}>
            <div className="between">
              <span>
                {n.authorName} · {n.authorRole}
              </span>
              <small>{indiaDate(n.createdAt)}</small>
            </div>
            <p>
              <MentionText body={n.body} people={mentionPeople} />
            </p>
          </div>
        ))}
        {!bundle.comments.length && (
          <p className="secondary">
            No internal notes yet.
          </p>
        )}
        <MentionBox
          value={note}
          onChange={setNote}
          people={mentionPeople}
          onPick={(person) =>
            setMentioned((current) =>
              current.some((item) => item.userId === person.userId)
                ? current
                : [...current, person],
            )
          }
          placeholder="Add context for your team. Type @ to tag a teammate. This does not message the member."
        />
        <button
          className="btn btn-primary"
          disabled={busy || !note.trim()}
          onClick={() => void addNote()}
        >
          <Send size={13} />
          Post internal note
        </button>
      </div>
      <div>
        <h3 className="timeline-head">Timeline</h3>
        {bundle.activities.map((a) => (
          <div className="timeline-row" key={a.id}>
            <ActivityGlyph action={a.action} />
            <p>
              <strong>{a.actorName}</strong> ·{" "}
              {a.action.replaceAll(".", " ")}
            </p>
            <small>{a.detail}</small>
            <br />
            <small>{indiaDate(a.createdAt)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

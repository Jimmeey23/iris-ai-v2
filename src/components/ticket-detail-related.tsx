"use client";
import { Link2, X } from "lucide-react";
import type { useTicketDialogController } from "./ticket-detail-controller";
import { Empty, Status } from "./ui";
export default function TicketRelatedPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const { bundle, setChildId, id, setLinkOpen, link } = model;
  if (!bundle) return null;
  return (
    <div className="stack">
      <div className="between">
        <div>
          <h3>Linked tickets</h3>
          <p className="secondary">
            Manually connect related incidents or follow-ups.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setLinkOpen(true)}>
          <Link2 size={13} />
          Link a ticket
        </button>
      </div>
      {bundle.linked.map((s) => (
        <div className="related-ticket" key={s.id}>
          <button
            onClick={() => setChildId(s.id)}
            className="text-btn grow related-open"
          >
            <small className="muted">{s.ticketNumber}</small>
            <p>{s.title}</p>
          </button>
          <Status status={s.status} />
          <button
            className="icon-btn"
            aria-label="Remove relationship"
            onClick={() => void link(s.id, true)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {!bundle.linked.length && (
        <Empty
          art="link"
          title="No relationships yet"
          detail="Link tickets to connect context without duplicating your work."
        />
      )}
      <h3>Similar category & subcategory</h3>
      {bundle.similar.map((s) => (
        <div className="related-ticket" key={s.id}>
          <button className="text-btn grow" onClick={() => setChildId(s.id)}>
            {s.ticketNumber} · {s.title}
          </button>
          <button className="btn btn-sm" onClick={() => void link(s.id)}>
            <Link2 size={12} />
            Link
          </button>
        </div>
      ))}
    </div>
  );
}

"use client";
import { Link2 } from "lucide-react";
import type { useTicketDialogController } from "./ticket-detail-controller";
import { Empty, Loading, Modal, SearchField } from "./ui";
export default function LinkDialogPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const {
    open,
    onClose,
    id,
    setLinkOpen,
    link,
    linkOpen,
    linkQuery,
    setLinkQuery,
    linkTerm,
    searching,
    choices,
  } = model;
  return (
    <Modal
      open={linkOpen}
      onClose={() => setLinkOpen(false)}
      title="Link a ticket"
      description="Search for another ticket to link to this one."
      size="narrow"
    >
      <div className="stack">
        <SearchField
          value={linkQuery}
          onChange={setLinkQuery}
          placeholder="Search ticket number or title…"
        />
        {!linkTerm ? (
          <p className="secondary">
            Type a ticket number, ID or title to search.
          </p>
        ) : searching ? (
          <Loading rows={2} variant="list" />
        ) : !choices.length ? (
          <Empty
            art="search"
            title="No matching tickets"
            detail="Try the ticket number, or a different word from the title."
          />
        ) : null}
        {!searching &&
          choices.map((s) => (
            <button
              className="related-ticket"
              key={s.id}
              onClick={() => void link(s.id)}
            >
              <div>
                <small>{s.ticketNumber}</small>
                <p>{s.title}</p>
              </div>
              <Link2 size={14} />
            </button>
          ))}
      </div>
    </Modal>
  );
}

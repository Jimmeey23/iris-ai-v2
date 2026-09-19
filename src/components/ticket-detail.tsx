"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Link2,
  LockKeyhole,
  ShieldCheck,
  CheckCircle2,
  Send,
  ChevronRight,
  ArrowUpRight,
  UserRound,
  CalendarDays,
  Loader2,
  RefreshCw,
  Tag,
  Clock3,
  X,
} from "lucide-react";
import {
  Modal,
  api,
  useApp,
  Loading,
  Empty,
  Avatar,
  Badge,
  Status,
  Priority,
  Field,
  SearchField,
} from "./ui";
import { ResolutionPanel, type ResolutionWorkspace } from "./resolution-panel";
import { SlaCountdown } from "./tickets-board";
import {
  CategoryArt,
  SlaRing,
  PersonPhoto,
  SentimentArt,
  ActivityGlyph,
  CATEGORY_TONE,
} from "./ticket-art";
import { EntityDialog, DataTree } from "./momence-tools";
import { indiaDate, object, display } from "@/lib/display";
import { STAFF, STATUS_LABELS } from "@/lib/constants";
import type { TicketRecord, TicketListRecord } from "@/lib/ticket-contract";
type Resolution = import("./resolution-panel").Resolution;
type Bundle = {
  ticket: TicketRecord;
  comments: {
    id: number;
    authorName: string;
    authorRole: string;
    body: string;
    createdAt: string;
  }[];
  activities: {
    id: number;
    actorName: string;
    action: string;
    detail: string;
    createdAt: string;
  }[];
  similar: {
    id: number;
    ticketNumber: string;
    title: string;
    status: string;
  }[];
  linked: { id: number; ticketNumber: string; title: string; status: string }[];
  canResolve: boolean;
  resolution: Resolution | null;
  steps: import("./resolution-panel").ResolutionStep[];
  followUps: import("./resolution-panel").FollowUp[];
  contacts: import("./resolution-panel").ContactEntry[];
};
export function TicketDialog({
  id,
  open,
  onClose,
  onUpdated,
}: {
  id: number;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { notify, user, openAuth } = useApp();
  const [bundle, setBundle] = useState<Bundle>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false),
    [linkQuery, setLinkQuery] = useState(""),
    [choices, setChoices] = useState<TicketListRecord[]>([]),
    [childId, setChildId] = useState<number>(),
    [entity, setEntity] = useState<{
      module: "members" | "sessions";
      id: string;
    }>(),
    [localDetails, setLocalDetails] = useState<{
      title: string;
      data: unknown;
    }>(),
    [staff, setStaff] = useState(STAFF);
  const load = useCallback(async () => {
    try {
      const d = await api<Bundle>("/api/tickets/" + id);
      setBundle(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    if (open) {
      setBundle(undefined);
      setTab("overview");
      void load();
      void api<{ staff: typeof STAFF }>("/api/staff")
        .then((d) => setStaff(d.staff))
        .catch(() => {});
      const timer = setInterval(() => {
        if (!document.hidden) void load();
      }, 30000);
      return () => clearInterval(timer);
    }
  }, [open, load]);
  useEffect(() => {
    if (linkOpen)
      void api<{ tickets: TicketListRecord[] }>("/api/tickets")
        .then((d) => setChoices(d.tickets))
        .catch((e) => notify(e.message, "error"));
  }, [linkOpen, notify]);
  async function patch(p: Record<string, unknown>) {
    if (!bundle) return;
    setBusy(true);
    try {
      const d = await api<{
        followUpTicket?: { id: number; ticketNumber: string } | null;
      }>("/api/tickets/" + id, {
        method: "PATCH",
        body: JSON.stringify({ ...p, version: bundle.ticket.version }),
      });
      await load();
      onUpdated?.();
      window.dispatchEvent(new Event("iris:tickets-updated"));
      if (d.followUpTicket)
        notify(
          `Bike relapse check ${d.followUpTicket.ticketNumber} auto-raised, due in 48 hours.`,
        );
      else notify("Ticket updated.");
    } catch (e) {
      notify((e as Error).message, "error");
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    setBusy(true);
    try {
      const d = await api<{ ticket: TicketRecord }>("/api/tickets/" + id, {
        method: "POST",
        body: JSON.stringify({ action: "duplicate" }),
      });
      notify(`${d.ticket.ticketNumber} created and linked as a duplicate.`);
      onUpdated?.();
      setChildId(d.ticket.id);
      await load();
      window.dispatchEvent(new Event("iris:tickets-updated"));
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function link(otherId: number, remove = false) {
    try {
      await api("/api/tickets/" + id, {
        method: "POST",
        body: JSON.stringify({
          action: remove ? "unlink" : "link",
          relatedId: otherId,
        }),
      });
      await load();
      setLinkOpen(false);
      notify(remove ? "Ticket relationship removed." : "Tickets linked.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api("/api/tickets/" + id + "/comments", {
        method: "POST",
        body: JSON.stringify({ body: note, isInternal: true }),
      });
      setNote("");
      await load();
      notify("Internal note saved.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const t = bundle?.ticket;
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t ? t.ticketNumber : "Ticket details"}
        description={
          t
            ? `Logged ${indiaDate(t.createdAt)} by ${t.memberName}`
            : "Loading the latest ticket details"
        }
        size="wide"
        footer={
          <>
            <span className="muted flex-row" style={{ fontSize: 10 }}>
              <ShieldCheck size={13} />
              Saved to your workspace · updates every 15s
            </span>
            <div className="flex-row">
              <button className="btn" onClick={() => void load()}>
                <RefreshCw size={13} />
                Refresh
              </button>
              <button
                className="btn"
                disabled={busy || !t}
                onClick={() => void duplicate()}
              >
                <Copy size={13} />
                Duplicate
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        }
      >
        {error && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        {!t || !bundle ? (
          <Loading />
        ) : (
          <div className="ticket-detail-shell">
            <div className="stack">
              <header
                className="td-masthead"
                data-tone={CATEGORY_TONE[t.category] || "accent"}
              >
                <CategoryArt
                  category={t.category}
                  className="td-masthead-art"
                />
                <div className="td-masthead-body">
                  <p className="td-trail">
                    {t.category} › {t.subcategory}
                    <span className="td-rev">
                      Revision {t.version} · updated {indiaDate(t.updatedAt)}
                    </span>
                  </p>
                  <h2 className="td-title">{t.title}</h2>
                  <p className="td-summary">{t.summary}</p>
                  <div className="td-chips">
                    <Status status={t.status} />
                    <Priority priority={t.priority} />
                    <Badge tone="blue">{t.departmentName}</Badge>
                    <Badge>{t.kind}</Badge>
                    {!t.resolutionRequired && (
                      <Badge tone="green">Record only</Badge>
                    )}
                    {t.isEscalated && <Badge tone="red">Escalated</Badge>}
                  </div>
                </div>
                <div className="td-masthead-sla">
                  <SlaRing
                    createdAt={t.createdAt}
                    slaDueAt={t.slaDueAt}
                    status={t.status}
                  />
                  <SlaCountdown ticket={t as never} large />
                  <small>
                    {t.slaDueAt
                      ? "Due " + indiaDate(t.slaDueAt)
                      : "No follow-up deadline"}
                  </small>
                </div>
              </header>
              <div className="workspace-tabs" style={{ padding: 0 }}>
                {["overview", "activity", "related"].map((s) => (
                  <button
                    key={s}
                    className={tab === s ? "active" : ""}
                    onClick={() => setTab(s)}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                    {s === "related" && (
                      <span>
                        {bundle.linked.length + bundle.similar.length}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  className={"rail-toggle" + (railOpen ? " active" : "")}
                  onClick={() => setRailOpen((v) => !v)}
                  aria-expanded={railOpen}
                >
                  <LockKeyhole size={12} />
                  Resolution
                  {bundle.canResolve &&
                    bundle.steps.length +
                      bundle.followUps.filter((f) => !f.done).length >
                      0 && (
                      <span>
                        {bundle.steps.length +
                          bundle.followUps.filter((f) => !f.done).length}
                      </span>
                    )}
                </button>
                <button
                  className="td-copy"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(window.location.origin + "/tickets/" + id)
                      .then(() => notify("Ticket link copied."))
                      .catch(() =>
                        notify(
                          "Your browser blocked clipboard access.",
                          "error",
                        ),
                      );
                  }}
                >
                  <Link2 size={12} />
                  Copy link
                </button>
              </div>
              <div
                className={
                  "ticket-workspace-split" + (railOpen ? " rail-open" : "")
                }
              >
                <div className="ticket-workspace-main">
                  {tab === "overview" && (
                    <div className="td-overview">
                      <div className="td-column">
                        {t.description.trim() !== t.summary.trim() && (
                          <section className="td-block">
                            <h3>What happened</h3>
                            <p className="td-narrative">{t.description}</p>
                          </section>
                        )}
                        <section className="td-block">
                          <h3>Context</h3>
                          <dl className="td-facts">
                            {[
                              { k: "Reported by", v: t.memberName },
                              { k: "Email", v: t.memberEmail },
                              { k: "Phone", v: t.memberPhone },
                              { k: "Preferred contact", v: t.preferredContact },
                              { k: "Studio", v: t.studio },
                              {
                                k: "When it happened",
                                v: t.incidentAt
                                  ? indiaDate(t.incidentAt)
                                  : null,
                              },
                              { k: "Class or session", v: t.classFormat },
                              { k: "Trainer", v: t.trainer },
                              { k: "Membership", v: t.membership },
                              { k: "Asked for", v: t.requestedResolution },
                              { k: "Impact", v: t.impact },
                            ]
                              .filter((f) => f.v)
                              .map((f) => (
                                <div key={f.k}>
                                  <dt>{f.k}</dt>
                                  <dd>{display(f.v)}</dd>
                                </div>
                              ))}
                          </dl>
                        </section>
                        <section className="td-block">
                          <div className="between">
                            <h3>Similar tickets</h3>
                            <Badge>{bundle.similar.length}</Badge>
                          </div>
                          <p className="td-block-note">
                            Same category and subcategory.
                          </p>
                          {bundle.similar.map((s) => (
                            <button
                              className="related-ticket"
                              key={s.id}
                              onClick={() => setChildId(s.id)}
                            >
                              <div>
                                <small>{s.ticketNumber}</small>
                                <p>{s.title}</p>
                              </div>
                              <ChevronRight size={13} />
                            </button>
                          ))}
                          {!bundle.similar.length && (
                            <p className="td-empty-line">
                              This is the first ticket of its kind.
                            </p>
                          )}
                        </section>
                      </div>
                      <aside className="td-aside">
                        <div className="td-panel">
                          <h3>Routing</h3>
                          <div className="detail-fields">
                            <Field label="Priority">
                              <select
                                disabled={busy || !t.resolutionRequired}
                                value={t.priority}
                                onChange={(e) =>
                                  void patch({ priority: e.target.value })
                                }
                              >
                                {["critical", "high", "medium", "low"].map(
                                  (k) => (
                                    <option key={k}>{k}</option>
                                  ),
                                )}
                              </select>
                            </Field>
                            <Field label="Assigned owner">
                              <select
                                disabled={busy}
                                value={t.assignedStaffId ?? ""}
                                onChange={(e) =>
                                  void patch({
                                    assignedStaffId: Number(e.target.value),
                                  })
                                }
                              >
                                {staff
                                  .filter((p) => p.isActive)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            <button
                              className="btn btn-sm"
                              disabled={busy || t.isEscalated}
                              onClick={() => void patch({ isEscalated: true })}
                            >
                              {t.isEscalated
                                ? "Escalated"
                                : "Escalate for review"}
                            </button>
                          </div>
                          <p className="td-panel-note">
                            Status changes live in the resolution panel.
                          </p>
                        </div>
                        <div className="td-panel">
                          <h3>People</h3>
                          <button
                            className="related-ticket"
                            onClick={() =>
                              t.momenceMemberId &&
                              object(t.momenceContext).source !== "demo"
                                ? setEntity({
                                    module: "members",
                                    id: t.momenceMemberId,
                                  })
                                : setLocalDetails({
                                    title: t.memberName,
                                    data: {
                                      name: t.memberName,
                                      email: t.memberEmail,
                                      phone: t.memberPhone,
                                      membership: t.membership,
                                      note:
                                        object(t.momenceContext).source ===
                                        "demo"
                                          ? "Demo profile snapshot. This is not a live member record."
                                          : "Local ticket contact. No Momence profile is linked.",
                                    },
                                  })
                            }
                          >
                            <div className="flex-row">
                              <PersonPhoto name={t.memberName} size={34} />
                              <div>
                                <p>{t.memberName}</p>
                                <small>
                                  {t.momenceMemberId
                                    ? "Momence member"
                                    : "Ticket contact"}
                                </small>
                              </div>
                            </div>
                            <ArrowUpRight size={13} />
                          </button>
                          {t.classFormat && (
                            <button
                              className="related-ticket"
                              onClick={() =>
                                t.momenceSessionId &&
                                object(t.customFields.sessionContext).source !==
                                  "demo"
                                  ? setEntity({
                                      module: "sessions",
                                      id: t.momenceSessionId,
                                    })
                                  : setLocalDetails({
                                      title: t.classFormat || "Class",
                                      data: {
                                        format: t.classFormat,
                                        trainer: t.trainer,
                                        studio: t.studio,
                                        when: t.incidentAt,
                                        note:
                                          object(t.customFields.sessionContext)
                                            .source === "demo"
                                            ? "Demo session snapshot. This is not a live class record."
                                            : "Manually recorded class details.",
                                      },
                                    })
                              }
                            >
                              <div className="flex-row">
                                {t.trainer ? (
                                  <PersonPhoto
                                    name={t.trainer.split(",")[0].trim()}
                                    size={34}
                                    tone="purple"
                                  />
                                ) : null}
                                <div>
                                  <p>{t.classFormat}</p>
                                  <small>{t.trainer}</small>
                                </div>
                              </div>
                              <ArrowUpRight size={13} />
                            </button>
                          )}
                        </div>
                        <div className="td-panel td-panel-sentiment">
                          <h3>How they felt</h3>
                          <SentimentArt sentiment={t.sentiment || "neutral"} />
                        </div>
                      </aside>
                    </div>
                  )}
                  {tab === "activity" && (
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
                            <p>{n.body}</p>
                          </div>
                        ))}
                        {!bundle.comments.length && (
                          <p className="secondary" style={{ fontSize: 12 }}>
                            No internal notes yet.
                          </p>
                        )}
                        <textarea
                          rows={3}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Add context for your team. This does not send a message to the member."
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
                        <h3 style={{ marginBottom: 22 }}>Timeline</h3>
                        {bundle.activities.map((a) => (
                          <div className="timeline-row" key={a.id}>
                            <ActivityGlyph action={a.action} />
                            <p>
                              <strong style={{ fontWeight: 500 }}>
                                {a.actorName}
                              </strong>{" "}
                              · {a.action.replaceAll(".", " ")}
                            </p>
                            <small>{a.detail}</small>
                            <br />
                            <small>{indiaDate(a.createdAt)}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tab === "related" && (
                    <div className="stack">
                      <div className="between">
                        <div>
                          <h3>Linked tickets</h3>
                          <p className="secondary" style={{ fontSize: 12 }}>
                            Manually connect related incidents or follow-ups.
                          </p>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={() => setLinkOpen(true)}
                        >
                          <Link2 size={13} />
                          Link a ticket
                        </button>
                      </div>
                      {bundle.linked.map((s) => (
                        <div className="related-ticket" key={s.id}>
                          <button
                            className="text-btn grow"
                            onClick={() => setChildId(s.id)}
                            style={{ textAlign: "left", display: "block" }}
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
                          <button
                            className="text-btn grow"
                            onClick={() => setChildId(s.id)}
                          >
                            {s.ticketNumber} · {s.title}
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => void link(s.id)}
                          >
                            <Link2 size={12} />
                            Link
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {railOpen && (
                  <ResolutionPanel
                    ticket={t}
                    canResolve={bundle.canResolve}
                    workspace={{
                      resolution: bundle.resolution,
                      steps: bundle.steps,
                      followUps: bundle.followUps,
                      contacts: bundle.contacts,
                    }}
                    busy={busy}
                    onClose={() => setRailOpen(false)}
                    onChanged={(w: ResolutionWorkspace) =>
                      setBundle((b) => (b ? { ...b, ...w } : b))
                    }
                    onPatch={async (pp) => {
                      await patch(pp);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Connect the dots"
        description="Search and link another ticket."
        size="narrow"
      >
        <div className="stack">
          <SearchField
            value={linkQuery}
            onChange={setLinkQuery}
            placeholder="Search ticket number or title…"
          />
          {choices
            .filter(
              (s) =>
                s.id !== id &&
                (s.title + " " + s.ticketNumber)
                  .toLowerCase()
                  .includes(linkQuery.toLowerCase()) &&
                !bundle?.linked.some((l) => l.id === s.id),
            )
            .slice(0, 20)
            .map((s) => (
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
      {childId && (
        <TicketDialog
          id={childId}
          open
          onClose={() => setChildId(undefined)}
          onUpdated={() => void load()}
        />
      )}{" "}
      {entity && (
        <EntityDialog
          open
          onClose={() => setEntity(undefined)}
          module={entity.module}
          id={entity.id}
        />
      )}{" "}
      {localDetails && (
        <Modal
          open
          onClose={() => setLocalDetails(undefined)}
          title={localDetails.title}
          description="Context recorded on this ticket"
        >
          <DataTree data={localDetails.data} />
        </Modal>
      )}
    </>
  );
}

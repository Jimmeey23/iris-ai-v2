"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
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
  Wrench,
  FileText,
  MapPin,
  Mail,
  Phone,
  Briefcase,
  Crown,
  Dumbbell,
  AlertCircle,
  Repeat,
  Layers,
  MessageSquare,
  Sparkles,
  Zap,
  Hash,
  ArrowRight,
  type LucideIcon,
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
  Tabs,
} from "./ui";
import { ResolutionPanel, type ResolutionWorkspace } from "./resolution-panel";
import { SlaCountdown } from "./tickets-board";
import {
  SlaRing,
  PersonPhoto,
  SentimentArt,
  ActivityGlyph,
  CATEGORY_TONE,
} from "./ticket-art";
import { EntityDialog, DataTree } from "./momence-tools";
import { slaState } from "@/lib/utils";
import { indiaDate, object, display } from "@/lib/display";
import { STATUS_LABELS, type StaffRecord } from "@/lib/constants";
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
  asset: {id: number; name: string; assetTag: string | null; status: string; type: string; studio: string} | null;
  resolution: Resolution | null;
  steps: import("./resolution-panel").ResolutionStep[];
  followUps: import("./resolution-panel").FollowUp[];
  contacts: import("./resolution-panel").ContactEntry[];
  attachments: import("./resolution-panel").ResolutionAttachment[];
};

const FACT_ICONS: Record<string, LucideIcon> = {
  "Reported by": UserRound,
  Email: Mail,
  Phone: Phone,
  "Preferred contact": MessageSquare,
  "Community member": UserRound,
  "Member email": Mail,
  "Member phone": Phone,
  "Member follow-up preference": MessageSquare,
  "Studio Space": MapPin,
  "Signature Experience": Dumbbell,
  "Studio Instructor": UserRound,
  "Community access package": Crown,
  Studio: MapPin,
  "When it happened": CalendarDays,
  "Class or session": Dumbbell,
  Trainer: UserRound,
  Membership: Crown,
  "Asked for": Sparkles,
  Impact: AlertCircle,
};

function FactTile({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const Icon = FACT_ICONS[label] || Briefcase;
  return (
    <div className="td-fact-tile">
      <div className="td-fact-icon">
        <Icon size={16} />
      </div>
      <div className="td-fact-body">
        <dt>{label}</dt>
        <dd>{display(value ?? "")}</dd>
      </div>
    </div>
  );
}

const TABS = ["overview", "activity", "related"] as const;

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
    [tab, setTab] = useState<(typeof TABS)[number]>("overview"),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false),
    [linkQuery, setLinkQuery] = useState(""),
    [found, setFound] = useState<{ q: string; tickets: TicketListRecord[] }>({
      q: "",
      tickets: [],
    }),
    [childId, setChildId] = useState<number>(),
    [entity, setEntity] = useState<{
      module: "members" | "sessions";
      id: string;
    }>(),
    [localDetails, setLocalDetails] = useState<{
      title: string;
      data: unknown;
    }>(),
    [staff, setStaff] = useState<StaffRecord[]>([]);
  const load = useCallback(
    () =>
      api<Bundle>("/api/tickets/" + id).then(
        (d) => {
          setBundle(d);
          setError("");
        },
        (e: Error) => setError(e.message),
      ),
    [id],
  );
  // Reopening (or switching ticket) starts from a clean slate. Done while rendering,
  // not in an effect, so the stale bundle never paints for a frame.
  const shownKey = open ? String(id) : "";
  const [shownFor, setShownFor] = useState(shownKey);
  if (shownFor !== shownKey) {
    setShownFor(shownKey);
    if (open) {
      setBundle(undefined);
      setTab("overview");
    }
  }
  useEffect(() => {
    if (open) {
      void load();
      void api<{ staff: StaffRecord[] }>("/api/staff")
        .then((d) => setStaff(d.staff))
        .catch(() => {});
      const timer = setInterval(() => {
        if (!document.hidden) void load();
      }, 30000);
      // Skip the tick while the tab is hidden, then catch up with one fetch
      // the moment it becomes visible again rather than waiting out the interval.
      const onVisible = () => {
        if (!document.hidden) void load();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }
  }, [open, load]);
  // The picker searches server-side (`?q=` returns up to 20 matches) rather than
  // downloading the whole ticket list, debounced so typing doesn't fire a request a key.
  const linkTerm = linkQuery.trim();
  useEffect(() => {
    if (!linkOpen || !linkTerm) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      void api<{ tickets: TicketListRecord[] }>(
        "/api/tickets?q=" + encodeURIComponent(linkTerm),
        { signal: ctl.signal },
      )
        .then((d) => setFound({ q: linkTerm, tickets: d.tickets }))
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setFound({ q: linkTerm, tickets: [] });
          notify(e.message, "error");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [linkOpen, linkTerm, notify]);
  const searching = Boolean(linkTerm) && found.q !== linkTerm;
  const choices = (found.q === linkTerm ? found.tickets : []).filter(
    (s) => s.id !== id && !bundle?.linked.some((l) => l.id === s.id),
  );
  async function patch(p: Record<string, unknown>) {
    if (!bundle) return;
    setBusy(true);
    try {
      const d = await api<{
        followUpTickets?: { id: number; ticketNumber: string }[];
      }>("/api/tickets/" + id, {
        method: "PATCH",
        body: JSON.stringify({ ...p, version: bundle.ticket.version }),
      });
      await load();
      onUpdated?.();
      window.dispatchEvent(new Event("iris:tickets-updated"));
      if (d.followUpTickets?.length)
        notify(
          `Recurrence checks ${d.followUpTickets.map((f) => f.ticketNumber).join(" and ")} raised, due 5 and 10 days from today.`,
        );
      else notify("Ticket updated.");
    } catch (e) {
      notify((e as Error).message, "error");
      await load();
    } finally {
      setBusy(false);
    }
  }
  /** A private reminder to the one person who owns this. Deliberately quiet: a toast to the
   *  sender, an in-app notification to the owner, a line on the activity log, and nothing
   *  else — no email, no manager copied in. */
  const [nudging, setNudging] = useState(false);
  async function nudge() {
    if (!t) return;
    setNudging(true);
    try {
      const d = await api<{notified: string}>(`/api/tickets/${t.id}/nudge`, {method: 'POST', body: JSON.stringify({})});
      notify(`Nudged ${d.notified}. They will see it in the app.`);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not send the nudge', 'error');
    } finally {
      setNudging(false);
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
  const memberRelated = Boolean(t && (t.momenceMemberId || t.memberEmail || t.memberPhone || (t.memberName && !/studio team observation|internal report/i.test(t.memberName))));
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t ? t.title : "Ticket details"}
        description={
          t
            ? `${t.ticketNumber} · Logged ${indiaDate(t.createdAt)} by ${t.memberName}`
            : "Loading the latest ticket details"
        }
        size="wide"
        className="ticket-detail-dialog"
        footer={
          <>
            <span className="muted flex-row" style={{ fontSize: 10 }}>
              <ShieldCheck size={13} />
              Saved to your workspace · updates every 30s
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
                <div className="td-masthead-body">
                  <div className="td-identity-line">
                    <button
                      type="button"
                      className="td-ticket-key"
                      title="Copy ticket ID"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(t.ticketNumber)
                          .then(() => notify("Ticket ID copied."))
                          .catch(() => notify("Your browser blocked clipboard access.", "error"));
                      }}
                    >
                      {t.ticketNumber}
                      <Copy size={11} />
                    </button>
                    <span>{t.category} / {t.subcategory}</span>
                    <span className="td-rev">
                      Revision {t.version} · updated {indiaDate(t.updatedAt)}
                    </span>
                  </div>
                  <div className="td-title-row">
                    <div>
                      <h2 className="td-modal-title">{t.title}</h2>
                      <div className="td-created-meta">
                        <Clock3 size={12} />
                        <span>Logged {indiaDate(t.createdAt)}</span>
                        <i aria-hidden="true" />
                        <span>by {t.memberName}</span>
                      </div>
                    </div>
                    <div className="td-head-actions">
                      <button type="button" className="icon-btn" onClick={() => void load()} aria-label="Refresh ticket" title="Refresh ticket">
                        <RefreshCw size={16} />
                      </button>
                      <button type="button" className="icon-btn" disabled={busy} onClick={() => void duplicate()} aria-label="Duplicate ticket" title="Duplicate ticket">
                        <Copy size={16} />
                      </button>
                      {t.assignedStaffId ? (
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={nudging}
                          onClick={() => void nudge()}
                          aria-label={"Nudge " + (t.assignedStaffName || "the owner")}
                          title={"Nudge " + (t.assignedStaffName || "the owner") + " about this ticket"}
                        >
                          <BellRing size={16} />
                        </button>
                      ) : null}
                      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close ticket" title="Close ticket">
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                  <p className="td-summary td-summary-primary">{t.summary}</p>
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
              </header>
              <div className="td-tabs-row">
                <Tabs
                  className="grow"
                  label="Ticket sections"
                  variant="underline"
                  value={tab}
                  onChange={setTab}
                  items={TABS.map((s) => ({
                    id: s,
                    label: s[0].toUpperCase() + s.slice(1),
                    count:
                      s === "related"
                        ? bundle.linked.length + bundle.similar.length
                        : undefined,
                  }))}
                />
                <button
                  type="button"
                  className={"rail-toggle" + (railOpen ? " active" : "")}
                  onClick={() => setRailOpen((v) => !v)}
                  aria-expanded={railOpen}
                  title={
                    bundle.canResolve
                      ? undefined
                      : "Private to the assigned owner and their reporting manager"
                  }
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
                        <section className="td-case-file">
                          <header>
                            <span className="td-section-icon"><FileText size={17}/></span>
                            <div><span className="eyebrow">CASE BRIEF</span><h3>What happened</h3></div>
                          </header>
                          <p className="td-narrative">{t.description || t.summary}</p>
                          <div className="td-narrative-tags">
                            <span className="td-tag">{t.category}</span>
                            <span className="td-tag td-tag-sub">{t.subcategory}</span>
                            {t.impact && t.requestedResolution && <span className="td-tag td-tag-impact"><Zap size={11}/>{t.impact}</span>}
                          </div>
                        </section>

                        {(t.requestedResolution || t.impact) && (
                          <section className="td-outcome-card">
                            <span className="td-section-icon"><Sparkles size={16}/></span>
                            <div>
                              <span className="eyebrow">{t.requestedResolution ? "REQUESTED OUTCOME" : "REPORTED IMPACT"}</span>
                              <p>{t.requestedResolution || t.impact}</p>
                            </div>
                          </section>
                        )}

                        <section className="td-context-sheet">
                          <div className="td-section-head">
                            <div><span className="eyebrow">KNOWN CONTEXT</span><h3>People, place and moment</h3></div>
                            <Layers size={17}/>
                          </div>
                          <dl className="td-facts td-facts-grid">
                            {[
                              { k: "Community member", v: memberRelated ? t.memberName : null },
                              { k: "Member email", v: memberRelated ? t.memberEmail : null },
                              { k: "Member phone", v: memberRelated ? t.memberPhone : null },
                              { k: "Member follow-up preference", v: memberRelated ? t.preferredContact : null },
                              { k: "Studio Space", v: t.studio },
                              {
                                k: "When it happened",
                                v: t.incidentAt
                                  ? indiaDate(t.incidentAt)
                                  : null,
                              },
                              { k: "Signature Experience", v: t.classFormat },
                              { k: "Studio Instructor", v: t.trainer },
                              { k: "Community access package", v: memberRelated ? t.membership : null },
                              { k: "Asked for", v: t.requestedResolution },
                              { k: "Impact", v: t.impact },
                            ]
                              .filter((f) => f.v && f.k !== "Asked for")
                              .map((f) => (
                                <FactTile
                                  key={f.k}
                                  label={f.k}
                                  value={f.v}
                                />
                              ))}
                          </dl>
                        </section>

                        <details className="td-block td-similar-details">
                          <summary>
                            <span className="td-section-icon td-section-icon-purple"><Repeat size={18} /></span>
                            <span><strong>Similar tickets</strong><small>Same category and subcategory</small></span>
                            <Badge>{bundle.similar.length}</Badge>
                            <ChevronRight size={15} className="td-details-chevron"/>
                          </summary>
                          <p className="td-block-note">
                            Same category and subcategory.
                          </p>
                          <div className="td-similar-list">
                            {bundle.similar.map((s) => (
                              <button
                                className="td-similar-card"
                                key={s.id}
                                onClick={() => setChildId(s.id)}
                              >
                                <div className="td-similar-meta">
                                  <Hash size={11} />
                                  <span>{s.ticketNumber}</span>
                                </div>
                                <p>{s.title}</p>
                                <div className="between">
                                  <span
                                    className={
                                      "td-similar-status " +
                                      (s.status === "open"
                                        ? "open"
                                        : s.status === "resolved"
                                          ? "resolved"
                                          : "closed")
                                    }
                                  >
                                    {s.status}
                                  </span>
                                  <ChevronRight size={14} />
                                </div>
                              </button>
                            ))}
                            {!bundle.similar.length && (
                              <p className="td-empty-line">
                                This is the first ticket of its kind.
                              </p>
                            )}
                          </div>
                        </details>
                      </div>
                      <aside className="td-aside" aria-label="Ticket controls and linked context">
                        <div
                          className="td-resolution-summary"
                          data-sla={
                            !t.resolutionRequired || !t.slaDueAt
                              ? "none"
                              : ["resolved", "closed"].includes(t.status)
                                ? "done"
                                : slaState(t.slaDueAt, t.status, t.createdAt)
                          }
                        >
                          <div className="td-rail-heading"><CheckCircle2 size={14}/><span>RESOLUTION</span></div>
                          <div className="td-resolution-instrument">
                            <SlaRing
                              createdAt={t.createdAt}
                              slaDueAt={t.slaDueAt}
                              status={t.status}
                              size={108}
                            />
                            <div className="td-resolution-copy">
                              <strong>{["resolved", "closed"].includes(t.status) ? "Complete" : "In progress"}</strong>
                              <span>Follow-up window</span>
                              <SlaCountdown ticket={t as never} large />
                              <small>{t.slaDueAt ? "Due " + indiaDate(t.slaDueAt) : "No follow-up deadline"}</small>
                            </div>
                          </div>
                        </div>
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
                            {bundle.canResolve
                              ? "Status changes live in the resolution panel."
                              : t.resolutionRequired
                                ? "Only the assigned owner or their reporting manager can change status or resolve this ticket."
                                : "This ticket is a record only. There is nothing to resolve."}
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
                                    tone="dark"
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
                          {/* Which piece of equipment, and what state it is in. The register
                              holds every fault ever logged against it. */}
                          {t.assetId ? (
                            <a
                              className="related-ticket"
                              href={
                                "/equipment?studio=" + encodeURIComponent(t.studio || "") + "&asset=" + t.assetId
                              }
                            >
                              <div className="flex-row">
                                <Wrench size={15} />
                                <div>
                                  <p>
                                    {bundle.asset?.name || String(object(t.customFields).assetName || "Equipment")}
                                  </p>
                                  <small>
                                    Asset #{t.assetId} · {bundle.asset?.assetTag || `P57-EQ-${String(t.assetId).padStart(5, "0")}`} ·{" "}
                                    {String(
                                      bundle.asset?.status || object(t.customFields).assetStatus ||
                                        "in-service",
                                    ).replace(/-/g, " ")}
                                  </small>
                                </div>
                              </div>
                              <ArrowUpRight size={13} />
                            </a>
                          ) : null}
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
                            onClick={() => setChildId(s.id)}
                            className="text-btn grow"
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
                      attachments: bundle.attachments,
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

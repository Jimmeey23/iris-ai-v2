"use client";
import { indiaDate } from "@/lib/display";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Layers,
  Link2,
  LockKeyhole,
  MapPin,
  Pencil,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { DataTree, EntityDialog } from "./momence-tools";
import { ResolutionPanel, type ResolutionWorkspace } from "./resolution-panel";
import { CATEGORY_TONE } from "./ticket-art";
import { TicketDialog } from "./ticket-detail";
import type { useTicketDialogController } from "./ticket-detail-controller";
import styles from "./ticket-detail.module.css";
import { RecurrenceBanner } from "./ticket-detail/ownership";
import { SlaCountdown } from "./tickets-board";
import { Avatar, Badge, Loading, Modal, Priority, Status, Tabs } from "./ui";

/** How a ticket with no workspace author reached IRIS, for the "Reported by" slot. */
function reportedVia(source?: string | null) {
  return (
    (
      {
        fillout: "Via an intake form",
        history: "History import",
        system: "IRIS automation",
        voice: "Via voice intake",
        iris: "Via IRIS chat",
        template: "Via a template",
      } as Record<string, string>
    )[source || ""] || "Outside the workspace"
  );
}

const TABS = ["overview", "activity", "related"] as const;
const TicketOverviewPanel = dynamic(() => import("./ticket-detail-overview"), {
  loading: () => <p role="status">Loading overview…</p>,
});
const TicketActivityPanel = dynamic(() => import("./ticket-detail-activity"), {
  loading: () => <p role="status">Loading activity…</p>,
});
const TicketRelatedPanel = dynamic(() => import("./ticket-detail-related"), {
  loading: () => <p role="status">Loading related…</p>,
});
const LazySidebarPanel = dynamic(() => import("./ticket-detail-sidebar"));
function SidebarPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  return <LazySidebarPanel model={model} />;
}
const LazyEditDialogPanel = dynamic(
  () => import("./ticket-detail-edit-dialog"),
);
function EditDialogPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  return model.editOpen ? <LazyEditDialogPanel model={model} /> : null;
}
const LazyDeleteDialogPanel = dynamic(
  () => import("./ticket-detail-delete-dialog"),
);
function DeleteDialogPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  return model.deleteOpen ? <LazyDeleteDialogPanel model={model} /> : null;
}
const LazyLinkDialogPanel = dynamic(
  () => import("./ticket-detail-link-dialog"),
);
function LinkDialogPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  return model.linkOpen ? <LazyLinkDialogPanel model={model} /> : null;
}
export function TicketDialogView({
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
    setDeleteConfirmation,
    setDeleteOpen,
    error,
    bundle,
    settled,
    notify,
    openEditor,
    load,
    duplicate,
    nudging,
    nudge,
    recurrenceCount,
    setChildId,
    coOwners,
    tab,
    setTab,
    id,
    railOpen,
    resolutionToggle,
    setRailOpen,
    mentionPeople,
    note,
    setNote,
    setMentioned,
    addNote,
    setLinkOpen,
    link,
    extendOpen,
    extendHours,
    setExtendHours,
    extendReason,
    setExtendReason,
    setExtendOpen,
    extendSla,
    patch,
    staff,
    canManage,
    setEntity,
    setLocalDetails,
    resolutionRegion,
    closeResolution,
    setBundle,
    editOpen,
    setEditOpen,
    edit,
    saveEdit,
    setEdit,
    deleteOpen,
    deleteConfirmation,
    deleteTicket,
    linkOpen,
    linkQuery,
    setLinkQuery,
    linkTerm,
    searching,
    choices,
    childId,
    onUpdated,
    entity,
    localDetails,
  } = model;
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t ? t.title : "Ticket details"}
        description={
          t
            ? `${t.ticketNumber} · Logged ${indiaDate(t.createdAt)}${t.createdByName ? ` · reported by ${t.createdByName}` : ""}`
            : "Loading the latest ticket details"
        }
        size="wide"
        className={"ticket-detail-dialog " + styles.dialog}
        footer={
          <>
            <span className="muted flex-row" style={{ fontSize: 10 }}>
              <ShieldCheck size={13} />
              Saved to your workspace · refreshes automatically
            </span>
            <div className="flex-row">
              {/* Edit, refresh and duplicate live in the header beside the title; the footer
                  keeps only what is not there. */}
              {user?.role === "admin" && (
                <button
                  className="btn btn-danger"
                  disabled={busy || !t}
                  onClick={() => {
                    setDeleteConfirmation("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
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
          <div className={"ticket-detail-shell " + styles.shell}>
            <div className={styles.frame}>
              <header
                className={"td-masthead td-hero " + styles.hero}
                data-tone={CATEGORY_TONE[t.category] || "accent"}
                data-settled={settled ? t.status : undefined}
              >
                <div className="td-masthead-body">
                  <div className="td-hero-top">
                    <div className="td-identity-line">
                      <button
                        type="button"
                        className="td-ticket-key"
                        title="Copy ticket ID"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(t.ticketNumber)
                            .then(() => notify("Ticket ID copied."))
                            .catch(() =>
                              notify(
                                "Your browser blocked clipboard access.",
                                "error",
                              ),
                            );
                        }}
                      >
                        {t.ticketNumber}
                        <Copy size={11} />
                      </button>
                      <span className="td-crumb">
                        {t.category}
                        <ChevronRight size={12} aria-hidden="true" />
                        <strong>{t.subcategory}</strong>
                      </span>
                    </div>
                    <div className="td-head-actions">
                      {/* Editing used to be a plain button in the dialog footer, below the fold
                          of a long ticket and admin-only, so the person who filed the ticket
                          could neither find it nor use it. It belongs beside the title they
                          would be correcting, labelled, and offered to whoever may actually
                          save it — see `canEditDetails`. */}
                      {bundle.canEditDetails && (
                        <button
                          type="button"
                          className="btn btn-sm td-edit-btn"
                          disabled={busy}
                          onClick={openEditor}
                          title={
                            user?.role === "admin"
                              ? "Edit the ticket's details"
                              : "Edit the details you filed"
                          }
                        >
                          <Pencil size={13} />
                          Edit details
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => void load()}
                        aria-label="Refresh ticket"
                        title="Refresh ticket"
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={busy}
                        onClick={() => void duplicate()}
                        aria-label="Duplicate ticket"
                        title="Duplicate ticket"
                      >
                        <Copy size={16} />
                      </button>
                      {t.assignedStaffId ? (
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={nudging}
                          onClick={() => void nudge()}
                          aria-label={
                            "Nudge " + (t.assignedStaffName || "the owner")
                          }
                          title={
                            "Nudge " +
                            (t.assignedStaffName || "the owner") +
                            " about this ticket"
                          }
                        >
                          <BellRing size={16} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={onClose}
                        aria-label="Close ticket"
                        title="Close ticket"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                  {settled && (
                    <p className={styles.settled} role="status">
                      <CheckCircle2 size={15} aria-hidden="true" />
                      <strong>
                        {t.status === "closed" ? "Closed" : "Resolved"}
                      </strong>
                      <span>
                        {t.status === "closed" && t.closedAt
                          ? "on " + indiaDate(t.closedAt)
                          : t.resolvedAt
                            ? "on " + indiaDate(t.resolvedAt)
                            : "This ticket is settled."}
                      </span>
                    </p>
                  )}
                  <h2 className="td-modal-title">{t.title}</h2>
                  <div className="td-chips">
                    <Status status={t.status} />
                    <Priority priority={t.priority} />
                    {t.departmentName && (
                      <Badge tone="blue">{t.departmentName}</Badge>
                    )}
                    <Badge>{t.kind}</Badge>
                    {!t.resolutionRequired && (
                      <Badge tone="green">Record only</Badge>
                    )}
                    {t.isEscalated && <Badge tone="red">Escalated</Badge>}
                    {recurrenceCount >= 2 && (
                      <Badge tone="purple">
                        <Repeat size={11} aria-hidden="true" /> Reported{" "}
                        {recurrenceCount} times
                      </Badge>
                    )}
                    {t.committedResolutionAt && !settled && (
                      <Badge tone="green">
                        <CalendarDays size={11} aria-hidden="true" /> Committed
                        by {indiaDate(t.committedResolutionAt, true)}
                      </Badge>
                    )}
                  </div>
                  <RecurrenceBanner ticket={t} onOpen={setChildId} />
                  {t.summary && t.summary !== t.title && (
                    <p className="td-summary td-summary-primary">{t.summary}</p>
                  )}
                  {/* Who is involved, at a glance. "Reported by" leads: it is the person to go
                      back to with a question, and it used to be the smallest text on the screen,
                      easily read as the member's name. */}
                  <dl className="td-people" aria-label="People and place">
                    <div className="td-person td-person-reporter">
                      <dt>Reported by</dt>
                      <dd>
                        {t.createdByName ? (
                          <Avatar name={t.createdByName} showPresence />
                        ) : (
                          <span className="td-person-glyph">
                            <Layers size={14} />
                          </span>
                        )}
                        <span>
                          <strong>
                            {t.createdByName || reportedVia(t.source)}
                          </strong>
                          <small>Filed {indiaDate(t.createdAt)}</small>
                        </span>
                      </dd>
                    </div>
                    <div className="td-person">
                      <dt>Member</dt>
                      <dd>
                        <span className="td-person-glyph">
                          <UserRound size={14} />
                        </span>
                        <span>
                          <strong>{t.memberName || "Not recorded"}</strong>
                          {t.membership && <small>{t.membership}</small>}
                        </span>
                      </dd>
                    </div>
                    <div className="td-person">
                      <dt>
                        {coOwners.length
                          ? `Owners · ${coOwners.length + 1}`
                          : "Owner"}
                      </dt>
                      <dd>
                        {t.assignedStaffName ? (
                          <Avatar name={t.assignedStaffName} owner />
                        ) : (
                          <span className="td-person-glyph">
                            <UserRound size={14} />
                          </span>
                        )}
                        <span>
                          <strong>{t.assignedStaffName || "Unassigned"}</strong>
                          {coOwners.length ? (
                            <small
                              title={coOwners.map((o) => o.name).join(", ")}
                            >
                              with {coOwners.map((o) => o.name).join(", ")}
                            </small>
                          ) : (
                            t.departmentName && (
                              <small>{t.departmentName}</small>
                            )
                          )}
                        </span>
                      </dd>
                    </div>
                    <div className="td-person">
                      <dt>Studio</dt>
                      <dd>
                        <span className="td-person-glyph">
                          <MapPin size={14} />
                        </span>
                        <span>
                          <strong>{t.studio || "Not specified"}</strong>
                          {typeof t.customFields?.area === "string" &&
                            t.customFields.area && (
                              <small>{t.customFields.area}</small>
                            )}
                        </span>
                      </dd>
                    </div>
                    <div className="td-person td-person-due">
                      <dt>
                        {t.resolutionRequired ? "Follow-up target" : "Record"}
                      </dt>
                      <dd>
                        <span className="td-person-glyph">
                          <Clock3 size={14} />
                        </span>
                        <span>
                          {t.resolutionRequired && t.slaDueAt ? (
                            <>
                              <SlaCountdown ticket={t as never} />
                              <small>
                                {t.committedResolutionAt
                                  ? "Committed " +
                                    indiaDate(t.committedResolutionAt)
                                  : indiaDate(t.slaDueAt)}
                              </small>
                            </>
                          ) : (
                            <strong>
                              {t.resolutionRequired
                                ? "No target set"
                                : "Nothing to chase"}
                            </strong>
                          )}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="td-hero-meta">
                    <span>
                      Revision {t.version} · updated {indiaDate(t.updatedAt)}
                    </span>
                    {/* Which is also the answer to "why can I not edit this?". A ticket that
                        arrived by email or from a form has no author in the workspace. */}
                    {!bundle.canEditDetails && (
                      <span
                        className="td-noedit"
                        title={
                          t.createdByName
                            ? `Only ${t.createdByName} or an administrator can edit these details.`
                            : "This ticket arrived from outside the workspace, so it has no author. An administrator can edit it."
                        }
                      >
                        <LockKeyhole size={11} />
                        {t.createdByName
                          ? "Editable by " + t.createdByName
                          : "No author on file"}
                      </span>
                    )}
                  </p>
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
                  ref={resolutionToggle}
                  onClick={() => {
                    setTab("overview");
                    setRailOpen((v) => !v);
                  }}
                  aria-expanded={railOpen}
                  aria-controls={"ticket-resolution-" + id}
                  title={
                    bundle.canResolve
                      ? undefined
                      : "Visible to everyone with ticket access; editable by the owner and reporting manager"
                  }
                >
                  <FileText size={12} />
                  {railOpen ? "Hide resolution" : "Open resolution"}
                  {bundle.steps.length +
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
                className={styles.workspace}
                data-split={railOpen || tab === "overview" ? "true" : "false"}
                data-resolution={railOpen ? "open" : "closed"}
                data-section={tab}
                aria-label="Ticket workspace"
              >
                <div className={styles.main}>
                  {tab === "overview" && <TicketOverviewPanel model={model} />}
                  {tab === "activity" && <TicketActivityPanel model={model} />}

                  {tab === "related" && <TicketRelatedPanel model={model} />}
                </div>
                {tab === "overview" && !railOpen && (
                  <SidebarPanel model={model} />
                )}
                {railOpen && (
                  <div
                    className={styles.resolution}
                    id={"ticket-resolution-" + id}
                    ref={resolutionRegion}
                    role="region"
                    aria-label="Resolution workspace"
                    tabIndex={-1}
                  >
                    <ResolutionPanel
                      key={t.id}
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
                      onClose={closeResolution}
                      onChanged={(w: ResolutionWorkspace) =>
                        setBundle((b) => (b ? { ...b, ...w } : b))
                      }
                      onPatch={async (pp) => {
                        await patch(pp);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
      {t && bundle?.canEditDetails && <EditDialogPanel model={model} />}
      {t && user?.role === "admin" && <DeleteDialogPanel model={model} />}
      <LinkDialogPanel model={model} />
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

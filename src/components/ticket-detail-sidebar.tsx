"use client";
import { indiaDate, object } from "@/lib/display";
import { slaState } from "@/lib/utils";
import {
  ArrowUpRight,
  BookmarkCheck,
  CheckCircle2,
  Clock3,
  Wrench,
} from "lucide-react";
import { PersonPhoto, SentimentArt, SlaRing } from "./ticket-art";
import type { useTicketDialogController } from "./ticket-detail-controller";
import { CommitmentPanel, OwnersPanel } from "./ticket-detail/ownership";
import { SlaCountdown } from "./tickets-board";
import { Field } from "./ui";
export default function SidebarPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const {
    t,
    user,
    busy,
    bundle,
    id,
    note,
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
  } = model;
  if (!t) return null;
  if (!bundle) return null;
  return (
    <aside className="td-aside" aria-label="Ticket controls and linked context">
      <div
        className="td-resolution-summary"
        data-sla={
          !t.resolutionRequired || !t.slaDueAt
            ? "none"
            : ["resolved", "closed"].includes(t.status)
              ? (t.resolvedAt&&t.slaDueAt&&new Date(t.resolvedAt)>new Date(t.slaDueAt)?"breached":"done")
              : slaState(t.slaDueAt, t.status, t.createdAt)
        }
      >
        <div className="td-rail-heading">
          <CheckCircle2 size={14} />
          <span>{t.resolutionRequired ? "RESOLUTION" : "RECORD STATUS"}</span>
        </div>
        {!t.resolutionRequired || t.status === "recorded" ? (
          <div className="td-resolution-instrument td-record-only-instrument">
            <div
              className="td-record-pill-badge"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: "50%",
                background:
                  "color-mix(in srgb, var(--green, #10b981) 15%, transparent)",
                color: "var(--green, #10b981)",
              }}
            >
              <BookmarkCheck size={22} />
            </div>
            <div className="td-resolution-copy">
              <strong>
                {t.status === "closed" ? "Closed Record" : "Recorded"}
              </strong>
              <span>Recorded for reference</span>
              <small>No SLA or resolution target required</small>
            </div>
          </div>
        ) : (
          <div className="td-resolution-instrument">
            <SlaRing
              createdAt={t.createdAt}
              slaDueAt={t.slaDueAt}
              status={t.status}
              resolvedAt={t.resolvedAt}
              size={108}
            />
            <div className="td-resolution-copy">
              <strong>
                {["resolved", "closed"].includes(t.status)
                  ? (t.resolvedAt&&t.slaDueAt&&new Date(t.resolvedAt)>new Date(t.slaDueAt)?"Resolved after target":"Resolved within target")
                  : "In progress"}
              </strong>
              <span>Resolution target</span>
              <SlaCountdown ticket={t as never} large />
              <small>
                {t.slaDueAt
                  ? "Due " + indiaDate(t.slaDueAt)
                  : "No follow-up deadline"}
              </small>
            </div>
          </div>
        )}
        {bundle.canResolve &&
          t.resolutionRequired &&
          !!t.slaDueAt &&
          !["resolved", "closed", "recorded"].includes(t.status) &&
          !t.slaExtendedAt &&
          (extendOpen ? (
            <div className="td-sla-extend-form">
              <label>
                More time
                <select
                  value={extendHours}
                  disabled={busy}
                  onChange={(e) => setExtendHours(Number(e.target.value))}
                >
                  {[4, 8, 24, 48, 72].map((h) => (
                    <option key={h} value={h}>
                      {h} hours
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                rows={2}
                value={extendReason}
                disabled={busy}
                placeholder="What is holding this up? Everyone on the ticket sees this."
                onChange={(e) => setExtendReason(e.target.value)}
              />
              <div className="td-sla-extend-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => setExtendOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || extendReason.trim().length < 10}
                  onClick={() => void extendSla()}
                >
                  Move the target
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="td-sla-extend"
              disabled={busy}
              onClick={() => setExtendOpen(true)}
            >
              <Clock3 size={13} aria-hidden="true" />
              Need more time — once
            </button>
          ))}
      </div>
      <CommitmentPanel
        ticket={t}
        canEdit={bundle.canResolve}
        busy={busy}
        onPatch={patch}
      />
      <div className="td-panel">
        <h3>Routing</h3>
        <div className="detail-fields">
          <Field label="Action required">
            {user?.role === "admin" ? (
              <select
                disabled={busy}
                value={t.resolutionRequired ? "required" : "record_only"}
                onChange={(e) =>
                  void patch({
                    resolutionRequired: e.target.value === "required",
                  })
                }
              >
                <option value="required">Requires resolution</option>
                <option value="record_only">Record only</option>
              </select>
            ) : (
              <select
                disabled
                value={t.resolutionRequired ? "required" : "record_only"}
              >
                <option value="required">Requires resolution</option>
                <option value="record_only">Record only</option>
              </select>
            )}
          </Field>
          <Field label="Priority">
            <select
              disabled={busy || !t.resolutionRequired}
              value={t.priority}
              onChange={(e) => void patch({ priority: e.target.value })}
            >
              {["critical", "high", "medium", "low"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned owner">
            <select
              disabled={busy}
              value={t.assignedStaffId ?? ""}
              onChange={(e) =>
                void patch({
                  assignedStaffId: Number(e.target.value),
                  ...(user?.role==='admin'?{assignmentReason:window.prompt('Reason for this assignment (required for a coverage or department exception):')||undefined}:{}),
                })
              }
            >
              {staff
                .filter((p) => p.isActive && (p.department===t.departmentName || user?.role==='admin'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <button
            className="btn btn-sm"
            disabled={busy || t.isEscalated || !t.resolutionRequired}
            onClick={() => void patch({ isEscalated: true })}
            title={
              !t.resolutionRequired
                ? "Informational records cannot be escalated"
                : undefined
            }
          >
            {t.isEscalated ? "Escalated" : "Escalate for review"}
          </button>
        </div>
        {!t.resolutionRequired && (
          <div
            className="td-record-status-bar"
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "12px",
              flexWrap: "wrap",
            }}
          >
            {t.status !== "recorded" && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => void patch({ status: "recorded" })}
              >
                Mark as Recorded
              </button>
            )}
            {t.status !== "closed" && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={busy}
                onClick={() => void patch({ status: "closed" })}
              >
                Close Record
              </button>
            )}
            {t.status === "closed" && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={busy}
                onClick={() => void patch({ status: "recorded" })}
              >
                Re-open as Recorded
              </button>
            )}
          </div>
        )}
        <p className="td-panel-note">
          {bundle.canResolve
            ? "Status changes live in the resolution panel."
            : t.resolutionRequired
              ? "Only the assigned owner or their reporting manager can change status or resolve this ticket."
              : "This ticket is a record only. Use the record actions above to update its status."}
        </p>
      </div>
      <OwnersPanel
        ticket={t}
        staff={staff}
        canEdit={canManage}
        busy={busy}
        onPatch={patch}
      />
      <div className="td-panel">
        <h3>People</h3>
        <button
          className="related-ticket"
          onClick={() =>
            t.momenceMemberId && object(t.momenceContext).source !== "demo"
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
                      object(t.momenceContext).source === "demo"
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
                {t.momenceMemberId ? "Momence member" : "Ticket contact"}
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
              object(t.customFields.sessionContext).source !== "demo"
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
                        object(t.customFields.sessionContext).source === "demo"
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
              "/equipment?studio=" +
              encodeURIComponent(t.studio || "") +
              "&asset=" +
              t.assetId
            }
          >
            <div className="flex-row">
              <Wrench size={15} />
              <div>
                <p>
                  {bundle.asset?.name ||
                    String(object(t.customFields).assetName || "Equipment")}
                </p>
                <small>
                  Asset #{t.assetId} ·{" "}
                  {bundle.asset?.assetTag ||
                    `P57-EQ-${String(t.assetId).padStart(5, "0")}`}{" "}
                  ·{" "}
                  {String(
                    bundle.asset?.status ||
                      object(t.customFields).assetStatus ||
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
        <h3>Member’s expressed sentiment</h3>
        <SentimentArt sentiment={t.sentiment || "unknown"} />
      </div>
    </aside>
  );
}

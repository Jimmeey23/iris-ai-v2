"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./ui";
import { DEPARTMENT_RECORDS, type StaffRecord } from "@/lib/constants";
import { escalationPreview, reportingManagerName } from "@/lib/escalation-matrix";
import { api } from "@/components/ui";
import type { WorkspaceConfig } from "@/lib/settings-contract";

type TicketLike = {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  departmentId?: string | null;
  departmentName?: string | null;
  assignedStaffId?: number | null;
  assignedStaffName?: string | null;
  assignedStaffEmail?: string | null;
  additionalOwners?: Array<{ id: number; name: string; email?: string | null }>;
  isEscalated?: boolean;
  escalatedToName?: string | null;
  escalatedAt?: string | null;
  slaDueAt?: string | null;
  resolutionRequired?: boolean;
  slaExtendedHours?: number;
};

function computeSla(t: TicketLike) {
  if (!t.slaDueAt || t.resolutionRequired === false) return { tone: "none" as const, detail: "No target" };
  const now = Date.now();
  const due = new Date(t.slaDueAt).getTime();
  const diff = due - now;
  if (["resolved", "closed", "recorded"].includes(t.status)) return { tone: "done" as const, detail: "Resolved" };
  if (diff < 0) return { tone: "breached" as const, detail: `${Math.abs(Math.ceil(diff / 3600000))}h overdue` };
  if (diff < 4 * 3600000) return { tone: "soon" as const, detail: `${Math.ceil(diff / 60000)}m left` };
  return { tone: "ok" as const, detail: `${Math.ceil(diff / 3600000)}h left` };
}

function StaffGlyph({ id, name, email, size }: { id?: number | null; name?: string | null; email?: string | null; size?: "sm" | "md" }) {
  if (id || email || name) return <Avatar id={id ?? undefined} email={email ?? undefined} name={name ?? undefined} size={size === "sm" ? "sm" : undefined} />;
  return (
    <span className="td-person-glyph" aria-hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  );
}

export function TicketAccountabilityStrip({
  ticket,
  staff,
  config,
}: {
  ticket: TicketLike;
  staff: StaffRecord[];
  config?: WorkspaceConfig | null;
}) {
  const dept = DEPARTMENT_RECORDS.find((d) => d.id === ticket.departmentId) ?? null;
  const sla = computeSla(ticket);
  const reporting = reportingManagerName(ticket.assignedStaffId ?? null, staff as StaffRecord[]);
  const rmStaff = reporting.id ? staff.find((s) => s.id === reporting.id) : null;
  const escalationActive = Boolean(ticket.isEscalated);
  const preview = config ? escalationPreview(ticket as never, staff as StaffRecord[], config) : null;
  const deptFallbackId = dept ? ((config as unknown as { escalationOwnerIds?: Record<string, number> })?.escalationOwnerIds?.[dept.id] ?? null) : null;
  const deptFallback = deptFallbackId ? staff.find((s) => s.id === deptFallbackId) : null;
  const co = ticket.additionalOwners ?? [];
  const showCo = co.length > 0;

  return (
    <section aria-label="Accountability" className="td-accountability" data-settled={ticket.status === "resolved" || ticket.status === "closed" ? "" : undefined}>
      <div className="td-acc-row td-acc-row--primary">
        <div className="td-acc-cell td-acc-dept">
          <span className="td-acc-kicker">Responsible department</span>
          <span className="td-acc-value td-acc-dept-value">
            <span
              className="badge"
              style={{
                background: dept ? "var(--accent-soft)" : "var(--surface-2)",
                color: dept ? "var(--accent-deep)" : "var(--muted)",
                borderColor: dept ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--border)",
                fontWeight: 600,
              }}
              title={deptFallback ? `Escalation fallback: ${deptFallback.name}` : undefined}
            >
              {dept?.name ?? ticket.departmentName ?? "Unassigned"}
            </span>
            {deptFallback ? (
              <span className="td-acc-note" title={`Fallback owner for ${dept?.name}: ${deptFallback.name}`}>
                fallback {deptFallback.name}
              </span>
            ) : null}
          </span>
        </div>

        <div className="td-acc-cell td-acc-owner">
          <span className="td-acc-kicker">Lead owner</span>
          <span className="td-acc-value td-acc-person">
            <StaffGlyph id={ticket.assignedStaffId} name={ticket.assignedStaffName} email={ticket.assignedStaffEmail ?? undefined} size="sm" />
            <span className="td-acc-person-text">
              <strong>{ticket.assignedStaffName ?? "Unassigned — department queue"}</strong>
              <small>
                {ticket.assignedStaffName ? (ticket.assignedStaffEmail ?? "—") : dept ? `No eligible cover for ${dept.name} at this studio` : "No owner"}
                {ticket.isEscalated ? " · escalated" : ""}
              </small>
            </span>
            {ticket.assignedStaffName ? (
              <span className="td-acc-pill td-acc-pill--lead" title="Lead owner — escalation goes via their reporting manager first">
                Lead
              </span>
            ) : null}
          </span>
        </div>

        <div className="td-acc-cell td-acc-manager">
          <span className="td-acc-kicker">Reporting manager</span>
          <span className="td-acc-value td-acc-person">
            {reporting.name ? (
              <>
                <StaffGlyph id={reporting.id} name={reporting.name} email={rmStaff?.email ?? undefined} size="sm" />
                <span className="td-acc-person-text">
                  <strong>{reporting.name}</strong>
                  <small>{rmStaff?.email ?? reporting.note}</small>
                </span>
                <span className="td-acc-pill" title={reporting.note}>
                  Reports to
                </span>
              </>
            ) : (
              <>
                <StaffGlyph size="sm" />
                <span className="td-acc-person-text">
                  <strong className="td-acc-muted">No reporting manager on file</strong>
                  <small>{reporting.note}</small>
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="td-acc-row td-acc-row--secondary">
        <div className="td-acc-cell td-acc-escalation" data-tone={escalationActive ? "red" : preview?.active ? "amber" : "muted"}>
          <span className="td-acc-kicker">{escalationActive ? "Escalated" : config?.escalateAfterBreachHours === 0 ? "Escalation" : "If past target"}</span>
          <span className="td-acc-value td-acc-escalation-value">
            {escalationActive ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 9v4M12 16h.01M10.3 3.3 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
                </svg>
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>
                    Escalated to {ticket.escalatedToName ?? "—"}
                    {ticket.escalatedAt ? ` · ${new Date(ticket.escalatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                  </strong>
                  <small>Priority raised to critical</small>
                </span>
              </>
            ) : preview?.active ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
                </svg>
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>{preview.label}</strong>
                  <small>{preview.target.via === "manager" ? `via ${preview.target.name} (${preview.target.reason})` : preview.target.reason}</small>
                </span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
                  <path d="M9 12h6M12 9v6" />
                </svg>
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>{preview?.label ?? (config?.escalateAfterBreachHours === 0 ? "Escalation off" : "No escalation due")}</strong>
                  <small>
                    {config?.escalateAfterBreachHours === 0
                      ? "Turned on in Settings → Board → “Escalate after a missed target”"
                      : preview?.target.reason ?? "—"}
                  </small>
                </span>
              </>
            )}
          </span>
        </div>

        <div className="td-acc-cell td-acc-sla" data-tone={sla.tone === "breached" ? "red" : sla.tone === "soon" ? "amber" : sla.tone === "done" ? "green" : "muted"}>
          <span className="td-acc-kicker">Follow-up target</span>
          <span className="td-acc-value td-acc-sla-value">
            {ticket.slaDueAt ? (
              <>
                <strong style={{ color: sla.tone === "breached" ? "var(--red)" : sla.tone === "soon" ? "var(--amber)" : "var(--text)" }}>
                  {new Date(ticket.slaDueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </strong>
                <small>
                  {sla.detail} {sla.tone === "breached" ? "· past target" : sla.tone === "soon" ? "· due soon" : ""}
                  {ticket.slaExtendedHours ? ` · +${ticket.slaExtendedHours}h extended` : ""}
                </small>
              </>
            ) : (
              <>
                <strong>No target</strong>
                <small>Record-only ticket — no SLA or escalation</small>
              </>
            )}
          </span>
        </div>

        <div className="td-acc-cell td-acc-coowners">
          <span className="td-acc-kicker">Co-owners</span>
          <span className="td-acc-value td-acc-coowners-value">
            {showCo ? (
              <span className="td-acc-avatars" aria-label={`${co.length} co-owners`}>
                {co.slice(0, 6).map((o) => (
                  <Avatar key={o.id} id={o.id} name={o.name} email={o.email ?? undefined} size="sm" />
                ))}
                {co.length > 6 ? <span className="td-acc-more">+{co.length - 6}</span> : null}
              </span>
            ) : (
              <span className="td-acc-muted" style={{ fontSize: 12 }}>No co-owners — “@” teammates in a resolution note to add them</span>
            )}
            {showCo ? <small>{co.map((o) => o.name).join(", ")}</small> : null}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Wrapper that loads workspace config once and renders the strip. */
export function TicketAccountabilitySection({ ticket, staff }: { ticket: TicketLike; staff: StaffRecord[] }) {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  useEffect(() => {
    let alive = true;
    // Public config is enough for the accountability strip — escalation matrix, breach hours.
    api<{ escalateAfterBreachHours: number; escalationOwnerIds: Record<string, number> }>("/api/settings?scope=public")
      .then((d) => {
        if (alive) setConfig(d as unknown as WorkspaceConfig);
      })
      .catch(() => {
        // Fallback: try admin endpoint when signed in as one (more fields, same shape)
        api<{ config: WorkspaceConfig }>("/api/settings")
          .then((d) => { if (alive) setConfig(d.config); })
          .catch(() => {});
      });
    return () => { alive = false; };
  }, []);
  return <TicketAccountabilityStrip ticket={ticket} staff={staff} config={config} />;
}

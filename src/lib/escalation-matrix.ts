import { DEPARTMENT_RECORDS } from "./constants";
import type { StaffRecord } from "./constants";
import { reportingManagerId } from "./reporting-line";
import type { TicketListRecord, TicketRecord } from "./ticket-contract";
import type { WorkspaceConfig } from "./settings-contract";

/**
 * Centralised description of the one escalation rule.
 *
 * The server enforces this in lib/tickets.ts → applyEscalations().
 * This module is what the UI reads so the same words appear everywhere:
 * the ticket header, the board column, the settings page and the docs.
 */

export type EscalationTarget = {
  /** Resolved staff id, or null when neither manager nor fallback resolves. */
  id: number | null;
  name: string | null;
  /** How we got there. */
  via: "manager" | "department" | "none";
  /** Why, in one sentence. */
  reason: string;
};

export type EscalationRuleSummary = {
  /** Hours past slaDueAt before the sweep fires. 0 = off. */
  afterHours: number;
  enabled: boolean;
  /** What happens. */
  action: string;
  /** Per-department fallback owners, resolved to names for display. */
  fallbacks: Array<{ departmentId: string; departmentName: string; ownerName: string | null; ownerId: number | null }>;
};

/** Human sentence for the top of a ticket or a settings card. */
export function escalationRuleSentence(cfg: Pick<WorkspaceConfig, "escalateAfterBreachHours">): string {
  const h = cfg.escalateAfterBreachHours;
  if (!h) return "Automatic escalation is off. Tickets past their target stay with their owner until someone moves them.";
  if (h === 1) return "When a ticket needing resolution sits 1 hour past its target with no extension, it is raised to critical and reassigned.";
  return `When a ticket needing resolution sits ${h} hours past its target with no extension, it is raised to critical and reassigned.`;
}

/** The standing fallbacks that fire when a reporting manager cannot be resolved. */
export function escalationMatrix(cfg: Pick<WorkspaceConfig, "escalationOwnerIds">, staff: StaffRecord[]): EscalationRuleSummary["fallbacks"] {
  return DEPARTMENT_RECORDS.filter((d) => d.active).map((dept) => {
    const id = cfg.escalationOwnerIds?.[dept.id] ?? null;
    const person = id ? staff.find((s) => s.id === id) : null;
    return {
      departmentId: dept.id,
      departmentName: dept.name,
      ownerName: person?.name ?? null,
      ownerId: person?.id ?? null,
    };
  });
}

export function escalationRuleSummary(cfg: WorkspaceConfig, staff: StaffRecord[]): EscalationRuleSummary {
  return {
    afterHours: cfg.escalateAfterBreachHours,
    enabled: cfg.escalateAfterBreachHours > 0,
    action: "Raise to critical and reassign to the owner's reporting manager, or the department escalation owner when no manager is on file.",
    fallbacks: escalationMatrix(cfg, staff),
  };
}

/** Where a specific ticket would go if it breached right now — computed on the client
 *  from the same reporting-line logic the server uses.
 *
 *  Returns {via:'manager'} when the owner's manager resolves, {via:'department'} for the
 *  fallback, and {via:'none'} when neither does. That lets the UI say
 *  “Escalates to Anisha (reporting manager of Vivaran)” rather than just “escalated”.
 */
export function nextEscalationTarget(
  ticket: Pick<TicketRecord, "assignedStaffId" | "departmentId" | "departmentName">,
  staffDirectory: StaffRecord[],
  cfg: Pick<WorkspaceConfig, "escalationOwnerIds">
): EscalationTarget {
  const staffForReporting = staffDirectory.map((s) => ({
    id: s.id,
    externalId: s.externalId ?? null,
    name: s.name,
    manager: s.manager ?? null,
    isActive: s.isActive,
  }));

  if (ticket.assignedStaffId != null) {
    const owner = staffDirectory.find((s) => s.id === ticket.assignedStaffId);
    if (owner?.manager) {
      const managerId = reportingManagerId(owner.manager, staffForReporting);
      if (managerId != null) {
        const manager = staffDirectory.find((s) => s.id === managerId);
        if (manager) {
          return {
            id: manager.id,
            name: manager.name,
            via: "manager",
            reason: `Reporting manager of ${owner.name}`,
          };
        }
      }
    }
  }

  const deptId = ticket.departmentId ?? null;
  const fallbackId = deptId ? cfg.escalationOwnerIds?.[deptId] ?? null : null;
  if (fallbackId != null) {
    const fallback = staffDirectory.find((s) => s.id === fallbackId);
    if (fallback) {
      return {
        id: fallback.id,
        name: fallback.name,
        via: "department",
        reason: `Escalation owner for ${ticket.departmentName ?? deptId ?? "department"} (no reporting manager on file)`,
      };
    }
  }

  return { id: null, name: null, via: "none", reason: "No reporting manager or escalation owner is configured for this ticket." };
}

/** One-line future for the board & header: “Escalates to … in X — via …” */
export function escalationPreview(
  ticket: TicketListRecord | TicketRecord,
  staffDirectory: StaffRecord[],
  cfg: Pick<WorkspaceConfig, "escalateAfterBreachHours" | "escalationOwnerIds">
): { label: string; target: EscalationTarget; active: boolean } {
  const active =
    Boolean((ticket as TicketListRecord).resolutionRequired ?? (ticket as TicketRecord & { resolutionRequired?: boolean }).resolutionRequired ?? true) &&
    (ticket as unknown as { status: string }).status !== "resolved" &&
    (ticket as unknown as { status: string }).status !== "closed" &&
    (ticket as { isEscalated?: boolean }).isEscalated !== true &&
    cfg.escalateAfterBreachHours > 0 &&
    Boolean((ticket as { slaDueAt?: string | null }).slaDueAt);

  const target = nextEscalationTarget(
    ticket as Pick<TicketRecord, "assignedStaffId" | "departmentId" | "departmentName">,
    staffDirectory,
    cfg
  );

  if (!active) return { label: cfg.escalateAfterBreachHours === 0 ? "Escalation off" : "Not due for escalation", target, active: false };

  const after = cfg.escalateAfterBreachHours;
  const who = target.name ?? target.reason;
  return {
    label: `${after}h past target → ${who}`,
    target,
    active: true,
  };
}

/** Reporting manager of a staff member, resolved to a name — or null with a reason. */
export function reportingManagerName(staffId: number | null, staffDirectory: StaffRecord[]): { id: number | null; name: string | null; note: string } {
  if (staffId == null) return { id: null, name: null, note: "Unassigned — no owner to report to" };
  const owner = staffDirectory.find((s) => s.id === staffId);
  if (!owner) return { id: null, name: null, note: "Owner not in directory" };
  if (!owner.manager?.trim()) return { id: null, name: null, note: "No reporting manager on file for this owner" };
  const id = reportingManagerId(owner.manager, staffDirectory.map((s) => ({ id: s.id, externalId: s.externalId ?? null, name: s.name, manager: s.manager ?? null, isActive: s.isActive })));
  if (id == null) return { id: null, name: null, note: `"${owner.manager}" does not match anyone in the directory` };
  const mgr = staffDirectory.find((s) => s.id === id);
  return { id, name: mgr?.name ?? null, note: mgr ? `Reports to ${mgr.name}` : "Manager not found" };
}

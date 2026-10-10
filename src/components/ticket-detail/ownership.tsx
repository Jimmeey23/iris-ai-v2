"use client";
import { useState } from "react";
import {
  AlarmClock,
  CalendarCheck2,
  Clock3,
  Crown,
  Loader2,
  Repeat,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import { Avatar } from "../ui";
import { indiaDate, object } from "@/lib/display";
import type { StaffRecord } from "@/lib/constants";
import type { TicketOwner, TicketRecord } from "@/lib/ticket-contract";
import styles from "../ticket-detail.module.css";

type Patch = (p: Record<string, unknown>) => Promise<void>;
export const MAX_CO_OWNERS = 6;

export function coOwnersOf(t: TicketRecord): TicketOwner[] {
  return Array.isArray(t.additionalOwners) ? t.additionalOwners : [];
}

/** Lead owner plus co-owners, with add/remove for whoever may change them. The server takes
 *  the full replacement list, so every change sends the whole set. */
export function OwnersPanel({
  ticket: t,
  staff,
  canEdit,
  busy,
  onPatch,
}: {
  ticket: TicketRecord;
  staff: StaffRecord[];
  canEdit: boolean;
  busy: boolean;
  onPatch: Patch;
}) {
  const coOwners = coOwnersOf(t);
  const [pick, setPick] = useState("");
  const taken = new Set([t.assignedStaffId, ...coOwners.map((o) => o.id)]);
  const choices = staff.filter((p) => p.isActive && !taken.has(p.id));
  const full = coOwners.length >= MAX_CO_OWNERS;
  const save = (ids: number[]) => onPatch({ additionalOwnerIds: ids });
  return (
    <div className="td-panel">
      <h3>Owners</h3>
      <ul className={styles.owners} aria-label="Ticket owners">
        <li>
          {t.assignedStaffName ? <Avatar name={t.assignedStaffName} owner /> : <span className="td-person-glyph"><Crown size={13} /></span>}
          <span>
            <strong>{t.assignedStaffName || "Unassigned"}</strong>
            <small>{t.departmentName || "No team"}</small>
          </span>
          <span className={styles.ownerRole}>Lead</span>
        </li>
        {coOwners.map((o) => (
          <li key={o.id}>
            <Avatar name={o.name} />
            <span>
              <strong>{o.name}</strong>
              <small>{o.departmentName || o.email}</small>
            </span>
            {canEdit ? (
              <button
                type="button"
                className="icon-btn"
                disabled={busy}
                aria-label={`Remove ${o.name} as co-owner`}
                title={`Remove ${o.name} as co-owner`}
                onClick={() => void save(coOwners.filter((c) => c.id !== o.id).map((c) => c.id))}
              >
                <X size={13} />
              </button>
            ) : (
              <span className={styles.ownerRole}>Co-owner</span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className={styles.ownerAdd}>
          <select
            aria-label="Teammate to add as co-owner"
            value={pick}
            disabled={busy || full || !choices.length}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">{full ? `Up to ${MAX_CO_OWNERS} co-owners` : "Choose a teammate…"}</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.department}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !pick || full}
            onClick={() => {
              const id = Number(pick);
              setPick("");
              void save([...coOwners.map((c) => c.id), id]);
            }}
          >
            {busy ? <Loader2 className="spin" size={12} /> : <UserPlus size={12} />}
            Add co-owner
          </button>
        </div>
      )}
    </div>
  );
}

/** ISO → the value a datetime-local input expects, in the viewer's own clock. */
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Escalation, the one SLA extension, the revised target and the owner's committed date —
 *  the ticket's promises, stated in one place. */
export function CommitmentPanel({
  ticket: t,
  canEdit,
  busy,
  onPatch,
}: {
  ticket: TicketRecord;
  canEdit: boolean;
  busy: boolean;
  onPatch: Patch;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const settled = ["resolved", "closed", "recorded"].includes(t.status);
  const originalDue =
    t.slaExtendedAt && t.slaDueAt && t.slaExtendedHours
      ? new Date(new Date(t.slaDueAt).getTime() - t.slaExtendedHours * 3600_000).toISOString()
      : null;
  const committed = t.committedResolutionAt;
  const lateCommit = committed && t.slaDueAt && new Date(committed) > new Date(t.slaDueAt);
  const escalated = t.isEscalated || t.escalatedAt;
  if (!t.resolutionRequired && !committed && !escalated) return null;
  const save = async (iso: string | null) => {
    await onPatch({ committedResolutionAt: iso });
    setEditing(false);
  };
  return (
    <div className={"td-panel " + styles.commit}>
      <h3>Commitments</h3>
      <ul className={styles.commitList}>
        {escalated && (
          <li data-tone="red">
            <ShieldAlert size={14} aria-hidden="true" />
            <span>
              {t.escalatedToName ? (
                <>
                  Escalated to <strong>{t.escalatedToName}</strong>
                  {t.escalatedAt ? ` on ${indiaDate(t.escalatedAt)}` : ""}
                </>
              ) : (
                <>Escalated for review{t.escalatedAt ? ` on ${indiaDate(t.escalatedAt)}` : ""}</>
              )}
            </span>
          </li>
        )}
        {t.slaExtendedAt && (
          <li data-tone="amber">
            <Clock3 size={14} aria-hidden="true" />
            <span>
              Extra time requested: <strong>+{t.slaExtendedHours} h</strong> by {t.slaExtendedByName || "the owner"}
              {t.slaExtensionReason ? <> — {t.slaExtensionReason}</> : null}
            </span>
          </li>
        )}
        {t.slaExtendedAt && t.slaDueAt && (
          <li>
            <AlarmClock size={14} aria-hidden="true" />
            <span>
              Revised SLA: <strong>{indiaDate(t.slaDueAt)}</strong>
              {originalDue ? ` (originally ${indiaDate(originalDue)})` : ""}
            </span>
          </li>
        )}
        {t.resolutionRequired && (
          <li data-tone={committed ? (lateCommit ? "amber" : "green") : undefined} className={styles.commitKey}>
            <CalendarCheck2 size={14} aria-hidden="true" />
            <span>
              Committed resolution:{" "}
              <strong>{committed ? indiaDate(committed) : "not committed yet"}</strong>
              {lateCommit && <small>Later than the follow-up target</small>}
            </span>
          </li>
        )}
      </ul>
      {canEdit && t.resolutionRequired && !settled &&
        (editing ? (
          <div className={styles.commitForm}>
            <label>
              <span>Resolve by</span>
              <input
                type="datetime-local"
                value={value}
                disabled={busy}
                min={toLocalInput(new Date().toISOString())}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <div>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
              {committed && (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void save(null)}>
                  Clear
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy || !value || Number.isNaN(new Date(value).getTime())}
                onClick={() => void save(new Date(value).toISOString())}
              >
                {busy ? <Loader2 className="spin" size={12} /> : <CalendarCheck2 size={12} />}
                Save date
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="td-sla-extend"
            disabled={busy}
            onClick={() => {
              setValue(toLocalInput(committed));
              setEditing(true);
            }}
          >
            <CalendarCheck2 size={13} aria-hidden="true" />
            {committed ? "Change committed date" : "Commit to a resolution date"}
          </button>
        ))}
    </div>
  );
}

/** Mirrors RECURRENCE_CHECK_DAYS in lib/tickets (server-only module). */
const RECHECK_DAYS = [5, 10];

/** An automatic recurrence check, raised days after its parent was resolved. */
export function RecurrenceBanner({ ticket: t, onOpen }: { ticket: TicketRecord; onOpen: (id: number) => void }) {
  const cf = object(t.customFields);
  if (cf.autoFollowUp !== true) return null;
  const day = Number(cf.recheckDay) || null;
  const of = Number(cf.recheckOf) || null;
  const index = day ? RECHECK_DAYS.indexOf(day) + 1 : 0;
  const parentId = Number(cf.parentTicketId) || null;
  const parentNumber = typeof cf.parentTicketNumber === "string" ? cf.parentTicketNumber : parentId ? "#" + parentId : "the original ticket";
  return (
    <div className={styles.recurrence} role="note">
      <Repeat size={16} aria-hidden="true" />
      <div>
        <strong>
          Recurrence check{day ? ` day ${day}` : ""}
          {index && of ? ` · check ${index} of ${of}` : ""} for{" "}
          {parentId ? (
            <a
              href={"/tickets/" + parentId}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onOpen(parentId);
              }}
            >
              {parentNumber}
            </a>
          ) : (
            parentNumber
          )}
        </strong>
        <small>
          {typeof cf.followUpReason === "string" ? cf.followUpReason : "Confirm the issue has not come back."}
          {typeof cf.recheckDueAt === "string" ? ` · check due ${indiaDate(cf.recheckDueAt)}` : ""}
          {typeof cf.firstResolvedAt === "string" ? ` · first resolved ${indiaDate(cf.firstResolvedAt)}` : ""}
        </small>
      </div>
    </div>
  );
}

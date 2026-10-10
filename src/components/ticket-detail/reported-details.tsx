"use client";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  Dumbbell,
  ListChecks,
  MessageSquareText,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { indiaDate, niceKey, object } from "@/lib/display";
import type { TicketRecord } from "@/lib/ticket-contract";
import styles from "../ticket-detail.module.css";

/** The stored row carries a few columns the shared record type leaves out. */
type TicketRow = TicketRecord & {
  area?: string | null;
  channel?: string | null;
  sourceRef?: string | null;
};

/** Written by the server, never by the reporter (mirrors RESERVED_FIELD in lib/tickets), plus
 *  the keys this dialog renders on their own (attendee roster, class snapshot) or elsewhere. */
const RESERVED =
  /^(autoFollowUp|followUpType|followUpReason|followUpAssignment|originalReporterUserId|parent[A-Z].*|recurrence.*|recheck.*|relapseDetailsAllowed|firstResolvedAt|lastRepeatAt|closedOnImport)$/;
const RENDERED_ELSEWHERE = new Set([
  "hostedAttendees",
  "classSnapshot",
  "attendeeNotes",
  "sessionContext",
  "assetName",
  "assetStatus",
]);

/** Labels for keys the intake writes without a plan label (older tickets, the guided composer,
 *  the history importer). Anything else falls back to a humanised key. */
const KNOWN_LABELS: Record<string, string> = {
  reportedBy: "Raised by",
  reporterName: "Reporter name",
  reporterContact: "Reporter contact",
  reporterEmail: "Reporter email",
  reporter_name: "Reporter name",
  reporter_email: "Reporter email",
  reporter_type: "Reporter type",
  report_channel: "How this reached us",
  member_name: "Member",
  member_email: "Member email",
  member_id: "Member ID (Momence)",
  membership_plan: "Membership plan",
  memberImpact: "Member impact",
  impactedMembers: "Attendees affected",
  affectedCount: "Members affected",
  isClassImpacted: "Class impacted",
  isImmediateDanger: "Immediate danger",
  linkedTicket: "Related ticket",
  class_format: "Class format",
  class_date: "Class date & slot",
  specific_area: "Specific area",
  affected_room: "Affected room",
  attendees_count: "Attendees",
  is_repeat: "Repeat issue?",
};

type Group = "reporter" | "member" | "class" | "incident" | "other";
const GROUPS: { id: Group; title: string; icon: LucideIcon }[] = [
  { id: "reporter", title: "Reporter", icon: UserRound },
  { id: "member", title: "Member / client", icon: Users },
  { id: "class", title: "Class & studio", icon: Dumbbell },
  { id: "incident", title: "Incident", icon: CalendarDays },
  { id: "other", title: "Additional answers", icon: ClipboardList },
];
const KEY_GROUP: Record<string, Group> = {
  reportedBy: "reporter",
  reporterName: "reporter",
  reporterContact: "reporter",
  reporterEmail: "reporter",
  reporter_name: "reporter",
  reporter_email: "reporter",
  reporter_type: "reporter",
  report_channel: "reporter",
  member_name: "member",
  member_email: "member",
  member_phone: "member",
  member_id: "member",
  member_named: "member",
  membership: "member",
  membership_plan: "member",
  memberImpact: "member",
  impactedMembers: "member",
  affectedCount: "member",
  studio: "class",
  area: "class",
  specific_area: "class",
  affected_room: "class",
  class_format: "class",
  class_date: "class",
  trainer: "class",
  substitute_trainer: "class",
  session_point: "class",
  sessionName: "class",
  isClassImpacted: "class",
  guest_count: "class",
  attendees_count: "class",
  newcomer_count: "class",
  isImmediateDanger: "incident",
  linkedTicket: "incident",
  is_repeat: "incident",
  member_verbatim: "incident",
};

/** niceKey, with the acronyms the importer and intake use kept upper-case. */
const humanise = (k: string) =>
  niceKey(k).replace(/\b(Sla|Cx|Id|Amc|Ac|Url)\b/g, (w) => w.toUpperCase());

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const empty = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === "string" && !v.trim()) ||
  (Array.isArray(v) && v.every(empty)) ||
  (typeof v === "object" && !Array.isArray(v) && Object.values(object(v)).every(empty));

/** Any stored answer as something readable: never "[object Object]". */
export function AnswerValue({ value }: { value: unknown }): ReactNode {
  if (empty(value)) return <span className={styles.rdMuted}>—</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-IN");
  if (typeof value === "string") return ISO_DATE.test(value) ? indiaDate(value) : value;
  if (Array.isArray(value)) {
    const items = value.filter((v) => !empty(v));
    if (items.every((v) => typeof v !== "object"))
      return (
        <span className={styles.rdChips}>
          {items.map((v, i) => (
            <span key={i} className={styles.rdChip}>
              <AnswerValue value={v} />
            </span>
          ))}
        </span>
      );
    return (
      <ol className={styles.rdList}>
        {items.map((v, i) => (
          <li key={i}>
            <AnswerValue value={v} />
          </li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(object(value)).filter(([, v]) => !empty(v));
  return (
    <dl className={styles.rdNested}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{humanise(k)}</dt>
          <dd>
            <AnswerValue value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Row = { key: string; label: string; value: unknown; wide?: boolean };

const SOURCE_LABELS: Record<string, string> = {
  fillout: "Intake form",
  history: "History import",
  system: "IRIS automation",
  voice: "Voice intake",
  iris: "IRIS",
  template: "Guided template",
  manual: "Workspace form",
};

function sessionLine(ctx: Record<string, unknown>) {
  if (ctx.manual) return typeof ctx.note === "string" ? ctx.note : null;
  const parts = [
    ctx.name,
    ctx.trainer,
    ctx.studio,
    typeof ctx.startsAt === "string" ? indiaDate(ctx.startsAt) : null,
    ctx.sublabel,
  ].filter((p) => typeof p === "string" && p.trim());
  return parts.length ? parts.join(" · ") : null;
}

/** Everything the reporter captured, in one place: the ticket's own columns and every answer
 *  the intake form or guided template stored in `customFields`. */
export function ReportedDetails({ ticket }: { ticket: TicketRecord }) {
  const t = ticket as TicketRow;
  const cf = object(t.customFields);
  const labels = Object.fromEntries(
    Object.entries(object(object(cf._intake).labels)).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
  const labelOrder = Object.keys(labels);
  const sessionCtx = sessionLine(object(cf.sessionContext));

  const columns: Record<Group, Row[]> = {
    reporter: [
      { key: "createdByName", label: "Filed in the workspace by", value: t.createdByName },
      { key: "source", label: "Arrived via", value: [SOURCE_LABELS[t.source || ""] || t.source, t.channel].filter(Boolean).join(" · ") },
      { key: "sourceRef", label: "Source reference", value: t.sourceRef },
    ],
    member: [
      { key: "memberName", label: "Member name", value: t.memberName },
      { key: "memberEmail", label: "Member email", value: t.memberEmail },
      { key: "memberPhone", label: "Member phone", value: t.memberPhone },
      { key: "momenceMemberId", label: "Momence member ID", value: t.momenceMemberId },
      { key: "membership", label: "Membership", value: t.membership },
      { key: "preferredContact", label: "Preferred contact", value: t.preferredContact },
      { key: "sentiment", label: "Sentiment", value: t.sentiment ? niceKey(t.sentiment) : null },
    ],
    class: [
      { key: "studio", label: "Studio", value: t.studio },
      { key: "area", label: "Area / room", value: t.area || cf.area },
      { key: "classFormat", label: "Class format", value: t.classFormat },
      { key: "trainer", label: "Trainer", value: t.trainer },
      { key: "momenceSession", label: "Momence session", value: cf.class_date ? null : sessionCtx || t.momenceSessionId },
    ],
    incident: [
      { key: "incidentAt", label: "When it happened", value: t.incidentAt },
      { key: "kind", label: "Kind", value: t.kind ? niceKey(t.kind) : null },
      { key: "category", label: "Category", value: [t.category, t.subcategory].filter(Boolean).join(" › ") },
      { key: "impact", label: "Reported impact", value: t.impact, wide: true },
      { key: "requestedResolution", label: "Requested resolution", value: t.requestedResolution, wide: true },
    ],
    other: [],
  };
  // A custom answer that only repeats a column already shown above adds nothing.
  const shown = new Set(
    Object.values(columns)
      .flat()
      .map((r) => (typeof r.value === "string" ? r.value.trim().toLowerCase() : null))
      .filter(Boolean),
  );

  const answers = Object.entries(cf)
    .filter(([k, v]) => !k.startsWith("_") && !RESERVED.test(k) && !RENDERED_ELSEWHERE.has(k) && !empty(v))
    .filter(([, v]) => !(typeof v === "string" && shown.has(v.trim().toLowerCase())))
    .map(([k, v]): Row & { group: Group } => {
      const long =
        (typeof v === "string" && v.length > 90) || (typeof v === "object" && v !== null);
      return {
        key: "cf:" + k,
        label: labels[k] || KNOWN_LABELS[k] || humanise(k),
        value: v,
        wide: long,
        group: KEY_GROUP[k] || (/^member|^client/i.test(k) ? "member" : /^reporter|^reported/i.test(k) ? "reporter" : "other"),
      };
    })
    .sort((a, b) => {
      const ia = labelOrder.indexOf(a.key.slice(3)),
        ib = labelOrder.indexOf(b.key.slice(3));
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
      return a.label.localeCompare(b.label);
    });
  for (const a of answers) columns[a.group].push(a);

  const groups = GROUPS.map((g) => ({ ...g, rows: columns[g.id].filter((r) => !empty(r.value)) })).filter(
    (g) => g.rows.length,
  );
  if (!groups.length) return null;

  return (
    <section className={"td-sheet " + styles.rd} aria-labelledby={"rd-title-" + t.id}>
      <header className={styles.rdHead}>
        <span className="td-section-icon">
          <ListChecks size={17} />
        </span>
        <div>
          <span className="eyebrow">AS FILED</span>
          <h3 id={"rd-title-" + t.id}>Reported details</h3>
        </div>
      </header>
      {groups.map((g) => (
        <div key={g.id} className={styles.rdGroup}>
          <h4>
            <g.icon size={13} aria-hidden="true" />
            {g.title}
          </h4>
          <dl className={styles.rdGrid}>
            {g.rows.map((r) => (
              <div key={r.key} className={r.wide ? styles.rdWide : undefined}>
                <dt>{r.label}</dt>
                <dd>
                  <AnswerValue value={r.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** The hosted-class roster, one line per attendee. Older tickets stored {attendee, comments}. */
export function HostedAttendees({ ticket }: { ticket: TicketRecord }) {
  const raw = object(ticket.customFields).hostedAttendees;
  if (!Array.isArray(raw) || !raw.length) return null;
  const rows = raw.map((r) => {
    const o = object(r);
    return {
      name: str(o.name) || str(o.attendee) || "Unnamed",
      email: str(o.email),
      memberId: str(o.memberId),
      booking: str(o.booking),
      attendance: str(o.attendance),
      outcome: str(o.outcome),
      followUp: str(o.followUp),
      flags: Array.isArray(o.flags) ? o.flags.map(str).filter(Boolean) : [],
      note: str(o.note) || str(o.comments),
    };
  });
  const attended = rows.filter((r) => /attended|checked/i.test(r.attendance || r.booking)).length;
  const followUps = rows.filter((r) => r.followUp && !/none/i.test(r.followUp)).length;
  return (
    <section className={"td-sheet " + styles.rd} aria-labelledby={"ha-title-" + ticket.id}>
      <header className={styles.rdHead}>
        <span className="td-section-icon">
          <Users size={17} />
        </span>
        <div>
          <span className="eyebrow">
            HOSTED CLASS · {rows.length} {rows.length === 1 ? "ATTENDEE" : "ATTENDEES"} · {attended} ATTENDED
            {followUps ? ` · ${followUps} TO FOLLOW UP` : ""}
          </span>
          <h3 id={"ha-title-" + ticket.id}>Attendee roster</h3>
        </div>
      </header>
      <div className={styles.rdTableWrap} tabIndex={0} role="region" aria-label="Hosted class attendees, scrolls sideways">
        <table className={styles.rdTable}>
          <thead>
            <tr>
              <th scope="col">Attendee</th>
              <th scope="col">Booking</th>
              <th scope="col">Attendance</th>
              <th scope="col">Outcome</th>
              <th scope="col">Follow-up</th>
              <th scope="col">Flags</th>
              <th scope="col">Comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">
                  <strong>{r.name}</strong>
                  {r.email && <small>{r.email}</small>}
                  {r.memberId && <small>#{r.memberId}</small>}
                </th>
                <td>{r.booking || "—"}</td>
                <td>
                  {r.attendance ? (
                    <span className={styles.rdState} data-tone={/attended|checked/i.test(r.attendance) ? "good" : /cancel|no.?show|absent/i.test(r.attendance) ? "bad" : undefined}>
                      {r.attendance}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{r.outcome || "—"}</td>
                <td>{r.followUp || "—"}</td>
                <td>
                  {r.flags.length ? (
                    <span className={styles.rdChips}>
                      {r.flags.map((f) => (
                        <span key={f} className={styles.rdChip}>
                          {f}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={styles.rdComment}>{r.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SNAPSHOT_STATS: [string, string][] = [
  ["capacity", "Capacity"],
  ["booked", "Booked"],
  ["attended", "Attended"],
  ["absent", "Absent"],
  ["waitlist", "Waitlist"],
  ["guests", "Guests"],
  ["firstTimers", "First-timers"],
  ["overbook", "Overbooked"],
];

/** The class as Momence had it when the report was filed, and any per-attendee notes. */
export function ClassSnapshot({ ticket }: { ticket: TicketRecord }) {
  const cf = object(ticket.customFields);
  const snap = object(cf.classSnapshot);
  const notes = Array.isArray(cf.attendeeNotes) ? cf.attendeeNotes.map(object) : [];
  const stats = SNAPSHOT_STATS.filter(([k]) => typeof snap[k] === "number");
  if (!stats.length && !notes.length) return null;
  const fill = typeof snap.fillPct === "number" ? Math.max(0, Math.min(100, snap.fillPct)) : null;
  return (
    <section className={"td-sheet " + styles.rd} aria-labelledby={"cs-title-" + ticket.id}>
      <header className={styles.rdHead}>
        <span className="td-section-icon">
          <Dumbbell size={17} />
        </span>
        <div>
          <span className="eyebrow">
            CLASS SNAPSHOT{typeof snap.startsAt === "string" ? " · " + indiaDate(snap.startsAt) : ""}
            {snap.source === "live" ? " · FROM MOMENCE" : ""}
          </span>
          <h3 id={"cs-title-" + ticket.id}>{str(snap.name) || "The class"}</h3>
        </div>
      </header>
      {stats.length > 0 && (
        <dl className={styles.csStats}>
          {stats.map(([k, label]) => (
            <div key={k}>
              <dt>{label}</dt>
              <dd>{String(snap[k])}</dd>
            </div>
          ))}
          {fill !== null && (
            <div className={styles.csFill}>
              <dt>Fill</dt>
              <dd>
                {fill}%
                <span className={styles.csBar} aria-hidden="true">
                  <i style={{ width: fill + "%" }} />
                </span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {notes.length > 0 && (
        <div className={styles.rdGroup}>
          <h4>
            <MessageSquareText size={13} aria-hidden="true" />
            Attendee notes
          </h4>
          <div className={styles.rdTableWrap} tabIndex={0} role="region" aria-label="Attendee notes, scrolls sideways">
            <table className={styles.rdTable}>
              <thead>
                <tr>
                  <th scope="col">Attendee</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n, i) => (
                  <tr key={i}>
                    <th scope="row">
                      <strong>{str(n.name) || "Unnamed"}</strong>
                      {str(n.memberId) && <small>#{str(n.memberId)}</small>}
                    </th>
                    <td>{str(n.status) || "—"}</td>
                    <td>
                      <AnswerValue value={n.actions} />
                    </td>
                    <td className={styles.rdComment}>{str(n.note) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

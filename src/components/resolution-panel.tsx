"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  LockKeyhole,
  PencilLine,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Phone,
  MessageSquare,
  Mail,
  Smartphone,
  UserRound,
  X,
} from "lucide-react";
import { api, useApp } from "./ui";

export type Resolution = {
  rootCause: string;
  actionTaken: string;
  preventiveAction: string;
  memberOutcome: string;
  followUpAt?: string | null;
};
export type ResolutionStep = {
  id: number;
  authorName: string;
  body: string;
  createdAt: string;
};
export type FollowUp = {
  id: number;
  note: string;
  dueAt: string;
  ownerName: string;
  done: boolean;
  completedAt: string | null;
  createdByName: string;
};
export type ContactEntry = {
  id: number;
  channel: string;
  outcome: string;
  note: string;
  contactedAt: string;
  authorName: string;
};
export type ResolutionWorkspace = {
  resolution: Resolution | null;
  steps: ResolutionStep[];
  followUps: FollowUp[];
  contacts: ContactEntry[];
};

const STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "waiting_on_member",
  "waiting_on_vendor",
  "resolved",
  "closed",
] as const;
const CHANNELS = [
  { id: "call", label: "Call", icon: Phone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "in_person", label: "In person", icon: UserRound },
] as const;
const OUTCOMES = [
  { id: "reached", label: "Reached" },
  { id: "no_answer", label: "No answer" },
  { id: "left_message", label: "Left message" },
  { id: "awaiting_reply", label: "Awaiting reply" },
  { id: "declined", label: "Declined" },
] as const;
const OUTCOME_TONE: Record<string, string> = {
  reached: "green",
  no_answer: "amber",
  left_message: "blue",
  awaiting_reply: "amber",
  declined: "red",
};
const SUMMARY_FIELDS = [
  {
    key: "rootCause",
    label: "Root cause",
    hint: "Why did this happen?",
    required: false,
  },
  {
    key: "actionTaken",
    label: "Action taken",
    hint: "What fixed it?",
    required: true,
  },
  {
    key: "preventiveAction",
    label: "Preventive action",
    hint: "What stops it happening again?",
    required: false,
  },
  {
    key: "memberOutcome",
    label: "Member outcome",
    hint: "Where did this leave the member?",
    required: true,
  },
] as const;

/** Reading the clock during render is impure, so the current time arrives as an
 *  external store instead. Bucketing to the minute keeps the snapshot stable
 *  between ticks, which is what useSyncExternalStore requires. */
const subscribeToClock = (cb: () => void) => {
  const id = setInterval(cb, 30000);
  return () => clearInterval(id);
};
const clockSnapshot = () => Math.floor(Date.now() / 60000) * 60000;
const useNow = () =>
  useSyncExternalStore(subscribeToClock, clockSnapshot, () => 0);

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const dayOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
/** `datetime-local` needs a local-clock string, not the UTC one toISOString gives. */
const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

type Ticket = {
  id: number;
  version: number;
  status: string;
  assignedStaffName?: string | null;
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;
  preferredContact?: string | null;
  resolutionRequired: boolean;
};

export function ResolutionPanel({
  ticket,
  workspace,
  canResolve,
  onClose,
  onChanged,
  onPatch,
  busy,
}: {
  ticket: Ticket;
  workspace: ResolutionWorkspace;
  canResolve: boolean;
  onClose: () => void;
  onChanged: (w: ResolutionWorkspace) => void;
  onPatch: (p: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const { notify } = useApp();
  const [section, setSection] = useState<
    "log" | "chase" | "member" | "writeup"
  >("log");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("");
  const [fuNote, setFuNote] = useState(""),
    [fuDue, setFuDue] = useState("");
  const [channel, setChannel] = useState<string>("call"),
    [outcome, setOutcome] = useState<string>("reached"),
    [contactNote, setContactNote] = useState("");
  const [draft, setDraft] = useState<Resolution>(() => ({
    rootCause: "",
    actionTaken: "",
    preventiveAction: "",
    memberOutcome: "",
    ...(workspace.resolution || {}),
  }));
  const [status, setStatus] = useState(ticket.status);

  const now = useNow();
  const defaultDue = useMemo(
    () => (now ? toLocalInput(new Date(now + 86400000)) : ""),
    [now],
  );
  const openFollowUps = useMemo(
    () => workspace.followUps.filter((f) => !f.done),
    [workspace.followUps],
  );
  const overdue = useMemo(
    () => openFollowUps.filter((f) => new Date(f.dueAt).getTime() < now),
    [openFollowUps, now],
  );
  // The server refuses to resolve without these two, so say so before the click.
  const readyToResolve = Boolean(
    draft.actionTaken.trim() && draft.memberOutcome.trim(),
  );
  const hasWriteUp = SUMMARY_FIELDS.some((f) =>
    workspace.resolution?.[f.key]?.trim(),
  );
  const completion = useMemo(() => {
    const filled = SUMMARY_FIELDS.filter((f) =>
      workspace.resolution?.[f.key]?.trim(),
    ).length;
    const writeUpScore = filled / SUMMARY_FIELDS.length;
    const stepsScore = workspace.steps.length > 0 ? 1 : 0;
    const followUpScore =
      workspace.followUps.length === 0
        ? 1
        : openFollowUps.length === 0
          ? 1
          : 0.5;
    const contactScore = workspace.contacts.length > 0 ? 1 : 0;
    return Math.min(
      1,
      (writeUpScore + stepsScore + followUpScore + contactScore) / 4,
    );
  }, [workspace, openFollowUps]);

  async function call(path: string, init: RequestInit) {
    setSaving(true);
    try {
      onChanged(
        await api<ResolutionWorkspace>(
          "/api/tickets/" + ticket.id + "/resolution" + path,
          init,
        ),
      );
    } catch (e) {
      notify((e as Error).message, "error");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  if (!ticket.resolutionRequired)
    return (
      <aside className="rw resolution-v2" aria-label="Resolution">
        <RwHead onClose={onClose} completion={0} />
        <p className="rw-empty">
          This ticket records feedback, appreciation or an assessment. There is
          no resolution to work through.
        </p>
      </aside>
    );

  const tabs = [
    { id: "log", label: "Work log", count: workspace.steps.length },
    { id: "chase", label: "Follow-ups", count: openFollowUps.length },
    { id: "member", label: "Member", count: workspace.contacts.length },
    { id: "writeup", label: "Write-up", count: hasWriteUp ? 1 : 0 },
  ] as const;

  return (
    <aside className="rw resolution-v2" aria-label="Resolution">
      <RwHead onClose={onClose} completion={completion} />

      {canResolve ? (
        <p className="rw-note">
          <PencilLine size={12} />
          You can edit this. Anyone who opens the ticket can read it.
        </p>
      ) : (
        <p className="rw-note locked">
          <LockKeyhole size={12} />
          Read-only. {ticket.assignedStaffName || "The assigned owner"}, their
          manager and admins can edit.
        </p>
      )}

      {canResolve && (
        <div className="rw-status">
          <label htmlFor="rw-status">Status</label>
          <select
            id="rw-status"
            value={status}
            disabled={busy || saving}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            disabled={busy || saving || status === ticket.status}
            onClick={() => void onPatch({ status })}
          >
            Update
          </button>
        </div>
      )}

      <nav className="rw-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={section === t.id ? "active" : ""}
            onClick={() => setSection(t.id)}
          >
            {t.label}
            {t.count > 0 && (
              <i
                className={t.id === "chase" && overdue.length > 0 ? "late" : ""}
              >
                {t.count}
              </i>
            )}
          </button>
        ))}
      </nav>

      <div className="rw-body">
        {section === "log" && (
          <>
            {canResolve && (
              <div className="rw-write">
                <textarea
                  rows={2}
                  placeholder="What did you just do?"
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={saving || step.trim().length < 3}
                  onClick={() =>
                    void call("/steps", {
                      method: "POST",
                      body: JSON.stringify({ body: step.trim() }),
                    }).then(() => setStep(""))
                  }
                >
                  {saving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Log step
                </button>
              </div>
            )}
            {workspace.steps.length === 0 ? (
              <p className="rw-empty">
                {canResolve
                  ? "Log each thing you do. It becomes the record of how this was handled."
                  : "Nothing logged yet."}
              </p>
            ) : (
              <ol className="rw-log">
                {workspace.steps.map((s) => (
                  <li key={s.id}>
                    <p>{s.body}</p>
                    <footer>
                      <span>{s.authorName}</span>
                      <time>{when(s.createdAt)}</time>
                      {canResolve && (
                        <button
                          aria-label="Remove step"
                          onClick={() =>
                            void call("/steps?stepId=" + s.id, {
                              method: "DELETE",
                            })
                          }
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </footer>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {section === "chase" && (
          <>
            {canResolve && (
              <div className="rw-write">
                <input
                  type="text"
                  placeholder="What needs chasing?"
                  value={fuNote}
                  onChange={(e) => setFuNote(e.target.value)}
                />
                <input
                  type="datetime-local"
                  value={fuDue || defaultDue}
                  onChange={(e) => setFuDue(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={
                    saving || fuNote.trim().length < 3 || !(fuDue || defaultDue)
                  }
                  onClick={() =>
                    void call("/followups", {
                      method: "POST",
                      body: JSON.stringify({
                        note: fuNote.trim(),
                        dueAt: new Date(fuDue || defaultDue).toISOString(),
                      }),
                    }).then(() => setFuNote(""))
                  }
                >
                  {saving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Add follow-up
                </button>
              </div>
            )}
            {workspace.followUps.length === 0 ? (
              <p className="rw-empty">
                {canResolve
                  ? "Add a follow-up so this comes back to you at the right moment."
                  : "Nothing scheduled."}
              </p>
            ) : (
              <ul className="rw-chase">
                {workspace.followUps.map((f) => {
                  const late = !f.done && new Date(f.dueAt).getTime() < now;
                  return (
                    <li
                      key={f.id}
                      className={(f.done ? "done " : "") + (late ? "late" : "")}
                    >
                      <input
                        type="checkbox"
                        checked={f.done}
                        disabled={!canResolve || saving}
                        aria-label={
                          f.done ? "Reopen follow-up" : "Mark follow-up done"
                        }
                        onChange={(e) =>
                          void call("/followups", {
                            method: "PATCH",
                            body: JSON.stringify({
                              followUpId: f.id,
                              done: e.target.checked,
                            }),
                          })
                        }
                      />
                      <div>
                        <p>{f.note}</p>
                        <footer>
                          <time>
                            {late ? "Overdue · " : ""}
                            {dayOnly(f.dueAt)}
                          </time>
                          {f.ownerName && <span>{f.ownerName}</span>}
                        </footer>
                      </div>
                      {canResolve && (
                        <button
                          aria-label="Remove follow-up"
                          onClick={() =>
                            void call("/followups?followUpId=" + f.id, {
                              method: "DELETE",
                            })
                          }
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {section === "member" && (
          <>
            <div className="rw-reach">
              {ticket.memberPhone && (
                <a href={"tel:" + ticket.memberPhone}>
                  <Phone size={12} />
                  {ticket.memberPhone}
                </a>
              )}
              {ticket.memberEmail && (
                <a href={"mailto:" + ticket.memberEmail}>
                  <Mail size={12} />
                  {ticket.memberEmail}
                </a>
              )}
              {!ticket.memberPhone && !ticket.memberEmail && (
                <span>No contact details on file for {ticket.memberName}.</span>
              )}
              {ticket.preferredContact && (
                <em>Prefers {ticket.preferredContact.toLowerCase()}</em>
              )}
            </div>
            {canResolve && (
              <div className="rw-write">
                <div className="rw-picks" role="group" aria-label="Channel">
                  {CHANNELS.map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        className={channel === c.id ? "active" : ""}
                        onClick={() => setChannel(c.id)}
                      >
                        <Icon size={11} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <div className="rw-picks" role="group" aria-label="Outcome">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.id}
                      className={outcome === o.id ? "active" : ""}
                      onClick={() => setOutcome(o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  placeholder="What was said?"
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={saving}
                  onClick={() =>
                    void call("/contacts", {
                      method: "POST",
                      body: JSON.stringify({
                        channel,
                        outcome,
                        note: contactNote.trim(),
                      }),
                    }).then(() => setContactNote(""))
                  }
                >
                  {saving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Log contact
                </button>
              </div>
            )}
            {workspace.contacts.length === 0 ? (
              <p className="rw-empty">
                {canResolve
                  ? "Record every attempt, including the ones that did not connect."
                  : "No outreach logged."}
              </p>
            ) : (
              <ul className="rw-reachlog">
                {workspace.contacts.map((c) => (
                  <li key={c.id}>
                    <span
                      className={"rw-dot " + (OUTCOME_TONE[c.outcome] || "")}
                      aria-hidden
                    />
                    <div>
                      <p>
                        <strong>{titleCase(c.channel)}</strong> ·{" "}
                        {titleCase(c.outcome)}
                      </p>
                      {c.note && <q>{c.note}</q>}
                      <footer>
                        <span>{c.authorName}</span>
                        <time>{when(c.contactedAt)}</time>
                      </footer>
                    </div>
                    {canResolve && (
                      <button
                        aria-label="Remove contact entry"
                        onClick={() =>
                          void call("/contacts?contactId=" + c.id, {
                            method: "DELETE",
                          })
                        }
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {section === "writeup" &&
          (canResolve ? (
            <div className="rw-form">
              {SUMMARY_FIELDS.map((f) => (
                <label key={f.key}>
                  <span>
                    {f.label}
                    {f.required && <i>required to resolve</i>}
                  </span>
                  <textarea
                    rows={3}
                    placeholder={f.hint}
                    value={draft[f.key]}
                    onChange={(e) =>
                      setDraft((r) => ({ ...r, [f.key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <button
                className="btn btn-sm btn-primary"
                disabled={saving}
                onClick={() =>
                  void call("", {
                    method: "PUT",
                    body: JSON.stringify({
                      ...draft,
                      followUpAt: draft.followUpAt || undefined,
                    }),
                  }).then(() => notify("Write-up saved."))
                }
              >
                {saving && <Loader2 size={12} className="animate-spin" />}Save
                write-up
              </button>
            </div>
          ) : hasWriteUp ? (
            <div className="rw-read">
              {SUMMARY_FIELDS.filter((f) =>
                workspace.resolution?.[f.key]?.trim(),
              ).map((f) => (
                <section key={f.key}>
                  <h4>{f.label}</h4>
                  <p>{workspace.resolution?.[f.key]}</p>
                </section>
              ))}
            </div>
          ) : (
            <p className="rw-empty">The owner has not written this up yet.</p>
          ))}
      </div>

      {canResolve && (
        <div className="rw-foot">
          {!readyToResolve && (
            <p>
              Action taken and member outcome are needed before this can be
              resolved.
            </p>
          )}
          <button
            className="btn btn-primary"
            disabled={
              busy || saving || !readyToResolve || ticket.status === "resolved"
            }
            onClick={() => void onPatch({ status: "resolved" })}
          >
            <CheckCircle2 size={13} />
            {ticket.status === "resolved" ? "Resolved" : "Mark resolved"}
          </button>
        </div>
      )}
    </aside>
  );
}

function CompletionRing({ value }: { value: number }) {
  const size = 42;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className="rw-completion-ring"
      aria-label={`Resolution completion ${Math.round(pct * 100)}%`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="cr-track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="cr-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function RwHead({
  onClose,
  completion,
}: {
  onClose: () => void;
  completion: number;
}) {
  return (
    <header className="rw-head">
      <div className="rw-completion">
        <CompletionRing value={completion} />
        <div className="rw-completion-meta">
          <strong>Resolution</strong>
          <span>{Math.round(completion * 100)}% complete</span>
        </div>
      </div>
      <button onClick={onClose} aria-label="Close resolution">
        <X size={14} />
      </button>
    </header>
  );
}

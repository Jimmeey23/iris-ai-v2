"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
  ListChecks,
  BellRing,
  ContactRound,
  FileCheck2,
  UserCheck,
  Paperclip,
  UploadCloud,
  FileAudio,
  File,
  Download,
} from "lucide-react";
import { api, useApp } from "./ui";
import { MentionBox, MentionText, mentionIdsIn, type MentionPerson } from "./mention-box";
import { indiaDate } from "@/lib/display";

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
export type ResolutionAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedByName: string;
  createdAt: string;
};
export type ResolutionWorkspace = {
  resolution: Resolution | null;
  steps: ResolutionStep[];
  followUps: FollowUp[];
  contacts: ContactEntry[];
  attachments: ResolutionAttachment[];
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
    required: false,
  },
] as const;

/** Reading the clock during render is impure, so the current time arrives as an
 *  external store instead. Bucketing to the minute keeps the snapshot stable
 *  between ticks, which is what useSyncExternalStore requires. The tick pauses
 *  while the tab is hidden and catches up the moment it is visible again. */
const subscribeToClock = (cb: () => void) => {
  const id = setInterval(() => {
    if (!document.hidden) cb();
  }, 30000);
  document.addEventListener("visibilitychange", cb);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", cb);
  };
};
const clockSnapshot = () => Math.floor(Date.now() / 60000) * 60000;
const useNow = () =>
  useSyncExternalStore(subscribeToClock, clockSnapshot, () => 0);

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const when = (iso: string) => indiaDate(iso);
const dayOnly = (iso: string) => indiaDate(iso, true);
/** The resolution endpoints answer 400 for record-only tickets and 403 for anyone
 *  who is not the assigned owner or their reporting manager. Both mean "this
 *  workspace is not yours to edit", not a failure worth a toast per click. */
const ACCESS_REFUSAL =
  /does not require a resolution|only the assigned owner|do not have access|sign in/i;
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
  variant = "rail",
}: {
  ticket: Ticket;
  workspace: ResolutionWorkspace;
  canResolve: boolean;
  /** `rail` is the narrow column inside the ticket dialog; `modal` is the pop-out, which gets
   *  the height to show a work log without a scroll-within-a-scroll. */
  variant?: "rail" | "modal";
  onClose: () => void;
  onChanged: (w: ResolutionWorkspace) => void;
  onPatch: (p: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const { notify } = useApp();
  const [section, setSection] = useState<
    "log" | "chase" | "member" | "files" | "writeup"
  >("log");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("");
  // Everyone with a workspace account can be tagged in the log: a step is internal, and the
  // person who needs to see it is not always the one the ticket is assigned to.
  const [mentionPeople, setMentionPeople] = useState<MentionPerson[]>([]);
  const [mentioned, setMentioned] = useState<MentionPerson[]>([]);
  useEffect(() => {
    void api<{people: {userId: number | null; name: string; username: string | null}[]}>("/api/directory")
      .then((d) => setMentionPeople(d.people.filter((person): person is MentionPerson => person.userId !== null)))
      .catch(() => {});
  }, []);
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
  const [refusal, setRefusal] = useState("");
  const [files, setFiles] = useState<File[]>([]);

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
  // The server refuses to resolve without the *saved* action taken. The draft counts too:
  // resolving saves it first (see the Mark resolved button), so an owner who typed the write-up
  // and went straight for the button is not told to go back and press Save.
  const savedActionTaken = Boolean(workspace.resolution?.actionTaken?.trim());
  const readyToResolve = savedActionTaken || Boolean(draft.actionTaken.trim());
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
      const message = (e as Error).message;
      if (ACCESS_REFUSAL.test(message)) {
        // Say it once, then fall back to the locked view instead of repeating it.
        if (!refusal) notify(message, "error");
        setRefusal(message);
      } else notify(message, "error");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  /** Resolving with an unsaved write-up used to fail on the server ("Complete the private
   *  resolution action first") because the button read the draft while the server reads the
   *  saved row. Save the write-up first when it differs, then change the status. */
  async function resolveNow() {
    // Empty draft fields never overwrite what is already saved: the panel can be opened on a
    // ticket whose write-up loaded after the form seeded itself.
    const merged = { ...workspace.resolution, ...draft } as Resolution;
    SUMMARY_FIELDS.forEach((f) => {
      if (!draft[f.key].trim() && workspace.resolution?.[f.key])
        merged[f.key] = workspace.resolution[f.key];
    });
    const dirty = SUMMARY_FIELDS.some(
      (f) => (merged[f.key] || "").trim() !== (workspace.resolution?.[f.key] || "").trim(),
    );
    if (dirty)
      await call("", {
        method: "PUT",
        body: JSON.stringify({ ...merged, followUpAt: merged.followUpAt || undefined }),
      });
    await onPatch({ status: "resolved" });
  }

  if (!ticket.resolutionRequired)
    return (
      <aside className={"rw resolution-v2" + (variant === "modal" ? " rw-modal" : "")} aria-label="Resolution">
        <RwHead onClose={onClose} completion={0} />
        <p className="rw-empty">
          This ticket records feedback, appreciation or an assessment. There is
          no resolution to work through.
        </p>
      </aside>
    );

  // The resolution is visible to everyone with ticket access; only writing to it is
  // restricted to the assigned owner and their reporting manager. A `refusal` means a
  // write slipped through client-side despite that (e.g. a stale canResolve after a
  // reassignment) and the server said no — fall back to a locked view rather than
  // repeat the same error on every click.
  if (refusal)
    return (
      <aside className={"rw resolution-v2" + (variant === "modal" ? " rw-modal" : "")} aria-label="Resolution">
        <RwHead onClose={onClose} completion={0} />
        <p className="rw-note locked">
          <LockKeyhole size={12} />
          Private to {ticket.assignedStaffName || "the assigned owner"} and
          their reporting manager.
        </p>
        <p className="rw-empty">
          Only the assigned owner or their reporting manager can update this
          ticket&apos;s work log, follow-ups, member contacts and write-up.
        </p>
      </aside>
    );

  const tabs = [
    { id: "log", label: "Work log", count: workspace.steps.length, icon: ListChecks },
    { id: "chase", label: "Follow-ups", count: openFollowUps.length, icon: BellRing },
    { id: "member", label: "Member", count: workspace.contacts.length, icon: ContactRound },
    { id: "files", label: "Files", count: workspace.attachments.length, icon: Paperclip },
    { id: "writeup", label: "Write-up", count: hasWriteUp ? 1 : 0, icon: FileCheck2 },
  ] as const;

  return (
    <aside className={"rw resolution-v2" + (variant === "modal" ? " rw-modal" : "")} aria-label="Resolution">
      <RwHead onClose={onClose} completion={completion} />

      <div className="rw-command-bar">
        <p className="rw-note">
          {canResolve ? (
            <><PencilLine size={12} />Owner workspace · changes are privately controlled.</>
          ) : (
            <><LockKeyhole size={12} />Read only · owned by {ticket.assignedStaffName || "the assigned owner"}.</>
          )}
        </p>
        {canResolve && (
          <div className="rw-status">
            <label htmlFor="rw-status">Current stage</label>
            <select
              id="rw-status"
              value={status}
              disabled={busy || saving}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
            <button
              className="btn btn-sm"
              disabled={busy || saving || status === ticket.status}
              onClick={() => void onPatch({ status })}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <div className="rw-snapshot" aria-label="Resolution activity summary">
        <div><ListChecks size={13}/><span><strong>{workspace.steps.length}</strong><small>work steps</small></span></div>
        <div className={overdue.length ? "attention" : ""}><BellRing size={13}/><span><strong>{openFollowUps.length}</strong><small>{overdue.length ? `${overdue.length} overdue` : "open follow-ups"}</small></span></div>
        <div><UserCheck size={13}/><span><strong>{workspace.contacts.length}</strong><small>member contacts</small></span></div>
        <div><Paperclip size={13}/><span><strong>{workspace.attachments.length}</strong><small>supporting files</small></span></div>
      </div>

      <nav className="rw-tabs" aria-label="Resolution sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={section === t.id ? "active" : ""}
              onClick={() => setSection(t.id)}
              aria-pressed={section === t.id}
            >
              <Icon size={13}/>
              <span>{t.label}</span>
              {t.count > 0 && <i className={t.id === "chase" && overdue.length > 0 ? "late" : ""}>{t.count}</i>}
            </button>
          );
        })}
      </nav>

      <div className="rw-body">
        {section === "log" && (
          <>
            {canResolve && (
              <div className="rw-write">
                <MentionBox
                  rows={2}
                  placeholder="What did you just do? Type @ to tag a teammate."
                  value={step}
                  onChange={setStep}
                  people={mentionPeople}
                  onPick={(person) => setMentioned((current) => current.some((item) => item.userId === person.userId) ? current : [...current, person])}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={saving || step.trim().length < 3}
                  onClick={() =>
                    void call("/steps", {
                      method: "POST",
                      body: JSON.stringify({ body: step.trim(), mentionUserIds: mentionIdsIn(step, mentioned) }),
                    }).then(() => { setStep(""); setMentioned([]); })
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
                    <p><MentionText body={s.body} people={mentionPeople} /></p>
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

        {section === "files" && (
          <>
            {canResolve && (
              <div className="rw-upload">
                <label>
                  <UploadCloud size={20}/>
                  <span><strong>Add evidence</strong><small>Documents, images or voice recordings · up to 15 MB each</small></span>
                  <input
                    type="file"
                    multiple
                    accept="audio/*,image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  />
                </label>
                {files.length > 0 && (
                  <div className="rw-upload-ready">
                    <span>{files.length} file{files.length === 1 ? "" : "s"} ready</span>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={saving}
                      onClick={() => {
                        const body = new FormData();
                        files.forEach((file) => body.append("files", file));
                        void call("/attachments", {method: "POST", body}).then(() => setFiles([]));
                      }}
                    >
                      {saving ? <Loader2 size={12} className="animate-spin"/> : <UploadCloud size={12}/>}
                      Upload
                    </button>
                  </div>
                )}
              </div>
            )}
            {workspace.attachments.length === 0 ? (
              <p className="rw-empty">No supporting documents or recordings yet.</p>
            ) : (
              <ul className="rw-files">
                {workspace.attachments.map((attachment) => {
                  const AudioIcon = attachment.fileType.startsWith("audio/") ? FileAudio : File;
                  const href = `/api/tickets/${ticket.id}/resolution/attachments?attachmentId=${attachment.id}`;
                  return (
                    <li key={attachment.id}>
                      <AudioIcon size={16}/>
                      <div><p>{attachment.fileName}</p><small>{(attachment.fileSize / 1024).toFixed(attachment.fileSize > 1024 * 1024 ? 0 : 1)} KB · {attachment.uploadedByName} · {dayOnly(attachment.createdAt)}</small></div>
                      <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.fileName}`}><Download size={12}/></a>
                      {canResolve && <button aria-label={`Remove ${attachment.fileName}`} onClick={() => void call(`/attachments?attachmentId=${attachment.id}`, {method: "DELETE"})}><Trash2 size={11}/></button>}
                    </li>
                  );
                })}
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
              Action taken is needed before this can be resolved.
            </p>
          )}
          <button
            className="btn btn-primary"
            disabled={
              busy || saving || !readyToResolve || ticket.status === "resolved"
            }
            onClick={() => void resolveNow().catch(() => {})}
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
      <strong aria-hidden="true">{Math.round(pct * 100)}</strong>
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
          <span className="rw-kicker">PRIVATE WORKSPACE</span>
          <strong>Case resolution</strong>
          <span>{Math.round(completion * 100)}% complete · owner controlled</span>
        </div>
      </div>
      <button onClick={onClose} aria-label="Close resolution">
        <X size={14} />
      </button>
    </header>
  );
}

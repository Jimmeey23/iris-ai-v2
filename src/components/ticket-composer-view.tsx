"use client";
import { REPORTED_BY_OPTIONS } from "@/lib/constants";
import { display,indiaDate,niceKey } from "@/lib/display";
import {
ArrowLeft,
ArrowRight,
CalendarDays,
CheckCircle2,
EyeOff,
Loader2,
LockKeyhole,
MapPin,
Paperclip,
Save,
Send,
ShieldCheck,
Sparkles,
Users,
Wrench,
} from "lucide-react";
import { DraftDocument } from "./draft-document";
import { AttachmentPreviewList,FileUpload } from "./file-upload";
import { InvolvedTeams } from "./intake/involved-teams";
import { OptionSelect } from "./intake/option-select";
import { MultiSelect } from "./multi-select";
import { StructuredInput } from "./structured-input";
import type { useTicketComposerController } from "./ticket-composer-controller";
import { Avatar,Badge,Field,Modal,Switch } from "./ui";

type HostedAttendee = {
  key: string;
  bookingId: string;
  sessionId: string;
  sessionName: string;
  attendee: string;
  status: "attended" | "no_show" | "cancelled" | "follow_up";
  comments: string;
  details: string;
};
export function TicketComposerView({
  model,
}: {
  model: ReturnType<typeof useTicketComposerController>;
}) {
  const {
    open,
    onClose,
    step,
    template,
    draftId,
    setStep,
    busy,
    saving,
    saveDraft,
    hostedError,
    submit,
    review,
    error,
    draft,
    user,
    involvesMember,
    setInvolvesMember,
    form,
    set,
    setMember,
    setMemberDetail,
    involvesSession,
    setInvolvesSession,
    setSessions,
    setSessionDetail,
    setTrainers,
    setFormats,
    setCustom,
    requiresResolution,
    setRequiresResolution,
    lookupBusy,
    member,
    selectMember,
    memberDetail,
    hostedTemplate,
    sessions,
    selectSessions,
    sessionDetail,
    config,
    leadDept,
    involvedTeams,
    suggestedTeams,
    setTeamPick,
    reportedBy,
    setReportedBy,
    classSection,
    formats,
    pickFormats,
    trainers,
    pickTrainers,
    setHostedAttendees,
    key,
    hostedBusy,
    hostedAttendees,
    recordOnly,
    score,
    skippedFields,
    setSkippedFields,
    custom,
    attachments,
    setAttachments,
  } = model;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        step === "review"
          ? "Ready to file"
          : template?.title || "Log a new ticket"
      }
      description={
        step === "review"
          ? "Check the details below. Nothing is filed until you approve it."
          : template
            ? "Guided template · " + template.category
            : "Auto-routes to the right department with tags and a follow-up target"
      }
      size="wide"
      footer={
        <>
          <div className="flex-row">
            <ShieldCheck size={14} className="accent" />
            <span className="muted" style={{ fontSize: 10 }}>
              {step === "review"
                ? "Your approval is required before filing."
                : draftId
                  ? "Editing saved draft"
                  : "Draft only · nothing sent yet"}
            </span>
          </div>
          <div className="flex-row">
            {step === "review" && (
              <button className="btn" onClick={() => setStep("details")}>
                <ArrowLeft size={13} />
                Back
              </button>
            )}
            {step === "details" && (
              <button
                className="btn"
                disabled={busy || saving}
                onClick={() => void saveDraft()}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}{" "}
                {draftId ? "Update draft" : "Save draft"}
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={
                busy || saving || (step === "details" && Boolean(hostedError))
              }
              title={
                step === "details" && hostedError ? hostedError : undefined
              }
              onClick={() => void (step === "review" ? submit() : review())}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : step === "review" ? (
                <Send size={13} />
              ) : (
                <Sparkles size={13} />
              )}{" "}
              {step === "review" ? "Approve & log ticket" : "Build ticket"}
              {step === "details" && <ArrowRight size={13} />}
            </button>
          </div>
        </>
      }
    >
      {error && (
        <div className="error-box" style={{ marginBottom: 18 }}>
          {error}
        </div>
      )}
      {step === "review" && draft ? (
        <DraftDocument draft={draft} onEdit={() => setStep("details")} />
      ) : (
        <div className="form-layout composer-sheet">
          <div>
            <section
              className="form-context-gate"
              aria-labelledby="ticket-context-title"
            >
              <div className="form-context-head">
                <div>
                  <span className="eyebrow">TICKET CONTEXT</span>
                  <h3 id="ticket-context-title">
                    What does this ticket involve?
                  </h3>
                  <p>
                    Turn on only the records that should be securely linked from
                    Momence.
                  </p>
                </div>
                <Badge tone="blue">
                  <MapPin size={10} />
                  {user?.studio || "Profile studio"}
                </Badge>
              </div>
              <div className="context-toggle-grid">
                <label
                  className={
                    involvesMember ? "context-toggle active" : "context-toggle"
                  }
                >
                  <span className="context-toggle-icon">
                    <Users size={17} />
                  </span>
                  <span>
                    <strong>Involves a member/s</strong>
                    <small>
                      Link identity, contact, memberships and visit history
                    </small>
                  </span>
                  <Switch
                    checked={involvesMember}
                    onChange={(v) => {
                      setInvolvesMember(v);
                      if (v) {
                        if (form.memberName === "Studio team observation")
                          set("memberName", "");
                      } else {
                        setMember(undefined);
                        setMemberDetail(undefined);
                        set("memberName", "Studio team observation");
                        set("memberEmail", "");
                        set("memberPhone", undefined);
                        set("momenceMemberId", undefined);
                        set("membership", undefined);
                        set("momenceContext", undefined);
                      }
                    }}
                    label="Involves a member or members"
                  />
                </label>
                <label
                  className={
                    involvesSession ? "context-toggle active" : "context-toggle"
                  }
                >
                  <span className="context-toggle-icon">
                    <CalendarDays size={17} />
                  </span>
                  <span>
                    <strong>Involves a session</strong>
                    <small>
                      Link class, schedule, instructor, location and roster
                    </small>
                  </span>
                  <Switch
                    checked={involvesSession}
                    onChange={(v) => {
                      setInvolvesSession(v);
                      if (!v) {
                        setSessions(undefined);
                        setSessionDetail(undefined);
                        set("momenceSessionId", undefined);
                        setTrainers([]);
                        setFormats([]);
                        set("classFormat", undefined);
                        set("trainer", undefined);
                        setCustom((c) => ({ ...c, trainersInvolved: [] }));
                      }
                    }}
                    label="Involves a session"
                  />
                </label>
                <label
                  className={
                    requiresResolution
                      ? "context-toggle active"
                      : "context-toggle"
                  }
                >
                  <span className="context-toggle-icon">
                    <Wrench size={17} />
                  </span>
                  <span>
                    <strong>Requires resolution</strong>
                    <small>Create ownership, SLA and a closure workflow</small>
                  </span>
                  <Switch
                    checked={requiresResolution}
                    onChange={(v) => {
                      setRequiresResolution(v);
                      set("resolutionRequired", v);
                    }}
                    label="Requires resolution"
                  />
                </label>
              </div>
              {involvesMember && (
                <div className="context-detail-panel">
                  <div className="context-detail-title">
                    <Users size={16} />
                    <div>
                      <strong>Member intelligence</strong>
                      <p>
                        Searches the Momence host linked to the reporter&apos;s
                        profile studio.
                      </p>
                    </div>
                    {lookupBusy && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                  </div>
                  <Field
                    label="Select community member"
                    hint="Selecting a member securely retrieves their profile, active access and recent activity."
                  >
                    <MultiSelect
                      module="members"
                      value={member ? [member] : []}
                      onChange={(v) => void selectMember(v)}
                      placeholder="Search member name, email or phone…"
                    />
                  </Field>
                  {member && (
                    <div className="context-facts">
                      <div>
                        <small>Member</small>
                        <strong>{member.label}</strong>
                      </div>
                      <div>
                        <small>Email</small>
                        <strong>{display(form.memberEmail)}</strong>
                      </div>
                      <div>
                        <small>Phone</small>
                        <strong>{display(form.memberPhone)}</strong>
                      </div>
                      <div>
                        <small>Active access</small>
                        <strong>{display(form.membership)}</strong>
                      </div>
                      <div>
                        <small>Recent bookings</small>
                        <strong>
                          {memberDetail?.related.bookings?.length ?? "—"}
                        </strong>
                      </div>
                      <div>
                        <small>Profile source</small>
                        <strong>
                          {memberDetail?.source === "live"
                            ? "Live Momence"
                            : "Momence"}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {involvesSession && (
                <div className="context-detail-panel">
                  <div className="context-detail-title">
                    <CalendarDays size={16} />
                    <div>
                      <strong>
                        {hostedTemplate ? "Hosted class" : "Session"}{" "}
                        intelligence
                      </strong>
                      <p>
                        {hostedTemplate
                          ? "Only private hosted classes are requested using types[]=private."
                          : "Select a Momence session to retrieve its schedule, instructor and roster."}
                      </p>
                    </div>
                    {lookupBusy && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                  </div>
                  <Field
                    label={
                      hostedTemplate ? "Select hosted class" : "Select session"
                    }
                    hint="The list is scoped to the Momence host associated with your profile studio."
                  >
                    <MultiSelect
                      module="sessions"
                      value={sessions || []}
                      onChange={(v) => void selectSessions(v)}
                      closeOnSelect
                      studio={user?.studio || undefined}
                      sessionTypes={hostedTemplate ? ["private"] : undefined}
                      placeholder={
                        hostedTemplate
                          ? "Search private hosted classes…"
                          : "Search classes by name, instructor or date…"
                      }
                    />
                  </Field>
                  {sessions?.[0] && (
                    <div className="context-facts">
                      <div>
                        <small>Session</small>
                        <strong>{sessions[0].label}</strong>
                      </div>
                      <div>
                        <small>Starts</small>
                        <strong>
                          {sessionDetail
                            ? indiaDate(sessionDetail.item.raw.startsAt)
                            : display(form.incidentAt)}
                        </strong>
                      </div>
                      <div>
                        <small>Instructor</small>
                        <strong>{display(form.trainer)}</strong>
                      </div>
                      <div>
                        <small>Studio</small>
                        <strong>{display(form.studio)}</strong>
                      </div>
                      <div>
                        <small>Capacity</small>
                        <strong>
                          {display(sessionDetail?.item.raw.capacity)}
                        </strong>
                      </div>
                      <div>
                        <small>Roster records</small>
                        <strong>
                          {sessionDetail?.related.bookings?.length ?? "—"}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
            <section className="form-section">
              <h3>
                <span className="step-number">1</span>What is this?
              </h3>
              <div className="form-grid">
                <Field label="Entry type">
                  <OptionSelect
                    options={[
                      "issue",
                      "request",
                      "feedback",
                      "compliment",
                      "assessment",
                    ]}
                    value={String(form.kind || "issue")}
                    format={niceKey}
                    clearable={false}
                    onChange={(v) => {
                      set("kind", String(v));
                      if (v === "compliment") set("sentiment", "positive");
                    }}
                  />
                </Field>
                <Field label="Sentiment">
                  <OptionSelect
                    options={["neutral", "positive", "frustrated", "negative"]}
                    value={String(form.sentiment || "neutral")}
                    format={niceKey}
                    clearable={false}
                    onChange={(v) => set("sentiment", String(v))}
                  />
                </Field>
                <Field label="Category">
                  <OptionSelect
                    disabled={Boolean(template)}
                    options={Object.keys(config.taxonomy)}
                    value={String(form.category || "")}
                    clearable={false}
                    onChange={(v) => {
                      set("category", String(v));
                      set("subcategory", config.taxonomy[String(v)]?.[0]);
                    }}
                  />
                </Field>
                <Field label="Subcategory">
                  <OptionSelect
                    disabled={Boolean(template)}
                    options={config.taxonomy[String(form.category)] || []}
                    value={String(form.subcategory || "")}
                    clearable={false}
                    onChange={(v) => set("subcategory", String(v))}
                  />
                </Field>
              </div>
              <InvolvedTeams
                lead={leadDept}
                value={involvedTeams}
                suggested={suggestedTeams}
                onChange={setTeamPick}
              />
            </section>
            <section className="form-section">
              <h3>
                <span className="step-number">2</span>Reporter &amp; feedback
                source
              </h3>
              <div className="reporter-lock">
                <Avatar name={user?.name || "Team member"} tone="purple" />
                <div className="grow">
                  <small>REPORTER · AUTO-FILLED</small>
                  <strong>{user?.name || "Signed-in team member"}</strong>
                  <p>{user?.email || "Authenticated workspace identity"}</p>
                </div>
                <Badge tone="green">
                  <LockKeyhole size={10} />
                  Read only
                </Badge>
              </div>
              <div className="form-grid">
                <Field label="How the feedback reached the team" wide>
                  <OptionSelect
                    options={[...REPORTED_BY_OPTIONS]}
                    value={reportedBy}
                    clearable={false}
                    onChange={(v) => setReportedBy(String(v))}
                  />
                </Field>
              </div>
            </section>
            {classSection && (
              <section className="form-section">
                <h3>
                  <span className="step-number">3</span>Class &amp; trainer
                </h3>
                <div className="stack">
                  <Field
                    label="Class format"
                    hint="Pre-populated with every studio format."
                  >
                    <MultiSelect
                      module="formats"
                      value={formats}
                      onChange={pickFormats}
                      placeholder="e.g. Studio Hosted Class, Studio Barre 57…"
                    />
                  </Field>
                  <Field
                    label="Trainer(s) involved"
                    hint="Select one or more — useful for co-taught or covered classes."
                  >
                    <MultiSelect
                      module="trainers"
                      value={trainers}
                      onChange={pickTrainers}
                      multi
                      placeholder="Search trainers…"
                    />
                  </Field>
                  {hostedTemplate && (
                    <div className="card card-pad" style={{ padding: 14 }}>
                      <div className="between" style={{ marginBottom: 10 }}>
                        <div>
                          <h4 style={{ marginBottom: 4 }}>
                            Hosted attendees{" "}
                            <span className="ifield-req">Required</span>
                          </h4>
                          <p className="muted" style={{ fontSize: 10 }}>
                            Auto-loaded from the selected hosted class. Every
                            attendee row needs a status and a comment. No class
                            in Momence? Add each attendee by hand.
                          </p>
                        </div>
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() =>
                            setHostedAttendees((a) => [
                              ...a,
                              {
                                key: crypto.randomUUID(),
                                bookingId: "",
                                sessionId: String(sessions?.[0]?.id || ""),
                                sessionName: String(
                                  sessions?.[0]?.label || "Manual",
                                ),
                                attendee: "",
                                status: "follow_up",
                                comments: "",
                                details: "",
                              },
                            ])
                          }
                        >
                          Add attendee
                        </button>
                      </div>
                      {hostedBusy && (
                        <div
                          className="muted"
                          style={{ fontSize: 11, marginBottom: 8 }}
                        >
                          Loading attendee roster from Momence…
                        </div>
                      )}
                      {hostedAttendees.length === 0 ? (
                        <div className="info-box">
                          <span>
                            Turn on &ldquo;Involves a session&rdquo; and pick
                            the hosted class to load everyone who booked, or add
                            each attendee by hand. At least one row is required.
                          </span>
                        </div>
                      ) : (
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>ATTENDEE</th>
                                <th>SESSION</th>
                                <th>STATUS</th>
                                <th>COMMENTS *</th>
                                <th>DETAILS</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {hostedAttendees.map((row, idx) => (
                                <tr key={row.key}>
                                  <td>
                                    <input
                                      value={row.attendee}
                                      onChange={(e) =>
                                        setHostedAttendees((a) =>
                                          a.map((x, i) =>
                                            i === idx
                                              ? {
                                                  ...x,
                                                  attendee: e.target.value,
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                      placeholder="Attendee name"
                                    />
                                  </td>
                                  <td>
                                    <small>{row.sessionName}</small>
                                  </td>
                                  <td>
                                    <select
                                      value={row.status}
                                      onChange={(e) =>
                                        setHostedAttendees((a) =>
                                          a.map((x, i) =>
                                            i === idx
                                              ? {
                                                  ...x,
                                                  status: e.target
                                                    .value as HostedAttendee["status"],
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                    >
                                      <option value="attended">Attended</option>
                                      <option value="no_show">No-show</option>
                                      <option value="cancelled">
                                        Cancelled
                                      </option>
                                      <option value="follow_up">
                                        Needs follow-up
                                      </option>
                                    </select>
                                  </td>
                                  <td>
                                    <input
                                      value={row.comments}
                                      required
                                      aria-invalid={
                                        !row.comments.trim() || undefined
                                      }
                                      aria-label={`Required comment for ${row.attendee || "member"}`}
                                      onChange={(e) =>
                                        setHostedAttendees((a) =>
                                          a.map((x, i) =>
                                            i === idx
                                              ? {
                                                  ...x,
                                                  comments: e.target.value,
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                      placeholder="What happened / feedback"
                                    />
                                  </td>
                                  <td>
                                    <input
                                      value={row.details}
                                      onChange={(e) =>
                                        setHostedAttendees((a) =>
                                          a.map((x, i) =>
                                            i === idx
                                              ? {
                                                  ...x,
                                                  details: e.target.value,
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                      placeholder="Package interest, conversion, notes"
                                    />
                                  </td>
                                  <td>
                                    <button
                                      className="text-btn"
                                      type="button"
                                      onClick={() =>
                                        setHostedAttendees((a) =>
                                          a.filter((_, i) => i !== idx),
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {hostedError && !hostedBusy && (
                        <div
                          className="hroster-blocker"
                          role="alert"
                          style={{ marginTop: 10 }}
                        >
                          {hostedError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}
            <section className="form-section">
              <h3>
                <span className="step-number">{classSection ? 4 : 3}</span>Where
                &amp; when
              </h3>
              <div className="form-grid">
                <Field label="Studio *">
                  <OptionSelect
                    options={config.studios}
                    value={String(form.studio || "")}
                    placeholder="Choose studio"
                    onChange={(v) => set("studio", String(v))}
                  />
                </Field>
                <Field label="When did this happen? *">
                  <input
                    value={String(form.incidentAt || "")}
                    onChange={(e) => set("incidentAt", e.target.value)}
                    placeholder="Today, or an exact date and time"
                  />
                </Field>
              </div>
            </section>
            <section className="form-section">
              <h3>
                <span className="step-number">{classSection ? 5 : 4}</span>The
                details
              </h3>
              <div className="form-grid">
                <Field
                  label={
                    recordOnly
                      ? "What happened / what was shared *"
                      : "Describe what you saw or were told *"
                  }
                  wide
                  hint="Use their own words wherever you can."
                >
                  <textarea
                    rows={4}
                    value={String(form.description || "")}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder={
                      recordOnly
                        ? "Share what made the moment worth logging…"
                        : "What happened, what was expected, and what actually occurred…"
                    }
                  />
                </Field>
                {!recordOnly &&
                  !template?.fields.some((f) => f.id === "impact") && (
                    <Field label="Impact">
                      <OptionSelect
                        options={[
                          "Minor inconvenience",
                          "Affected the experience",
                          "Class or service unavailable",
                          "Safety concern",
                        ]}
                        value={String(form.impact || "")}
                        placeholder="Select impact"
                        onChange={(v) => set("impact", String(v))}
                      />
                    </Field>
                  )}
                {!recordOnly && (
                  <Field label="Requested outcome" wide>
                    <textarea
                      rows={2}
                      value={String(form.requestedResolution || "")}
                      onChange={(e) =>
                        set("requestedResolution", e.target.value)
                      }
                      placeholder="What would a good resolution look like?"
                    />
                  </Field>
                )}
              </div>
            </section>
            {template?.fields.length ? (
              <section className="form-section">
                <h3>
                  <span className="step-number">{classSection ? 6 : 5}</span>
                  Template specifics
                  {score !== null && <Badge tone="blue">Score {score}%</Badge>}
                </h3>
                <div className="form-grid">
                  {template.fields.map((f) => {
                    const skipped = skippedFields.has(f.id);
                    return (
                      <div
                        className={
                          "template-field-wrap" + (skipped ? " skipped" : "")
                        }
                        key={f.id}
                      >
                        <button
                          type="button"
                          className={"ifield-skip" + (skipped ? " on" : "")}
                          role="switch"
                          aria-checked={skipped}
                          onClick={() =>
                            setSkippedFields((current) => {
                              const next = new Set(current);
                              if (skipped) next.delete(f.id);
                              else next.add(f.id);
                              return next;
                            })
                          }
                        >
                          <EyeOff size={10} />
                          {skipped ? "Skipped" : "Skip field"}
                        </button>
                        {skipped ? (
                          <div className="ifield-skipped-note">
                            <EyeOff size={14} />
                            This template field will not block ticket creation.
                          </div>
                        ) : (
                          <StructuredInput
                            field={f}
                            value={custom[f.id]}
                            onChange={(v) =>
                              setCustom((c) => ({ ...c, [f.id]: v }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section className="form-section">
              <h3>
                <Paperclip size={15} /> Attachments &amp; voice notes
              </h3>
              <p className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
                Add supporting documents, images, spreadsheets, audio, or voice
                recordings.
              </p>
              <div className="flex-row">
                <FileUpload
                  files={attachments}
                  onFilesSelected={setAttachments}
                  maxFiles={8}
                />
                <span className="muted" style={{ fontSize: 10 }}>
                  {attachments.length
                    ? `${attachments.length} attached`
                    : "Up to 8 files"}
                </span>
              </div>
              <AttachmentPreviewList
                files={attachments}
                onRemove={(id) =>
                  setAttachments((current) =>
                    current.filter((file) => file.id !== id),
                  )
                }
              />
            </section>
          </div>
          <aside className="stack">
            <div className="form-aside">
              <div className="eyebrow">WHY THIS HELPS OPS</div>
              <h3 style={{ fontSize: 16, marginTop: 10 }}>
                Less typing.
                <br />
                More accurate routing.
              </h3>
              <ul className="checklist" style={{ marginTop: 19 }}>
                {[
                  "Member & class auto-fill from Momence",
                  "Multi-select for co-taught classes",
                  "Category-specific guided fields",
                  "Automatic owner, department & SLA",
                  "Review before anything is filed",
                ].map((s) => (
                  <li key={s}>
                    <CheckCircle2 size={13} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            {recordOnly && (
              <div className="info-box">
                <Sparkles size={14} />
                <span>
                  Record-only entry. No response deadline or resolution
                  required.
                </span>
              </div>
            )}
            <div className="info-box">
              <LockKeyhole size={14} />
              <span>
                Resolution notes stay private to the assigned staff member.
              </span>
            </div>
            {template?.provenance && (
              <div style={{ fontSize: 10 }} className="muted">
                {template.provenance}.<br />
                <a
                  className="text-btn"
                  href="https://github.com/Jimmeey23/Athena-Ai"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 10 }}
                >
                  View source workflow ↗
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

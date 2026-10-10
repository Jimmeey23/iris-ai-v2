"use client";
import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  ShieldCheck,
  LockKeyhole,
  Clock3,
  Tag,
  Send,
  Loader2,
  PencilLine,
  Save,
  Users,
  CalendarDays,
  Wrench,
  MapPin,
  EyeOff,
  Paperclip,
} from "lucide-react";
import {
  CategoryArt,
  HeroBackdrop,
  SentimentArt,
  CATEGORY_TONE,
} from "./ticket-art";
import {
  Modal,
  api,
  useApp,
  Field,
  Avatar,
  Badge,
  Priority,
  Switch,
} from "./ui";
import { MultiSelect } from "./multi-select";
import { OptionSelect } from "./intake/option-select";
import type {
  AdvancedDraft,
  GuidedTemplate,
  StructuredField,
  TicketInput,
  PickerOption,
} from "@/lib/ticket-contract";
import { CATEGORY_DEPARTMENT, CATEGORY_MAP, STUDIOS, REPORTED_BY_OPTIONS } from "@/lib/constants";
import { display, object, indiaDate, niceKey } from "@/lib/display";
import { scoreAssessment } from "@/lib/guided-templates";
import { AttachmentPreviewList, FileUpload, type UploadedFile } from "./file-upload";
import {hostedFeedbackError, isHostedClassTicket} from '@/lib/hosted-feedback';
import { InvolvedTeams, suggestTeams } from "./intake/involved-teams";

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
type MomenceDetail = {
  item: {
    id: string;
    name: string;
    subtitle: string;
    raw: Record<string, unknown>;
  };
  related: Record<string, Record<string, unknown>[]>;
  source: string;
  errors?: string[];
};

export function DraftDocument({
  draft,
  onEdit,
}: {
  draft: AdvancedDraft;
  onEdit?: () => void;
}) {
  const cf = object(draft.customFields);
  const meta = object(cf._brief); // The form intake records the question each answer came from; use it over a prettified key.
  const intakeLabels = object(object(cf._intake).labels) as Record<
    string,
    string
  >;
  const checklist = draft.opsChecklist || (meta.opsChecklist as string[]) || [];
  const value = (label: string, v: unknown) => (
    <div className="draft-value">
      <small>{label}</small>
      <p>{display(v)}</p>
    </div>
  );
  const tone = CATEGORY_TONE[draft.category] || "accent";
  const memberRelated = Boolean(
    draft.momenceMemberId ||
    draft.memberEmail ||
    draft.memberPhone ||
    (draft.memberName &&
      !/studio team observation|internal report/i.test(draft.memberName)),
  );
  const answeredSignals = Object.entries(cf).filter(([key, value]) => !key.startsWith('_') && display(value) !== '—').length;
  const prioritySignal = {low: 28, medium: 52, high: 76, critical: 100}[draft.priority] || 50;
  const intelligenceSignals = [
    {label: 'Context captured', value: Math.min(100, 34 + answeredSignals * 7)},
    {label: 'Operational urgency', value: prioritySignal},
    {label: 'Action readiness', value: Math.min(100, 40 + checklist.length * 12)},
    {label: 'Linked evidence', value: draft.momenceMemberId || draft.momenceSessionId ? 88 : memberRelated ? 62 : 38},
  ];
  return (
    <div className="draft-document" data-tone={tone}>
      <div className="draft-cover">
        <HeroBackdrop tone={tone} />
        <CategoryArt category={draft.category} className="draft-cover-art" />
        <div className="between">
          <div className="eyebrow">
            <Sparkles size={12} />{" "}
            {onEdit ? "Review before filing" : "Ticket record"}
          </div>
          {onEdit && (
            <button className="text-btn" onClick={onEdit}>
              <PencilLine size={12} />
              Edit details
            </button>
          )}
        </div>
        <h2>{draft.title}</h2>
        <p>{draft.summary}</p>
        <div className="draft-badges">
          <Badge tone="blue">{draft.kind || "Issue"}</Badge>
          <Priority priority={draft.priority} />
          <Badge tone={draft.resolutionRequired ? "amber" : "green"}>
            <Clock3 size={10} />
            {draft.slaHours
              ? `${draft.slaHours}h follow-up target`
              : "No SLA required"}
          </Badge>
          {draft.momenceMemberId && (
            <Badge tone="green">
              <CheckCircle2 size={10} />
              Momence-linked
            </Badge>
          )}
        </div>
        <div className="draft-facts">
          {[
            { k: "Owner", v: draft.assignedStaffName },
            { k: "Department", v: draft.departmentName },
            { k: "Severity", v: draft.severity },
            { k: "Studio", v: draft.studio?.split(",")[0] },
            { k: "Sentiment", v: niceKey(draft.sentiment || "neutral") },
          ]
            .filter((f) => f.v)
            .map((f) => (
              <div className="draft-fact" key={f.k}>
                <small>{f.k}</small>
                <strong>{display(f.v)}</strong>
              </div>
            ))}
        </div>
      </div>
      <div className="draft-body">
        <section className="draft-signal-panel" aria-label="IRIS decision signals">
          <div className="draft-signal-head"><div><span className="eyebrow"><Sparkles size={11}/> IRIS analysis</span><h3>Decision signals</h3></div><small>Grounded in the submitted answers and linked records</small></div>
          <div className="draft-signal-grid">{intelligenceSignals.map(signal => <div key={signal.label}><span><b>{signal.label}</b><em>{signal.value}%</em></span><i><u style={{width: `${signal.value}%`}}/></i></div>)}</div>
        </section>
        <section className="draft-block">
          <h3>01 / Reporter &amp; operational context</h3>
          <div className="draft-grid">
            {memberRelated && value("Community member", draft.memberName)}
            {memberRelated &&
              draft.memberEmail &&
              value("Member email", draft.memberEmail)}
            {memberRelated &&
              draft.memberPhone &&
              value("Member phone", draft.memberPhone)}
            {memberRelated &&
              draft.preferredContact &&
              value("Member follow-up preference", draft.preferredContact)}
            {value("Studio Space", draft.studio)}
            {value(
              "Reported occurrence",
              draft.incidentAt ? indiaDate(draft.incidentAt) : undefined,
            )}
            {draft.classFormat &&
              value("Signature Experience", draft.classFormat)}
            {draft.trainer && value("Studio Instructor(s)", draft.trainer)}
            {memberRelated &&
              draft.membership &&
              value("Community access package", draft.membership)}
          </div>
        </section>
        <section className="draft-block draft-block-narrative">
          <h3>02 / Member voice &amp; incident brief</h3>
          <p className="draft-narrative">{draft.description}</p>
          {draft.impact && (
            <div className="info-box" style={{ marginTop: 13 }}>
              <span>
                <strong>Stated impact:</strong> {draft.impact}
              </span>
            </div>
          )}
        </section>
        <section className="draft-block">
          <h3>03 / Classification &amp; linked records</h3>
          <div className="draft-grid">
            {value("Category", draft.category)}
            {value("Sub-category", draft.subcategory)}
            {value("Member sentiment", draft.sentiment)}
            {value("Intake source", draft.source)}
            {draft.momenceMemberId &&
              value("Momence member ID", draft.momenceMemberId)}
            {draft.momenceSessionId &&
              value("Momence session ID", draft.momenceSessionId)}
          </div>
        </section>
        {Object.keys(cf).filter(
          (k) =>
            !k.startsWith("_") &&
            k !== "sessionContext" &&
            cf[k] !== "" &&
            typeof cf[k] !== "object",
        ).length > 0 && (
          <section className="draft-block">
            <h3>04 / Supporting intelligence</h3>
            <div className="draft-grid">
              {Object.entries(cf)
                .filter(
                  ([k, v]) =>
                    !k.startsWith("_") &&
                    k !== "sessionContext" &&
                    v !== "" &&
                    typeof v !== "object",
                )
                .map(([k, v]) => (
                  <div key={k}>{value(intakeLabels[k] || niceKey(k), v)}</div>
                ))}
            </div>
          </section>
        )}
        <section className="draft-block draft-block-service">
          <h3>05 / Service commitment</h3>
          <div className="draft-grid">
            {value("Priority", draft.priority)}
            {value("Severity", draft.severity)}
            {value(
              "Follow-up target",
              draft.slaLabel ||
                (draft.slaHours ? draft.slaHours + " hours" : "Not required"),
            )}
            {value(
              "Action pathway",
              draft.resolutionRequired ? "Resolution required" : "Record only",
            )}
          </div>
          <div className="draft-sentiment">
            <SentimentArt sentiment={draft.sentiment || "neutral"} />
            <p>
              {draft.impact ? (
                <>
                  <strong>Journey impact:</strong> {draft.impact}
                </>
              ) : (
                "No journey impact was recorded."
              )}
            </p>
          </div>
          {memberRelated && draft.memberFacingUpdate && (
            <div className="draft-quote">
              <small>Member-facing update</small>
              <p>{draft.memberFacingUpdate}</p>
            </div>
          )}
        </section>
        <section className="draft-block draft-block-routing">
          <h3>06 / Ownership &amp; next actions</h3>
          <div className="draft-routing">
            <Avatar name={draft.assignedStaffName} tone="purple" />
            <div className="grow">
              <strong>{draft.assignedStaffName}</strong>
              <p>
                {draft.departmentName}
                {draft.assignedStaffRole ? " · " + draft.assignedStaffRole : ""}
              </p>
            </div>
            <Badge tone="blue">Auto-routed</Badge>
          </div>
          <p className="muted" style={{ fontSize: 10, marginTop: 8 }}>
            {draft.routingReason || display(meta.routingReason)}
          </p>
          {draft.requestedResolution && (
            <p className="draft-narrative" style={{ marginTop: 13 }}>
              <strong>Requested outcome:</strong> {draft.requestedResolution}
            </p>
          )}
          {checklist.length > 0 && (
            <ul className="checklist" style={{ marginTop: 16 }}>
              {checklist.map((c, i) => (
                <li key={i}>
                  <Check size={13} />
                  {c}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="draft-block draft-block-tags">
          <h3>Tags &amp; indexing</h3>
          <div className="flex-row wrap">
            {draft.tags.map((t) => (
              <span className="tag" key={t}>
                <Tag size={9} />
                {t}
              </span>
            ))}
          </div>
        </section>
        <div className="info-box">
          <LockKeyhole size={15} />
          <span>
            {draft.resolutionRequired
              ? "Resolution notes are private and visible only to the assigned owner."
              : "This is a record-only entry. No SLA, resolution or follow-up task is required."}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TicketComposer({
  open,
  onClose,
  template,
  initial,
  onCreated,
  draftId,
  onDraftsChanged,
}: {
  open: boolean;
  onClose: () => void;
  template?: GuidedTemplate;
  initial?: Partial<TicketInput> & {
    reportedBy?: string;
    involvesMember?: boolean;
    involvesSession?: boolean;
  };
  onCreated?: (id: number) => void;
  draftId?: number;
  onDraftsChanged?: () => void;
}) {
  const { notify, user } = useApp();
  const [step, setStep] = useState<"details" | "review">("details"),
    [form, setForm] = useState<Record<string, unknown>>({}),
    [custom, setCustom] = useState<Record<string, unknown>>({}),
    [draft, setDraft] = useState<AdvancedDraft>(),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [lookupBusy, setLookupBusy] = useState(false),
    [error, setError] = useState(""),
    [reportedBy, setReportedBy] = useState(REPORTED_BY_OPTIONS[0] as string),
    [involvesMember, setInvolvesMember] = useState(false),
    [involvesSession, setInvolvesSession] = useState(false),
    [requiresResolution, setRequiresResolution] = useState(true),
    [member, setMember] = useState<PickerOption>(),
    [memberDetail, setMemberDetail] = useState<MomenceDetail>(),
    [sessionDetail, setSessionDetail] = useState<MomenceDetail>(),
    [sessions, setSessions] = useState<PickerOption[]>(),
    [trainers, setTrainers] = useState<PickerOption[]>([]),
    [formats, setFormats] = useState<PickerOption[]>([]),
    [hostedAttendees, setHostedAttendees] = useState<HostedAttendee[]>([]),
    [hostedBusy, setHostedBusy] = useState(false);
  const [key, setKey] = useState("");
  const [skippedFields, setSkippedFields] = useState<Set<string>>(new Set());
  // Co-owning teams: the suggestion stands until the reporter touches the chips.
  const [teamPick, setTeamPick] = useState<string[] | null>(null);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [config, setConfig] = useState({
    taxonomy: CATEGORY_MAP,
    studios: STUDIOS.map((s) => s.name) as string[],
  });
  const isClass = involvesSession;
  const recordOnly = !requiresResolution;
  const memberInvolved = involvesMember;
  // Both hosted-class ticket types carry a required attendee roster, whichever way they were
  // opened (the guided template, or the category picked by hand).
  const hostedTemplate = isHostedClassTicket(
    String(form.category || template?.category || ""),
    String(form.subcategory || template?.subcategory || ""),
  );
  const classSection = isClass || hostedTemplate;
  const hostedError = hostedTemplate
    ? hostedBusy
      ? "Wait for the selected hosted class roster to finish loading."
      : hostedFeedbackError(
          String(form.category || ""),
          String(form.subcategory || ""),
          hostedAttendees,
        )
    : null;
  const leadDept = CATEGORY_DEPARTMENT[String(form.category || "")] || null;
  const suggestedTeams = suggestTeams({
    category: String(form.category || ""),
    sub: String(form.subcategory || ""),
    memberInvolved: involvesMember,
    text: String(form.description || ""),
  }).filter((t) => t !== leadDept);
  const involvedTeams = (teamPick ?? suggestedTeams).filter((t) => t !== leadDept);
  // Every open (or a different template/draft) starts from the prefill. Applied while
  // rendering rather than in an effect, so the previous ticket's state never paints
  // and nothing downstream sees an intermediate empty form.
  const prefillKey = open
    ? [template?.id, draftId, user?.name, user?.email].join("|")
    : "";
  const [prefilledFor, setPrefilledFor] = useState("");
  if (prefilledFor !== prefillKey) {
    setPrefilledFor(prefillKey);
    if (open) {
      const savedMember = Boolean(
        initial?.involvesMember || initial?.momenceMemberId,
      );
      const savedSession = Boolean(
        initial?.involvesSession || initial?.momenceSessionId,
      );
      const savedResolution = initial?.resolutionRequired !== false;
      setForm({
        category: template?.category || "Scheduling",
        subcategory: template?.subcategory || "Time Change",
        kind: template?.kind || "issue",
        description: "",
        incidentAt: "Today",
        preferredContact: "No follow-up needed",
        sentiment: template?.kind === "compliment" ? "positive" : "neutral",
        memberName: savedMember ? "" : "Studio team observation",
        memberEmail: "",
        resolutionRequired: savedResolution,
        ...initial,
      });
      setCustom({
        ...initial?.customFields,
        reporterName: user?.name || "Signed-in team member",
        reporterEmail: user?.email || "",
      });
      setStep("details");
      setSkippedFields(new Set());
      setTeamPick(
        Array.isArray(initial?.involvedTeams) ? initial.involvedTeams : null,
      );
      setAttachments([]);
      setDraft(undefined);
      setError("");
      setInvolvesMember(savedMember);
      setInvolvesSession(savedSession);
      setRequiresResolution(savedResolution);
      setMember(
        initial?.momenceMemberId && initial.memberName
          ? {
              id: initial.momenceMemberId,
              label: initial.memberName,
              sublabel: initial.memberEmail || undefined,
            }
          : undefined,
      );
      setMemberDetail(undefined);
      setSessionDetail(undefined);
      setSessions(
        initial?.momenceSessionId && initial.classFormat
          ? [{ id: initial.momenceSessionId, label: initial.classFormat }]
          : undefined,
      );
      // Seed the pickers from what was saved, so reopening a draft (or a prefilled
      // template) shows its trainers and formats instead of silently dropping them.
      const asOptions = (v: unknown, sep: string) =>
        String(v || "")
          .split(sep)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => ({ id: x, label: x }));
      setTrainers(asOptions(initial?.trainer, ","));
      setFormats(
        initial?.momenceSessionId ? [] : asOptions(initial?.classFormat, " + "),
      );
      const savedAttendees = initial?.customFields?.hostedAttendees;
      setHostedAttendees(
        Array.isArray(savedAttendees) ? (savedAttendees as HostedAttendee[]) : [],
      );
      setReportedBy(
        initial?.reportedBy ||
          String(initial?.customFields?.reportedBy || REPORTED_BY_OPTIONS[0]),
      );
      setKey(crypto.randomUUID());
    }
  }
  useEffect(() => {
    if (!open) return;
    void api<typeof config>("/api/settings?scope=public")
      .then((d) => setConfig(d))
      .catch(() => {});
  }, [open]);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  /** Trainers feed two fields: the display string on the ticket and the list in
   *  customFields. Written together when the user picks, never on mount. */
  function pickTrainers(opts: PickerOption[]) {
    setTrainers(opts);
    set("trainer", opts.map((t) => t.label).join(", ") || undefined);
    setCustom((c) => ({ ...c, trainersInvolved: opts.map((t) => t.label) }));
  }
  /** A linked Momence session names the class itself; the format picker only fills
   *  in the class format when there isn't one. */
  function pickFormats(opts: PickerOption[]) {
    setFormats(opts);
    if (!sessions?.length)
      set("classFormat", opts.map((f) => f.label).join(" + ") || undefined);
  }
  // Hosted attendees live in their own state while editing and join customFields
  // only when the ticket is previewed or saved.
  const unskippedCustom = Object.fromEntries(Object.entries(custom).filter(([id]) => !skippedFields.has(id)));
  const customFields = hostedTemplate ? { ...unskippedCustom, hostedAttendees } : unskippedCustom;
  async function selectMember(opts: PickerOption[]) {
    const o = opts[0];
    if (!o) return;
    setMember(o);
    setLookupBusy(true);
    try {
      const d = await api<MomenceDetail>(
        `/api/momence?module=members&id=${encodeURIComponent(String(o.id))}`,
      );
      const raw = object(d.item.raw),
        membership = d.related.memberships?.[0];
      setMemberDetail(d);
      set("memberName", d.item.name);
      set("memberEmail", String(raw.email || ""));
      set("memberPhone", String(raw.phoneNumber || ""));
      set("momenceMemberId", String(o.id));
      set(
        "membership",
        membership
          ? display(membership.name || object(membership.membership).name)
          : undefined,
      );
      set("momenceContext", {
        member: d.item,
        memberships: d.related.memberships || [],
        bookings: d.related.bookings || [],
        notes: d.related.notes || [],
        source: d.source,
      });
      notify("Member profile and related Momence history added.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }
  async function hydrateHostedAttendees(opts: PickerOption[]) {
    if (!hostedTemplate || !opts.length) {
      setHostedAttendees([]);
      return;
    }
    setHostedBusy(true);
    try {
      const details = await Promise.all(
        opts.map(async (o) => {
          const d = await api<{
            related?: { bookings?: Record<string, unknown>[] };
          }>(
            `/api/momence?module=sessions&id=${encodeURIComponent(String(o.id))}`,
          );
          return { option: o, bookings: d.related?.bookings || [] };
        }),
      );
      const rows: HostedAttendee[] = [];
      for (const d of details) {
        for (const b of d.bookings) {
          const member = object(b.member);
          const memberName = display(
            member.name ||
              [member.firstName, member.lastName].filter(Boolean).join(" "),
          );
          if (memberName === "—") continue;
          const cancelled = Boolean(b.cancelledAt);
          rows.push({
            key: `${d.option.id}:${String(b.id || member.id || memberName)}`,
            bookingId: String(b.id || ""),
            sessionId: String(d.option.id),
            sessionName: d.option.label,
            attendee: memberName,
            status: cancelled
              ? "cancelled"
              : Boolean(b.checkedIn)
                ? "attended"
                : "follow_up",
            comments: "",
            details: "",
          });
        }
      }
      setHostedAttendees(rows);
    } catch {
      setHostedAttendees([]);
    } finally {
      setHostedBusy(false);
    }
  }
  async function selectSessions(opts: PickerOption[]) {
    setSessions(opts);
    const first = opts[0];
    if (!first) {
      set("classFormat", formats.map((f) => f.label).join(" + ") || undefined);
      set("momenceSessionId", undefined);
      setSessionDetail(undefined);
      setHostedAttendees([]);
      return;
    }
    setLookupBusy(true);
    try {
      const d = await api<MomenceDetail>(
        `/api/momence?module=sessions&id=${encodeURIComponent(String(first.id))}`,
      );
      setSessionDetail(d);
      const raw = object(d.item.raw);
      set("classFormat", opts.map((o) => o.label).join(" + "));
      set(
        "studio",
        display(raw.inPersonLocation) !== "—"
          ? display(raw.inPersonLocation)
          : form.studio,
      );
      set("incidentAt", String(raw.startsAt || form.incidentAt));
      set("momenceSessionId", String(first.id));
      setCustom((c) => ({
        ...c,
        sessionContext: {
          ...raw,
          bookings: d.related.bookings || [],
          source: d.source,
        },
      }));
      const trainerNames = [display(raw.teacher)].filter((t) => t && t !== "—");
      if (trainerNames.length)
        pickTrainers(trainerNames.map((t) => ({ id: t, label: t })));
      void hydrateHostedAttendees(opts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }
  async function review() {
    if (hostedError) { setError(hostedError); return; }
    if (memberInvolved && !String(form.momenceMemberId || "")) {
      setError("Link the community member from Momence before continuing.");
      return;
    }
    // A hosted class that is not in Momence is recorded from its hand-added roster instead.
    if (involvesSession && !hostedTemplate && !String(form.momenceSessionId || "")) {
      setError("Link the Momence session before continuing.");
      return;
    }
    const missingTemplate =
      template?.fields.filter((f) => {
        const v = customFields[f.id];
        return Boolean(
          f.required && !skippedFields.has(f.id) &&
          (v === undefined ||
            v === null ||
            v === "" ||
            (Array.isArray(v) && !v.length)),
        );
      }) || [];
    if (missingTemplate.length) {
      setError(
        `Complete ${missingTemplate.map((f) => f.label).join(", ")} before building the ticket.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await api<{ draft: AdvancedDraft }>(
        "/api/tickets?preview=true",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            resolutionRequired: requiresResolution,
            customFields: { ...customFields, reportedBy },
            involvedTeams: involvedTeams.length ? involvedTeams : undefined,
            templateId: template?.id,
            source: template ? "template" : "manual",
            submissionKey: key,
          }),
        },
      );
      setDraft(d.draft);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        resolutionRequired: requiresResolution,
        customFields: { ...customFields, reportedBy },
        involvedTeams: teamPick ?? undefined,
        reportedBy,
        involvesMember,
        involvesSession,
        templateId: template?.id,
        source: template ? "template" : "manual",
      };
      const title = String(
        form.title ||
          template?.title ||
          form.description ||
          "Untitled ticket draft",
      )
        .trim()
        .slice(0, 180);
      await api("/api/drafts", {
        method: draftId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(draftId ? { id: draftId } : {}),
          title,
          templateId: template?.id || null,
          category: String(
            form.category || template?.category || "Uncategorised",
          ),
          subcategory: String(
            form.subcategory || template?.subcategory || "General",
          ),
          payload,
        }),
      });
      notify(
        draftId
          ? "Draft updated."
          : "Draft saved. You can resume it from the template library.",
      );
      onDraftsChanged?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function submit() {
    if (!draft) return;
    const rosterError = hostedFeedbackError(draft.category, draft.subcategory, draft.customFields.hostedAttendees);
    if (rosterError) { setError(rosterError); return; }
    setBusy(true);
    setError("");
    try {
      const d = await api<{ ticket: { id: number; ticketNumber: string } }>(
        "/api/tickets",
        {
          method: "POST",
          body: JSON.stringify({ ...draft, submissionKey: key }),
        },
      );
      if (attachments.some(a => a.file)) {
        const uploadBody = new FormData();
        attachments.forEach(a => { if (a.file) uploadBody.append('files', a.file); });
        const upload = await fetch(`/api/tickets/${d.ticket.id}/resolution/attachments`, {method: 'POST', body: uploadBody});
        if (!upload.ok) throw new Error(`${d.ticket.ticketNumber} was saved, but its attachments could not be uploaded. Retry filing to attach the files to the same ticket.`);
      }
      if (draftId)
        await api(`/api/drafts?id=${draftId}`, { method: "DELETE" }).catch(
          () => {},
        );
      notify(
        `${d.ticket.ticketNumber} logged and assigned to ${draft.assignedStaffName}.`,
      );
      onDraftsChanged?.();
      onCreated?.(d.ticket.id);
      onClose();
      window.dispatchEvent(new Event("iris:tickets-updated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const score = template ? scoreAssessment(template.fields, custom) : null;
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
              disabled={busy || saving || (step === "details" && Boolean(hostedError))}
              title={step === "details" && hostedError ? hostedError : undefined}
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
                    options={["issue", "request", "feedback", "compliment", "assessment"]}
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
                                      aria-invalid={!row.comments.trim() || undefined}
                                      aria-label={`Required comment for ${row.attendee || 'member'}`}
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
                        <div className="hroster-blocker" role="alert" style={{ marginTop: 10 }}>
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
                  <span className="step-number">{classSection ? 6 : 5}</span>Template
                  specifics
                  {score !== null && <Badge tone="blue">Score {score}%</Badge>}
                </h3>
                <div className="form-grid">
                  {template.fields.map((f) => {
                    const skipped = skippedFields.has(f.id);
                    return <div className={'template-field-wrap' + (skipped ? ' skipped' : '')} key={f.id}>
                      <button type="button" className={'ifield-skip' + (skipped ? ' on' : '')} role="switch" aria-checked={skipped} onClick={() => setSkippedFields(current => { const next = new Set(current); if (skipped) next.delete(f.id); else next.add(f.id); return next; })}><EyeOff size={10}/>{skipped ? 'Skipped' : 'Skip field'}</button>
                      {skipped ? <div className="ifield-skipped-note"><EyeOff size={14}/>This template field will not block ticket creation.</div> : <StructuredInput field={f} value={custom[f.id]} onChange={(v) => setCustom((c) => ({ ...c, [f.id]: v }))}/>}
                    </div>;
                  })}
                </div>
              </section>
            ) : null}
            <section className="form-section">
              <h3><Paperclip size={15}/> Attachments &amp; voice notes</h3>
              <p className="muted" style={{fontSize: 11, marginBottom: 10}}>Add supporting documents, images, spreadsheets, audio, or voice recordings.</p>
              <div className="flex-row"><FileUpload files={attachments} onFilesSelected={setAttachments} maxFiles={8}/><span className="muted" style={{fontSize: 10}}>{attachments.length ? `${attachments.length} attached` : 'Up to 8 files'}</span></div>
              <AttachmentPreviewList files={attachments} onRemove={id => setAttachments(current => current.filter(file => file.id !== id))}/>
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
function StructuredInput({
  field,
  value,
  onChange,
}: {
  field: StructuredField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "multiselect" && field.module)
    return (
      <Field
        label={field.label + (field.required ? " *" : "")}
        wide
        hint={field.helper}
      >
        <MultiSelect
          module={field.module}
          multi={field.multi}
          value={Array.isArray(value) ? (value as PickerOption[]) : []}
          onChange={onChange}
        />
      </Field>
    );
  return (
    <Field
      label={field.label + (field.required ? " *" : "")}
      wide={field.type === "textarea"}
      hint={
        field.weight ? `${field.weight}% of weighted evaluation` : field.helper
      }
    >
      {field.type === "rating" ? (
        <div className="rating-buttons">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              className={Number(value) === n ? "active" : ""}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      ) : field.type === "select" ? (
        <OptionSelect
          options={field.options || []}
          value={String(value || "")}
          onChange={(v) => onChange(String(v))}
        />
      ) : field.type === "textarea" ? (
        <textarea
          rows={2}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={field.type}
          min={field.type === "number" ? 0 : undefined}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              field.type === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
    </Field>
  );
}

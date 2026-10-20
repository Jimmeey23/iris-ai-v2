"use client";
import {
CATEGORY_DEPARTMENT,
CATEGORY_MAP,
REPORTED_BY_OPTIONS,
STUDIOS,
} from "@/lib/constants";
import { display,object } from "@/lib/display";
import { scoreAssessment } from "@/lib/guided-templates";
import {
hostedFeedbackError,
isHostedClassTicket,
} from "@/lib/hosted-feedback";
import type {
AdvancedDraft,
GuidedTemplate,
PickerOption,
TicketInput,
} from "@/lib/ticket-contract";
import { useEffect,useState,useRef } from "react";
import { type UploadedFile } from "./file-upload";
import { suggestTeams } from "./intake/involved-teams";
import { TicketComposerView } from "./ticket-composer-view";
import { api,useApp } from "./ui";

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
export function useTicketComposerController({
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
  const memberRequest=useRef(0),sessionRequest=useRef(0);
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
  const involvedTeams = (teamPick ?? suggestedTeams).filter(
    (t) => t !== leadDept,
  );
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
      const savedResolution = initial?.resolutionRequired ?? !['feedback','compliment','assessment'].includes(template?.kind||'issue');
      setForm({
        category: template?.category || "Scheduling",
        subcategory: template?.subcategory || "Time Change",
        kind: template?.kind || "issue",
        description: "",
        incidentAt: "Not recorded",
        preferredContact: "Not provided",
        sentiment: template?.kind === "compliment" ? "positive" : "unknown",
        memberName: "",
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
        Array.isArray(savedAttendees)
          ? (savedAttendees as HostedAttendee[])
          : [],
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
  const set = (k:string,v:unknown)=>{
    if(k==='studio'&&v!==form.studio){memberRequest.current++;sessionRequest.current++;setMember(undefined);setMemberDetail(undefined);setSessions(undefined);setSessionDetail(undefined);setHostedAttendees([]);setForm(f=>({...f,[k]:v,memberName:'',memberEmail:'',memberPhone:'',momenceMemberId:undefined,momenceContext:undefined,membership:undefined,momenceSessionId:undefined,classFormat:undefined,trainer:undefined}));return;}
    setForm(f=>({...f,[k]:v}));
  };
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
  const unskippedCustom = Object.fromEntries(
    Object.entries(custom).filter(([id]) => !skippedFields.has(id)),
  );
  const customFields = hostedTemplate
    ? { ...unskippedCustom, hostedAttendees }
    : unskippedCustom;
  async function selectMember(opts: PickerOption[]) {
    const request=++memberRequest.current;
    const o = opts[0];
    setMemberDetail(undefined);
    setForm(f=>({...f,memberName:o?.label||'',memberEmail:'',memberPhone:'',momenceMemberId:o?.id,momenceContext:undefined,membership:undefined}));
    if (!o){setMember(undefined);return;}
    setMember(o);
    setLookupBusy(true);
    try {
      const d = await api<MomenceDetail>(
        `/api/momence?module=members&id=${encodeURIComponent(String(o.id))}`,
      );
      if(request!==memberRequest.current)return;
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
    const request=++sessionRequest.current;
    setSessionDetail(undefined);
    setForm(f=>({...f,momenceSessionId:undefined,trainer:undefined,classFormat:undefined}));
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
      if(request!==sessionRequest.current)return;
      setSessionDetail(d);
      const raw = object(d.item.raw);
      set("classFormat", opts.map((o) => o.label).join(" + "));
      const location=display(raw.inPersonLocation);
      if(location!=='—'&&form.studio&&location!==form.studio)throw new Error('Choose a session at the selected studio, or change the studio first.');
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
    if (hostedError) {
      setError(hostedError);
      return;
    }
    if (memberInvolved && !String(form.momenceMemberId || "")) {
      setError("Link the member from Momence before continuing.");
      return;
    }
    // A hosted class that is not in Momence is recorded from its hand-added roster instead.
    if (
      involvesSession &&
      !hostedTemplate &&
      !String(form.momenceSessionId || "")
    ) {
      setError("Link the Momence session before continuing.");
      return;
    }
    const missingTemplate =
      template?.fields.filter((f) => {
        const v = customFields[f.id];
        return Boolean(
          f.required &&
            !skippedFields.has(f.id) &&
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
    const rosterError = hostedFeedbackError(
      draft.category,
      draft.subcategory,
      draft.customFields.hostedAttendees,
    );
    if (rosterError) {
      setError(rosterError);
      return;
    }
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
      if (attachments.some((a) => a.file)) {
        const uploadBody = new FormData();
        attachments.forEach((a) => {
          if (a.file) uploadBody.append("files", a.file);
        });
        const upload = await fetch(
          `/api/tickets/${d.ticket.id}/resolution/attachments`,
          { method: "POST", body: uploadBody },
        );
        if (!upload.ok)
          throw new Error(
            `${d.ticket.ticketNumber} was saved, but its attachments could not be uploaded. Retry filing to attach the files to the same ticket.`,
          );
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
  return {
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
  };
}
export function TicketComposer(props: {
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
  const model = useTicketComposerController(props);
  return <TicketComposerView model={model} />;
}

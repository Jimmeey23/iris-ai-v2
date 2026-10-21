"use client";
import { display,indiaDate,niceKey,object } from "@/lib/display";
import type { AdvancedDraft } from "@/lib/ticket-contract";
import {
Check,
CheckCircle2,
Clock3,
LockKeyhole,
PencilLine,
Sparkles,
Tag,
} from "lucide-react";
import {
CATEGORY_TONE,
CategoryArt,
HeroBackdrop,
SentimentArt,
} from "./ticket-art";
import { Avatar,Badge,Priority } from "./ui";
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
  const answeredSignals = Object.entries(cf).filter(
    ([key, value]) => !key.startsWith("_") && display(value) !== "—",
  ).length;
  const prioritySignal =
    { low: 28, medium: 52, high: 76, critical: 100 }[draft.priority] || 50;
  const intelligenceSignals = [
    {
      label: "Context captured",
      value: Math.min(100, 34 + answeredSignals * 7),
    },
    { label: "Operational urgency", value: prioritySignal },
    {
      label: "Action readiness",
      value: Math.min(100, 40 + checklist.length * 12),
    },
    {
      label: "Linked evidence",
      value:
        draft.momenceMemberId || draft.momenceSessionId
          ? 88
          : memberRelated
            ? 62
            : 38,
    },
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
              ? `${draft.slaHours}h resolution target`
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
        <section
          className="draft-signal-panel"
          aria-label="IRIS decision signals"
        >
          <div className="draft-signal-head">
            <div>
              <span className="eyebrow">
                <Sparkles size={11} /> IRIS analysis
              </span>
              <h3>Decision signals</h3>
            </div>
            <small>Grounded in the submitted answers and linked records</small>
          </div>
          <div className="draft-signal-grid">
            {intelligenceSignals.map((signal) => (
              <div key={signal.label}>
                <span>
                  <b>{signal.label}</b>
                  <em>{signal.value}%</em>
                </span>
                <i>
                  <u style={{ width: `${signal.value}%` }} />
                </i>
              </div>
            ))}
          </div>
        </section>
        <section className="draft-block">
          <h3>01 / Reporter &amp; operational context</h3>
          <div className="draft-grid">
            {memberRelated && value("Member", draft.memberName)}
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
              value("Class", draft.classFormat)}
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
            <h3>04 / Supporting details</h3>
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
              "Resolution target",
              draft.slaLabel ||
                (draft.slaHours ? draft.slaHours + " hours" : "Not required"),
            )}
            {value(
              "Action required",
              draft.resolutionRequired ? "Resolution required" : "Record only",
            )}
          </div>
          <div className="draft-sentiment">
            <SentimentArt sentiment={draft.sentiment || "neutral"} />
            <p>
              {draft.impact ? (
                <>
                  <strong>Member impact:</strong> {draft.impact}
                </>
              ) : (
                "No member impact was recorded."
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

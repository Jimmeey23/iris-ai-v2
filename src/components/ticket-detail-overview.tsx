"use client";
import { simpleLanguage } from "@/lib/plain-language";
import {
  ChevronRight,
  FileText,
  Hash,
  Repeat,
  Sparkles,
  Zap,
} from "lucide-react";
import type { useTicketDialogController } from "./ticket-detail-controller";
import styles from "./ticket-detail.module.css";
import {
  ClassSnapshot,
  HostedAttendees,
  ReportedDetails,
} from "./ticket-detail/reported-details";
import { TicketEvidence } from "./ticket-evidence";
import { Badge } from "./ui";
export default function TicketOverviewPanel({
  model,
}: {
  model: ReturnType<typeof useTicketDialogController>;
}) {
  const { t, bundle, setChildId, id } = model;
  if (!t) return null;
  if (!bundle) return null;
  return (
    <div className={styles.caseContent}>
      <div className="td-column">
        <section className="td-case-file">
          <header>
            <span className="td-section-icon">
              <FileText size={17} />
            </span>
            <div>
              <span className="eyebrow">CASE BRIEF</span>
              <h3>What happened</h3>
            </div>
          </header>
          <p className="td-narrative">{t.description || t.summary}</p>
          <div className="td-narrative-tags">
            <span className="td-tag">{simpleLanguage(t.category)}</span>
            <span className="td-tag td-tag-sub">{simpleLanguage(t.subcategory)}</span>
            {t.impact && t.requestedResolution && (
              <span className="td-tag td-tag-impact">
                <Zap size={11} />
                {t.impact}
              </span>
            )}
          </div>
        </section>

        {(t.requestedResolution || t.impact) && (
          <section className="td-outcome-card">
            <span className="td-section-icon">
              <Sparkles size={16} />
            </span>
            <div>
              <span className="eyebrow">
                {t.requestedResolution
                  ? "REQUESTED OUTCOME"
                  : "REPORTED IMPACT"}
              </span>
              <p>{t.requestedResolution || t.impact}</p>
            </div>
          </section>
        )}

        <ReportedDetails ticket={t} />
        <HostedAttendees ticket={t} />
        <ClassSnapshot ticket={t} />

        <TicketEvidence
          files={[
            ...bundle.attachments.map((file) => ({
              ...file,
              url: `/api/tickets/${t.id}/resolution/attachments?attachmentId=${encodeURIComponent(file.id)}`,
            })),
            ...(bundle.conversationAttachments || []).map((file) => ({
              ...file,
              url: `/api/iris/upload?id=${encodeURIComponent(file.id)}`,
            })),
          ]}
        />

        <details className="td-block td-similar-details">
          <summary>
            <span className="td-section-icon td-section-icon-purple">
              <Repeat size={18} />
            </span>
            <span>
              <strong>Similar tickets</strong>
              <small>Same category and subcategory</small>
            </span>
            <Badge>{bundle.similar.length}</Badge>
            <ChevronRight size={15} className="td-details-chevron" />
          </summary>
          <p className="td-block-note">Same category and subcategory.</p>
          <div className="td-similar-list">
            {bundle.similar.map((s) => (
              <button
                className="td-similar-card"
                key={s.id}
                onClick={() => setChildId(s.id)}
              >
                <div className="td-similar-meta">
                  <Hash size={11} />
                  <span>{s.ticketNumber}</span>
                </div>
                <p>{s.title}</p>
                <div className="between">
                  <span
                    className={
                      "td-similar-status " +
                      (s.status === "open"
                        ? "open"
                        : s.status === "resolved"
                          ? "resolved"
                          : "closed")
                    }
                  >
                    {s.status}
                  </span>
                  <ChevronRight size={14} />
                </div>
              </button>
            ))}
            {!bundle.similar.length && (
              <p className="td-empty-line">
                This is the first ticket of its kind.
              </p>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

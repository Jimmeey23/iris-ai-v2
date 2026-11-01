/**
 * The feedback console: everything filed from the in-app Feedback tab, for the
 * developer working through it. Administrators only — a report can quote whatever
 * was on the reporter's screen, screenshots included.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquareWarning,
  Mail,
  MailWarning,
  RefreshCw,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { api, Badge, Empty, Loading, Modal, SearchField, useToast } from "@/components/ui";
import { indiaDate } from "@/lib/display";
import {
  KIND_LABELS,
  SEVERITY_LABELS,
  type FeedbackKind,
  type FeedbackSeverity,
} from "@/lib/feedback-shared";

type Attachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  origin: "screenshot" | "upload";
};
type Report = {
  id: string;
  reference: string;
  kind: string;
  severity: string;
  title: string;
  details: string;
  stepsToReproduce: string | null;
  expected: string | null;
  actual: string | null;
  pagePath: string;
  pageLabel: string | null;
  context: Record<string, unknown>;
  reporterName: string;
  reporterEmail: string | null;
  contactBack: boolean;
  emailStatus: string;
  emailError: string | null;
  status: string;
  createdAt: string;
  attachments: Attachment[];
};

const STATUSES = ["open", "triaged", "fixed", "wont-fix"] as const;
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  triaged: "Triaged",
  fixed: "Fixed",
  "wont-fix": "Won't fix",
};
const SEVERITY_TONE: Record<string, "red" | "amber" | "blue" | "muted"> = {
  blocker: "red",
  high: "amber",
  normal: "blue",
  low: "muted",
};
const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export default function FeedbackConsolePage() {
  const notify = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [developer, setDeveloper] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [active, setActive] = useState<Report>();
  const [busy, setBusy] = useState(false);

  // No synchronous setState here: the flag is only lowered once the request has
  // settled, so this can be called straight from an effect as well as the button.
  const load = useCallback(async () => {
    try {
      const d = await api<{ feedback: Report[]; developer: string }>("/api/feedback?limit=200");
      setReports(d.feedback);
      setDeveloper(d.developer);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Written as a promise chain rather than `void load()` so every state update
    // happens in a callback, well after the effect body has run.
    api<{ feedback: Report[]; developer: string }>("/api/feedback?limit=200")
      .then((d) => {
        setReports(d.feedback);
        setDeveloper(d.developer);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Feedback could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      reports.filter(
        (r) =>
          (!status || r.status === status) &&
          (!severity || r.severity === severity) &&
          (!q ||
            `${r.reference} ${r.title} ${r.details} ${r.pagePath} ${r.reporterName}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [reports, q, status, severity],
  );
  const counts = useMemo(
    () => ({
      open: reports.filter((r) => r.status === "open").length,
      blocking: reports.filter((r) => r.status === "open" && ["blocker", "high"].includes(r.severity)).length,
      undelivered: reports.filter((r) => r.emailStatus !== "sent").length,
    }),
    [reports],
  );

  const apply = async (report: Report, next: string) => {
    setBusy(true);
    try {
      const d = await api<{ feedback: Report }>("/api/feedback", {
        method: "PATCH",
        body: JSON.stringify({ id: report.id, status: next }),
      });
      setReports((rs) => rs.map((r) => (r.id === report.id ? { ...r, status: d.feedback.status } : r)));
      setActive((a) => (a && a.id === report.id ? { ...a, status: d.feedback.status } : a));
      notify(`Marked ${STATUS_LABELS[next].toLowerCase()}.`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Status could not be changed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const resend = async (report: Report) => {
    setBusy(true);
    try {
      await api(`/api/feedback/${report.id}/resend`, { method: "POST" });
      setReports((rs) => rs.map((r) => (r.id === report.id ? { ...r, emailStatus: "sent", emailError: null } : r)));
      setActive((a) => (a && a.id === report.id ? { ...a, emailStatus: "sent", emailError: null } : a));
      notify(`Sent again to ${developer}.`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "The email could not be sent.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Feedback console"
      eyebrow="PRODUCT FEEDBACK"
      action={
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          disabled={loading}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      }
    >
      <p className="fb-console-lede">
        Everything filed from the in-app Feedback tab. Each report was emailed to{" "}
        <strong>{developer || "the developer"}</strong> when it was sent — this is the record, not
        the delivery.
      </p>

      <div className="fb-console-stats">
        <div>
          <span>{counts.open}</span>
          <label>Open</label>
        </div>
        <div className={counts.blocking ? "warn" : undefined}>
          <span>{counts.blocking}</span>
          <label>Open and blocking</label>
        </div>
        <div className={counts.undelivered ? "warn" : undefined}>
          <span>{counts.undelivered}</span>
          <label>Email not delivered</label>
        </div>
      </div>

      <div className="between wrap" style={{ margin: "22px 0 16px" }}>
        <div className="flex-row grow">
          <SearchField value={q} onChange={setQ} placeholder="Search reports…" />
          <select value={status} aria-label="Filter by status" onChange={(e) => setStatus(e.target.value)}>
            <option value="">Every status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={severity} aria-label="Filter by severity" onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Every severity</option>
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Loading variant="list" rows={5} />
      ) : error ? (
        <Empty art="shield" title="Feedback could not be loaded" detail={error} />
      ) : !filtered.length ? (
        <Empty
          art="inbox"
          title={reports.length ? "Nothing matches those filters" : "No feedback yet"}
          detail={
            reports.length
              ? "Widen the search or clear the filters."
              : "Reports filed from the Feedback tab on any page will appear here."
          }
        />
      ) : (
        <ul className="fb-console-list">
          {filtered.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setActive(r)}>
                <div className="fb-console-row-head">
                  <Badge tone={SEVERITY_TONE[r.severity] ?? "muted"}>{r.severity}</Badge>
                  <strong>{r.title}</strong>
                  {r.emailStatus !== "sent" && (
                    <span className="fb-console-undelivered" title={r.emailError ?? "Not delivered"}>
                      <MailWarning size={13} /> {r.emailStatus}
                    </span>
                  )}
                </div>
                <div className="fb-console-row-meta">
                  <span>{r.reference}</span>
                  <span>{KIND_LABELS[r.kind as FeedbackKind] ?? r.kind}</span>
                  <span>{r.pageLabel || r.pagePath}</span>
                  <span>{r.reporterName}</span>
                  <span>{indiaDate(r.createdAt)}</span>
                  {r.attachments.length > 0 && (
                    <span>
                      <Paperclip size={12} /> {r.attachments.length}
                    </span>
                  )}
                  <span className={"fb-console-status s-" + r.status}>{STATUS_LABELS[r.status] ?? r.status}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(undefined)}
        size="wide"
        resetKey={active?.id}
        title={active?.title ?? ""}
        description={
          active
            ? `${active.reference} · ${KIND_LABELS[active.kind as FeedbackKind] ?? active.kind} · ${
                SEVERITY_LABELS[active.severity as FeedbackSeverity] ?? active.severity
              }`
            : undefined
        }
        footer={
          active && (
            <div className="fb-console-actions">
              <div className="fb-console-status-set">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={"btn btn-sm " + (active.status === s ? "btn-primary" : "btn-outline")}
                    disabled={busy || active.status === s}
                    onClick={() => void apply(active, s)}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy}
                onClick={() => void resend(active)}
              >
                <Mail size={13} /> Email it to the developer again
              </button>
            </div>
          )
        }
      >
        {active && (
          <div className="fb-console-detail">
            <dl className="fb-console-facts">
              <div>
                <dt>Page</dt>
                <dd>
                  {active.pageLabel || active.pagePath}{" "}
                  <a href={active.pagePath} className="fb-console-link">
                    open <ExternalLink size={11} />
                  </a>
                </dd>
              </div>
              <div>
                <dt>Reporter</dt>
                <dd>
                  {active.reporterName}
                  {active.reporterEmail ? ` · ${active.reporterEmail}` : ""}
                  {active.contactBack ? " · wants a reply" : ""}
                </dd>
              </div>
              <div>
                <dt>Filed</dt>
                <dd>{indiaDate(active.createdAt)}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  {active.emailStatus}
                  {active.emailError ? ` — ${active.emailError}` : ""}
                </dd>
              </div>
            </dl>

            <section>
              <h3>What happened</h3>
              <p>{active.details}</p>
            </section>
            {active.stepsToReproduce && (
              <section>
                <h3>Steps to reproduce</h3>
                <p>{active.stepsToReproduce}</p>
              </section>
            )}
            {(active.expected || active.actual) && (
              <div className="fb-console-two">
                {active.expected && (
                  <section>
                    <h3>Expected</h3>
                    <p>{active.expected}</p>
                  </section>
                )}
                {active.actual && (
                  <section>
                    <h3>Actual</h3>
                    <p>{active.actual}</p>
                  </section>
                )}
              </div>
            )}

            {active.attachments.length > 0 && (
              <section>
                <h3>Attachments</h3>
                <div className="fb-console-shots">
                  {active.attachments.map((a) => {
                    const href = `/api/feedback/${active.id}/attachments/${a.id}`;
                    return (
                      <a key={a.id} href={href} target="_blank" rel="noreferrer" title={a.fileName}>
                        {a.fileType.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={href} alt={a.fileName} loading="lazy" />
                        ) : (
                          <span className="fb-console-file">
                            <Paperclip size={16} />
                          </span>
                        )}
                        <em>
                          {a.fileName} · {bytes(a.fileSize)}
                        </em>
                      </a>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3>Environment</h3>
              <dl className="fb-console-context">
                {Object.entries(active.context).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{typeof v === "object" ? JSON.stringify(v, null, 1) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}
      </Modal>
    </Shell>
  );
}

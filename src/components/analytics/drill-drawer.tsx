"use client";
/**
 * The tickets behind a number on the Trend dashboard, and a profile of them.
 *
 * Opened from any clickable figure — a recurrence cluster, a breakdown row, a heatmap cell,
 * an ageing bar, an insight. Every mini-breakdown inside it narrows the slice further, so a
 * manager can go from "Operations has 7 overdue" to "…of which 5 are AC faults at Kwality
 * House" without leaving the page; every ticket row opens the ticket itself.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, Filter, Loader2, X } from "lucide-react";
import { Modal, api } from "@/components/ui";
import { TicketDialog } from "@/components/ticket-detail";
import { csvDownload, indiaDate } from "@/lib/display";

export type DrillRequest = {
  title: string;
  description?: string;
  /** `f.<dim>`, `ids`, `dow`, `hour`, `age`, `state` — see /api/analytics/drill. */
  params: Record<string, string>;
};

type Count = { key: string; count: number; open: number };
type Drill = {
  applied: { dim: string; value: string }[];
  totals: {
    total: number; open: number; resolved: number; overdue: number; critical: number; members: number;
    slaCompliance: number | null; medianResolutionHours: number | null; firstSeen: string | null; lastSeen: string | null;
  };
  breakdown: Record<"status" | "priority" | "studio" | "owner" | "subcategory" | "trainer", Count[]>;
  weekly: { week: string; count: number }[];
  tickets: {
    id: number; ticketNumber: string; title: string; status: string; priority: string; category: string; subcategory: string;
    studio: string | null; memberName: string; trainer: string | null; assignedStaffName: string | null; departmentName: string | null;
    createdAt: string; resolvedAt: string | null; slaDueAt: string | null; resolutionRequired: boolean; isEscalated: boolean;
  }[];
  truncated: boolean;
};

const DIM_LABEL: Record<string, string> = {
  status: "Status", priority: "Priority", studio: "Studio", owner: "Owner", subcategory: "Subcategory", trainer: "Trainer",
  category: "Category", department: "Department", format: "Class format", source: "Source", member: "Member", kind: "Type",
};
const OPEN = (s: string) => !["resolved", "closed", "recorded"].includes(s);
const statusTone = (s: string) => (s === "resolved" ? "green" : s === "closed" || s === "recorded" ? "muted" : "open");

export function DrillDrawer({ request, base, onClose }: { request: DrillRequest | null; base: Record<string, string>; onClose: () => void }) {
  const key = JSON.stringify(request?.params);
  // Narrowing is held against the slice it was made on, so a new drill starts clean without
  // an effect resetting it: narrowing from one drill must not leak into the next.
  const [narrowed, setNarrowed] = useState<{key: string; extra: Record<string, string>; onlyOpen: boolean}>({key: "", extra: {}, onlyOpen: false});
  const mine = narrowed.key === key ? narrowed : {key, extra: {}, onlyOpen: false};
  const {extra, onlyOpen} = mine;
  const setExtra = (f: (x: Record<string, string>) => Record<string, string>) => setNarrowed({...mine, extra: f(mine.extra)});
  const setOnlyOpen = (v: boolean) => setNarrowed({...mine, onlyOpen: v});
  const [result, setResult] = useState<{query: string; data?: Drill; error?: string}>({query: ""});
  const [ticket, setTicket] = useState<number | null>(null);
  const query = useMemo(() => {
    if (!request) return "";
    const p = new URLSearchParams({ ...base, ...request.params, ...extra });
    return p.toString();
  }, [request, base, extra]);

  useEffect(() => {
    if (!query) return;
    let live = true;
    api<Drill>("/api/analytics/drill?" + query)
      .then((d) => { if (live) setResult({query, data: d}); })
      .catch((e) => { if (live) setResult({query, error: (e as Error).message}); });
    return () => { live = false; };
  }, [query]);
  // A result for an earlier slice is never shown against the current one.
  const data = result.query === query ? result.data : undefined;
  const error = result.query === query ? result.error || "" : "";

  const rows = (data?.tickets || []).filter((t) => !onlyOpen || OPEN(t.status));
  const narrow = (dim: string, value: string) => setExtra((x) => ({ ...x, ["f." + dim]: value }));
  const exportCsv = () => {
    if (!data) return;
    csvDownload(`iris-drill-${(request?.title || "slice").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`, [
      ["Ticket", "Title", "Status", "Priority", "Category", "Subcategory", "Studio", "Member", "Trainer", "Owner", "Department", "Created", "Resolved", "Due"],
      ...data.tickets.map((t) => [t.ticketNumber, t.title, t.status, t.priority, t.category, t.subcategory, t.studio || "", t.memberName, t.trainer || "", t.assignedStaffName || "", t.departmentName || "", t.createdAt, t.resolvedAt || "", t.slaDueAt || ""]),
    ]);
  };
  const maxWeek = Math.max(1, ...(data?.weekly || []).map((w) => w.count));

  return (
    <>
      <Modal open={Boolean(request)} onClose={onClose} size="wide" className="drill-dialog" resetKey={query}
        title={request?.title || ""} description={request?.description || "The tickets behind this figure"}>
        {error && <div className="error-box">{error}</div>}
        {!data && !error && <div className="drill-loading"><Loader2 size={16} className="animate-spin" /> Reading the tickets…</div>}
        {data && (
          <div className="drill">
            {Object.keys(extra).length > 0 && (
              <div className="drill-chips" aria-label="Narrowed by">
                <Filter size={12} />
                {Object.entries(extra).map(([k, v]) => (
                  <button key={k} type="button" className="drill-chip" onClick={() => setExtra((x) => { const n = { ...x }; delete n[k]; return n; })}>
                    {DIM_LABEL[k.slice(2)] || k}: <b>{v}</b> <X size={11} aria-label="Remove" />
                  </button>
                ))}
              </div>
            )}
            <dl className="drill-kpis">
              <div><dt>Tickets</dt><dd>{data.totals.total}</dd></div>
              <div className={data.totals.open ? "is-open" : ""}><dt>Open</dt><dd>{data.totals.open}</dd></div>
              <div className={data.totals.overdue ? "is-red" : ""}><dt>Overdue</dt><dd>{data.totals.overdue}</dd></div>
              <div><dt>Critical</dt><dd>{data.totals.critical}</dd></div>
              <div><dt>SLA kept</dt><dd>{data.totals.slaCompliance === null ? "—" : data.totals.slaCompliance + "%"}</dd></div>
              <div><dt>Median fix</dt><dd>{data.totals.medianResolutionHours === null ? "—" : data.totals.medianResolutionHours + "h"}</dd></div>
              <div><dt>People</dt><dd>{data.totals.members}</dd></div>
              <div><dt>Span</dt><dd className="drill-span">{data.totals.firstSeen ? `${indiaDate(data.totals.firstSeen).split(",")[0]} → ${indiaDate(data.totals.lastSeen!).split(",")[0]}` : "—"}</dd></div>
            </dl>

            {data.weekly.length > 1 && (
              <div className="drill-weekly" aria-label="Tickets per week">
                {data.weekly.map((w) => (
                  <span key={w.week} title={`Week of ${w.week}: ${w.count}`} style={{ height: `${Math.max(6, (w.count / maxWeek) * 100)}%` }} />
                ))}
              </div>
            )}

            <div className="drill-breakdowns">
              {(Object.keys(data.breakdown) as (keyof Drill["breakdown"])[]).map((dim) => {
                const list = data.breakdown[dim].filter((c) => c.key);
                if (list.length < 2 && !(list.length === 1 && dim === "status")) return null;
                const max = Math.max(1, ...list.map((c) => c.count));
                return (
                  <section key={dim}>
                    <h4>{DIM_LABEL[dim]}</h4>
                    {list.map((c) => (
                      <button type="button" key={c.key} className="drill-bar" onClick={() => narrow(dim, c.key)} title={`Narrow to ${c.key}`}>
                        <span className="drill-bar-label">{c.key.replaceAll("_", " ")}</span>
                        <span className="drill-bar-track"><i style={{ width: (c.count / max) * 100 + "%" }} /></span>
                        <span className="drill-bar-n">{c.count}{c.open ? <em>{c.open} open</em> : null}</span>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>

            <div className="drill-list-head">
              <h4>{rows.length} ticket{rows.length === 1 ? "" : "s"}{data.truncated ? ` (newest ${data.tickets.length} of ${data.totals.total})` : ""}</h4>
              <div className="flex-row">
                <label className="drill-toggle"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Open only</label>
                <button type="button" className="btn btn-sm" onClick={exportCsv}><Download size={12} /> CSV</button>
              </div>
            </div>
            <div className="table-wrap drill-table">
              <table className="data-table">
                <thead><tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Studio</th><th>Member</th><th>Owner</th><th>Logged</th><th>Resolved</th></tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className={"drill-row tone-" + statusTone(t.status)} onClick={() => setTicket(t.id)} tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setTicket(t.id); }}>
                      <td><div className="drill-title"><b>{t.title}</b><small>{t.ticketNumber} · {t.subcategory}{t.trainer ? ` · ${t.trainer}` : ""}{t.isEscalated ? " · escalated" : ""}</small></div></td>
                      <td><span className={"drill-status tone-" + statusTone(t.status)}>{t.status.replaceAll("_", " ")}</span></td>
                      <td><span className={"drill-prio p-" + t.priority}>{t.priority}</span></td>
                      <td>{t.studio?.split(",")[0] || "—"}</td>
                      <td>{t.memberName}</td>
                      <td>{t.assignedStaffName || "Unassigned"}</td>
                      <td className="nowrap">{indiaDate(t.createdAt).split(",")[0]}</td>
                      <td className="nowrap">{t.resolvedAt ? indiaDate(t.resolvedAt).split(",")[0] : OPEN(t.status) && t.slaDueAt && new Date(t.slaDueAt) < new Date() ? <span className="drill-late">overdue</span> : "—"}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={8} className="muted">No tickets in this slice.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="drill-foot muted"><ArrowUpRight size={11} /> Select a bar to narrow the slice; select a ticket to open it.</p>
          </div>
        )}
      </Modal>
      {ticket !== null && <TicketDialog id={ticket} open onClose={() => setTicket(null)} />}
    </>
  );
}

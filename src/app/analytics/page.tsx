"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Ticket,
  RefreshCw,
  AlertTriangle,
  Repeat,
  Inbox,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ChevronRight,
  Wrench,
  UserRound,
  Dumbbell,
  MapPin,
  Layers,
  Music2,
  Building2,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { api, useApp, Badge, Loading, Avatar } from "@/components/ui";
import { STUDIOS, DEPARTMENT_RECORDS } from "@/lib/constants";
import { csvDownload, indiaDate } from "@/lib/display";
import { IrisMarquee } from "@/components/iris-marquee";
import { DrillDrawer, type DrillRequest } from "@/components/analytics/drill-drawer";
import type { Cluster } from "@/lib/recurrence";
import type { BreakdownRow, Intel } from "@/lib/analytics-intel";

type Report = Intel & {
  totals: {
    all: number;
    open: number;
    resolved: number;
    recorded: number;
    critical: number;
    breached: number;
    breachedOpen: number;
    breachedResolved: number;
    iris: number;
    slaCompliance: number | null;
    medianResolutionHours: number | null;
  };
  trend: { date: string; label: string; created: number; resolved: number }[];
  byPriority: Record<string, number>;
  ownerLeaderboard: { name: string; assigned: number; open: number; closed: number; overdue: number; critical: number; medianHours: number | null }[];
  recurrence: Cluster[];
  computedAt: string;
};

/** How each cluster kind is introduced, and the icon it wears. */
const KIND: Record<string, { label: string; icon: typeof Wrench }> = {
  equipment: { label: "Equipment", icon: Wrench },
  member: { label: "Member", icon: UserRound },
  trainer: { label: "Trainer", icon: Dumbbell },
  location: { label: "Studio issue", icon: MapPin },
  theme: { label: "Theme", icon: Layers },
  format: { label: "Class format", icon: Music2 },
  department: { label: "Department", icon: Building2 },
  owner: { label: "Owner", icon: UserRound },
};

const BREAKDOWNS: { id: keyof Intel["breakdowns"]; label: string; note?: string }[] = [
  { id: "category", label: "Category", note: "Trainer assessments are counted on the Trainer reviews page." },
  { id: "subcategory", label: "Subcategory", note: "Trainer assessments are counted on the Trainer reviews page." },
  { id: "studio", label: "Studio" },
  { id: "department", label: "Department" },
  { id: "owner", label: "Owner" },
  { id: "trainer", label: "Trainer", note: "Issues naming a trainer — assessments and compliments are excluded." },
  { id: "format", label: "Class format", note: "Issues raised about a class — assessments and compliments are excluded." },
  { id: "source", label: "Source" },
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pct = (n: number | null) => (n === null ? "—" : n + "%");
const hrs = (n: number | null) => (n === null ? "—" : n < 48 ? n + "h" : Math.round(n / 24) + "d");

/** "+12%" against the previous period, coloured by whether up is good. */
function Delta({ now, before, goodWhenUp = false, unit = "%", points = false }: { now: number | null; before: number | null | undefined; goodWhenUp?: boolean; unit?: string; points?: boolean }) {
  if (now === null || before === null || before === undefined) return null;
  const diff = points ? Math.round((now - before) * 10) / 10 : before ? Math.round(((now - before) / before) * 100) : null;
  if (diff === null || diff === 0) return <span className="an-delta flat"><Minus size={10} /> same as before</span>;
  const up = diff > 0;
  const good = up === goodWhenUp;
  return (
    <span className={"an-delta " + (good ? "good" : "bad")}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? "+" : ""}{diff}{points ? " pts" : unit} vs previous
    </span>
  );
}

export default function AnalyticsPage() {
  const { notify } = useApp();
  const [data, setData] = useState<Report>(),
    [range, setRange] = useState("30"),
    [studio, setStudio] = useState(""),
    [department, setDepartment] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [drill, setDrill] = useState<DrillRequest | null>(null),
    [kind, setKind] = useState("all"),
    [showAll, setShowAll] = useState(false),
    [tab, setTab] = useState<keyof Intel["breakdowns"]>("category"),
    [sortKey, setSortKey] = useState<keyof BreakdownRow>("total");
  const refreshed = useRef(0);
  // The window every drill-down inherits, so a drilled list matches the number it came from.
  const base = useMemo(() => {
    const p: Record<string, string> = { range, studio, department };
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [range, studio, department, from, to]);
  // State is set only from the request's callbacks, and a superseded request is ignored, so a quick filter change cannot land stale data.
  useEffect(() => {
    let live = true;
    // The Refresh button asks for fresh figures once; ordinary loads may reuse the last minute's.
    const fresh = reload !== refreshed.current;
    refreshed.current = reload;
    api<Report>("/api/analytics?" + new URLSearchParams(fresh ? { ...base, fresh: "1" } : base))
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [base, reload]);

  const open = (title: string, params: Record<string, string>, description?: string) => setDrill({ title, params, description });
  const dimDrill = (dim: string, value: string, extra: Record<string, string> = {}, what = "") =>
    open(`${value}${what ? " · " + what : ""}`, { ["f." + dim]: value, ...extra }, `${BREAKDOWNS.find((b) => b.id === dim)?.label || dim} in the selected period`);
  const clusterDrill = (c: Cluster) => open(c.subject, { ids: c.ticketIds.join(",") }, `${KIND[c.kind]?.label || c.kind} pattern · ${c.note}`);

  const clusters = useMemo(() => (data?.recurrence || []).filter((c) => kind === "all" || c.kind === kind), [data, kind]);
  const kindCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of data?.recurrence || []) m[c.kind] = (m[c.kind] || 0) + 1;
    return m;
  }, [data]);
  const rows = useMemo(() => {
    const list = [...(data?.breakdowns[tab] || [])];
    return list.sort((a, b) => Number(b[sortKey] ?? -1) - Number(a[sortKey] ?? -1));
  }, [data, tab, sortKey]);

  function exportReport() {
    if (!data) return;
    const rows: unknown[][] = [
      ["IRIS trend report", new Date().toISOString(), `range=${range}`, studio || "all studios", department || "all departments"],
      ["Metric", "Value", "Previous period"],
      ["Tickets", data.totals.all, data.previous?.all ?? ""],
      ["Open", data.totals.open, data.previous?.open ?? ""],
      ["Resolved", data.totals.resolved, data.previous?.resolved ?? ""],
      ["SLA compliance %", data.totals.slaCompliance ?? "", data.previous?.slaCompliance ?? ""],
      ["Median resolution h", data.totals.medianResolutionHours ?? "", data.previous?.medianResolutionHours ?? ""],
      [],
      ["Insight", "Detail"],
      ...data.insights.map((i) => [i.title, i.detail]),
      [],
      ["Pattern", "Kind", "Severity", "Trend", "Tickets", "Open", "Overdue", "Days", "Every (days)", "Median fix h", "Studios", "Owners", "Action", "Tickets"],
      ...data.recurrence.map((c) => [c.subject, c.kind, c.severity, c.trend, c.count, c.open, c.overdue, c.days, c.everyDays ?? "", c.medianResolutionHours ?? "", c.studios.join("; "), c.owners.join("; "), c.action, c.examples.join(" ")]),
      ...BREAKDOWNS.flatMap((b) => [
        [],
        [b.label, "Tickets", "Previous", "Change %", "Open", "Overdue", "Critical", "SLA %", "Median h"],
        ...data.breakdowns[b.id].map((r) => [r.key, r.total, r.previous, r.change ?? "", r.open, r.overdue, r.critical, r.slaCompliance ?? "", r.medianHours ?? ""]),
      ]),
      [],
      ["Week", "Created", "Resolved", "Breached"],
      ...data.weekly.map((w) => [w.week, w.created, w.resolved, w.breached]),
    ];
    csvDownload("iris-trend-report.csv", rows);
    notify("Your trend report has been exported.");
  }

  const heatMax = Math.max(1, ...(data?.heatmap || []).map((h) => h.count));
  const heat = (d: number, h: number) => data?.heatmap.find((x) => x.dow === d && x.hour === h)?.count || 0;
  const ageMax = Math.max(1, ...(data?.ageing || []).map((a) => a.count));
  const weekMax = Math.max(1, ...(data?.weekly || []).flatMap((w) => [w.created, w.resolved]));
  const critical = (data?.recurrence || []).filter((c) => c.severity === "critical").length;

  return (
    <Shell
      title="The bigger picture, beautifully clear."
      banner={<IrisMarquee page="analytics" />}
      eyebrow="TREND DASHBOARD"
      action={
        <div className="flex-row">
          <button className="btn" onClick={() => setReload((n) => n + 1)} aria-label="Refresh reports">
            <RefreshCw size={13} />
          </button>
          <button className="btn btn-primary" disabled={!data} onClick={exportReport}>
            <Download size={14} />
            Export report
          </button>
        </div>
      }
    >
      <div className="card" style={{ padding: "15px 20px", marginBottom: 24 }}>
        <div className="between wrap">
          <div className="flex-row wrap">
            <CalendarDays size={15} className="muted" />
            <select
              className="filter-select"
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                setFrom("");
                setTo("");
              }}
              aria-label="Report date range"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 6 months</option>
              <option value="365">Last 12 months</option>
              <option value="all">All time</option>
            </select>
            <select className="filter-select" aria-label="Reporting studio" value={studio} onChange={(e) => setStudio(e.target.value)}>
              <option value="">All studios</option>
              {STUDIOS.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
            <select className="filter-select" aria-label="Reporting department" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {DEPARTMENT_RECORDS.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-row">
            <input type="date" aria-label="Custom start date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ fontSize: 10, padding: 7, maxWidth: 122 }} />
            <span className="muted">–</span>
            <input type="date" aria-label="Custom end date" value={to} onChange={(e) => setTo(e.target.value)} style={{ fontSize: 10, padding: 7, maxWidth: 122 }} />
          </div>
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!data ? (
        <Loading />
      ) : (
        <>
          {/* Headline figures, each against the previous period and each a way in. */}
          <div className="an-kpis">
            {[
              { name: "Tickets received", value: data.totals.all, icon: Ticket, tone: "", delta: <Delta now={data.totals.all} before={data.previous?.all} />, onClick: () => open("Every ticket in this period", {}) },
              { name: "Open now", value: data.totals.open, icon: Inbox, tone: "blue", delta: <span className="an-delta flat">{data.totals.critical} critical</span>, onClick: () => open("Open tickets", { state: "open" }) },
              { name: "Overdue", value: data.totals.breachedOpen, icon: AlertTriangle, tone: data.totals.breachedOpen ? "red" : "green", delta: <span className="an-delta flat">{data.totals.breachedResolved} resolved late</span>, onClick: () => open("Open and past the follow-up target", { state: "overdue" }) },
              { name: "SLA compliance", value: pct(data.totals.slaCompliance), icon: ShieldCheck, tone: "green", delta: <Delta now={data.totals.slaCompliance} before={data.previous?.slaCompliance} goodWhenUp points />, onClick: () => open("Resolved tickets", { state: "resolved" }) },
              { name: "Median resolution", value: hrs(data.totals.medianResolutionHours), icon: Clock3, tone: "purple", delta: <Delta now={data.totals.medianResolutionHours} before={data.previous?.medianResolutionHours} />, onClick: () => open("Resolved tickets", { state: "resolved" }) },
              { name: "Recurring patterns", value: data.recurrence.length, icon: Repeat, tone: critical ? "red" : "amber", delta: <span className="an-delta flat">{critical} need action now</span>, onClick: () => document.getElementById("recurrence")?.scrollIntoView({ behavior: "smooth" }) },
              { name: "Feedback & appreciation", value: data.totals.recorded, icon: CheckCircle2, tone: "amber", delta: <span className="an-delta flat">recorded, no SLA</span>, onClick: () => open("Record-only feedback", { "f.status": "recorded" }) },
            ].map((m) => {
              const I = m.icon;
              return (
                <button type="button" className="card metric an-kpi" key={m.name} onClick={m.onClick}>
                  <div className="between">
                    <span className="metric-name">{m.name}</span>
                    <div className={"metric-icon " + m.tone}>
                      <I size={14} />
                    </div>
                  </div>
                  <div className="metric-number">{m.value}</div>
                  {m.delta}
                </button>
              );
            })}
          </div>

          {data.insights.length > 0 && (
            <section className="card an-insights">
              <div className="section-head">
                <div>
                  <h2><Sparkles size={15} /> What IRIS noticed</h2>
                  <p>Read from the tickets in this period{data.previous ? ", against the period before it" : ""}. Select one to see the tickets behind it.</p>
                </div>
              </div>
              <div className="an-insight-grid">
                {data.insights.map((i) => (
                  <button
                    type="button"
                    key={i.title}
                    className={"an-insight tone-" + i.tone}
                    disabled={!i.drill}
                    onClick={() => {
                      if (!i.drill) return;
                      if ("ids" in i.drill) open(i.title, { ids: i.drill.ids.join(",") }, i.detail);
                      else dimDrill(i.drill.dim, i.drill.value);
                    }}
                  >
                    <strong>{i.title}</strong>
                    <p>{i.detail}</p>
                    {i.drill && <span className="an-more">See the tickets <ChevronRight size={11} /></span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="report-grid">
            <section className="card chart-card">
              <div className="between">
                <div>
                  <h3>Care in motion</h3>
                  <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>
                    Tickets created and resolved · last {data.trend.length} days of this period
                  </p>
                </div>
                <div className="chart-legend">
                  <span><i />Created</span>
                  <span><i style={{ background: "var(--green)" }} />Resolved</span>
                </div>
              </div>
              <Trend data={data.trend} />
            </section>
            <section className="card chart-card">
              <h3>Priority mix</h3>
              <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>How your team’s attention is distributed · select one to drill in</p>
              <Donut values={data.byPriority} onPick={(p) => dimDrill("priority", p, {}, "priority")} />
            </section>
          </div>

          {/* What keeps coming back */}
          <section className="card an-recurrence" id="recurrence">
            <div className="section-head">
              <div>
                <h2>What keeps coming back</h2>
                <p>
                  The same unit, member, trainer, studio issue, class format or theme, reported more than once on more than one day — ranked by what is still open, overdue and
                  arriving faster. Equipment is read from what was written when a ticket is not linked to the register.
                </p>
              </div>
              <Badge tone={critical ? "red" : "amber"}>{data.recurrence.length} patterns · {critical} critical</Badge>
            </div>
            <div className="an-kind-chips" role="tablist" aria-label="Pattern type">
              {[["all", "All", data.recurrence.length] as const, ...Object.entries(kindCounts).map(([k, n]) => [k, KIND[k]?.label || k, n] as const)].map(([k, label, n]) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} className={"an-chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>
                  {label} <b>{n}</b>
                </button>
              ))}
            </div>
            {!clusters.length && <p className="muted an-empty">Nothing has come back more than once in this period. Widen the range to look further back.</p>}
            <div className="an-clusters">
              {clusters.slice(0, showAll ? 60 : 9).map((c) => {
                const K = KIND[c.kind] || KIND.theme;
                const I = K.icon;
                return (
                  <article key={c.id} className={"an-cluster sev-" + c.severity}>
                    <header>
                      <span className={"an-kind kind-" + c.kind}><I size={12} /> {K.label}</span>
                      <span className={"an-sev sev-" + c.severity}>{c.severity === "watch" ? "Watch" : c.severity === "high" ? "High" : "Critical"}</span>
                      <span className={"an-trend t-" + c.trend}>
                        {c.trend === "rising" ? <TrendingUp size={11} /> : c.trend === "easing" ? <TrendingDown size={11} /> : c.trend === "new" ? <Sparkles size={11} /> : <Minus size={11} />}
                        {c.trend}
                      </span>
                    </header>
                    <button type="button" className="an-cluster-title" onClick={() => clusterDrill(c)}>
                      {c.subject} <ChevronRight size={13} />
                    </button>
                    <p className="an-cluster-note">{c.note}</p>
                    <dl className="an-cluster-stats">
                      <div><dt>Tickets</dt><dd>{c.count}</dd></div>
                      <div className={c.open ? "is-open" : ""}><dt>Open</dt><dd>{c.open}</dd></div>
                      <div className={c.overdue ? "is-red" : ""}><dt>Overdue</dt><dd>{c.overdue}</dd></div>
                      <div><dt>Days</dt><dd>{c.days}</dd></div>
                      <div><dt>Returns every</dt><dd>{c.everyDays === null ? "—" : c.everyDays + "d"}</dd></div>
                      <div><dt>Median fix</dt><dd>{hrs(c.medianResolutionHours)}</dd></div>
                    </dl>
                    <div className="an-cluster-tags">
                      {c.studios.slice(0, 3).map((s) => <button type="button" key={"s" + s} onClick={() => dimDrill("studio", s)}><MapPin size={10} /> {s}</button>)}
                      {c.owners.slice(0, 3).map((o) => <button type="button" key={"o" + o} onClick={() => dimDrill("owner", o)}><UserRound size={10} /> {o}</button>)}
                      {c.kind !== "theme" && c.kind !== "location" && c.subcategories.slice(0, 2).map((s) => <button type="button" key={"c" + s} onClick={() => dimDrill("subcategory", s)}><Layers size={10} /> {s}</button>)}
                    </div>
                    <ul className="an-cluster-recent">
                      {c.recent.slice(0, 3).map((t) => (
                        <li key={t.id}>
                          <button type="button" onClick={() => open(t.ticketNumber + " · " + t.title, { ids: String(t.id) })}>
                            <span className={"an-dot " + (["resolved", "closed", "recorded"].includes(t.status) ? "done" : "live")} />
                            <b>{t.ticketNumber}</b> {t.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="an-cluster-action"><strong>Next step:</strong> {c.action}</p>
                    <footer>
                      <span className="muted">First {indiaDate(c.firstSeen).split(",")[0]} · last {indiaDate(c.lastSeen).split(",")[0]}</span>
                      <button type="button" className="text-btn" onClick={() => clusterDrill(c)}>All {c.count} tickets <ChevronRight size={11} /></button>
                    </footer>
                  </article>
                );
              })}
            </div>
            {clusters.length > 9 && (
              <button type="button" className="btn an-showall" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show the top 9" : `Show all ${clusters.length} patterns`}
              </button>
            )}
          </section>

          {/* Breakdown explorer */}
          <section className="card an-explorer">
            <div className="section-head">
              <div>
                <h2>Where the work is</h2>
                <p>Every cut of this period against the one before. Select a row, or any number in it, to open those tickets.</p>
              </div>
            </div>
            <div className="an-kind-chips" role="tablist" aria-label="Break down by">
              {BREAKDOWNS.map((b) => (
                <button key={b.id} type="button" role="tab" aria-selected={tab === b.id} className={"an-chip" + (tab === b.id ? " on" : "")} onClick={() => setTab(b.id)}>
                  {b.label} <b>{data.breakdowns[b.id].length}</b>
                </button>
              ))}
            </div>
            {BREAKDOWNS.find((b) => b.id === tab)?.note && <p className="muted an-note">{BREAKDOWNS.find((b) => b.id === tab)?.note}</p>}
            <div className="table-wrap">
              <table className="data-table an-table">
                <thead>
                  <tr>
                    <th>{BREAKDOWNS.find((b) => b.id === tab)?.label}</th>
                    {([
                      ["total", "Tickets"], ["change", "vs previous"], ["open", "Open"], ["overdue", "Overdue"], ["critical", "Critical"], ["slaCompliance", "SLA kept"], ["medianHours", "Median fix"],
                    ] as [keyof BreakdownRow, string][]).map(([k, l]) => (
                      <th key={k} className="num">
                        <button type="button" className={"an-sort" + (sortKey === k ? " on" : "")} onClick={() => setSortKey(k)}>{l}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="an-row" tabIndex={0} onClick={() => dimDrill(tab, r.key)} onKeyDown={(e) => { if (e.key === "Enter") dimDrill(tab, r.key); }}>
                      <td>
                        <div className="an-rowname">
                          <span>{r.key.replaceAll("_", " ")}</span>
                          <span className="an-share"><i style={{ width: Math.min(100, r.share * 2.5) + "%" }} /></span>
                          <small>{r.share}%</small>
                        </div>
                      </td>
                      <td className="num"><b>{r.total}</b></td>
                      <td className="num">
                        {r.change === null ? (r.previous === 0 && data.previous ? <span className="an-delta bad">new</span> : <span className="muted">—</span>) : (
                          <span className={"an-delta " + (r.change > 0 ? "bad" : r.change < 0 ? "good" : "flat")}>{r.change > 0 ? "+" : ""}{r.change}% <small>({r.previous})</small></span>
                        )}
                      </td>
                      <td className="num"><button type="button" className="an-cell" disabled={!r.open} onClick={(e) => { e.stopPropagation(); dimDrill(tab, r.key, { state: "open" }, "open"); }}>{r.open}</button></td>
                      <td className="num"><button type="button" className={"an-cell" + (r.overdue ? " red" : "")} disabled={!r.overdue} onClick={(e) => { e.stopPropagation(); dimDrill(tab, r.key, { state: "overdue" }, "overdue"); }}>{r.overdue}</button></td>
                      <td className="num">{r.critical || <span className="muted">0</span>}</td>
                      <td className="num"><span className={r.slaCompliance !== null && r.slaCompliance < 85 ? "an-bad" : ""}>{pct(r.slaCompliance)}</span></td>
                      <td className="num">{hrs(r.medianHours)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={8} className="muted">No tickets in this cut.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="report-grid an-grid-3">
            <section className="card chart-card">
              <h3>Week by week</h3>
              <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>Created, resolved and breached per week · select a week to see it</p>
              <div className="an-weeks" role="list">
                {data.weekly.map((w) => (
                  <button type="button" role="listitem" key={w.week} className="an-week" title={`Week of ${w.week}: ${w.created} created, ${w.resolved} resolved, ${w.breached} breached`}
                    onClick={() => {
                      const end = new Date(new Date(w.week).getTime() + 6 * 864e5).toISOString().slice(0, 10);
                      open(`Week of ${w.week}`, { range: "all", from: w.week, to: end }, "Tickets logged that week");
                    }}>
                    <span className="bars">
                      <i className="c" style={{ height: (w.created / weekMax) * 100 + "%" }} />
                      <i className="r" style={{ height: (w.resolved / weekMax) * 100 + "%" }} />
                    </span>
                    {w.breached > 0 && <em>{w.breached}</em>}
                    <small>{w.week.slice(5)}</small>
                  </button>
                ))}
                {!data.weekly.length && <p className="muted">No weeks in this period.</p>}
              </div>
              <div className="chart-legend" style={{ marginTop: 8 }}>
                <span><i />Created</span>
                <span><i style={{ background: "var(--green)" }} />Resolved</span>
                <span><i style={{ background: "var(--red)" }} />Breached</span>
              </div>
            </section>
            <section className="card chart-card">
              <h3>How old the open queue is</h3>
              <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>Every open ticket in scope, by age · red is past its target</p>
              <div className="an-ageing">
                {data.ageing.map((a) => (
                  <button type="button" key={a.bucket} disabled={!a.count} onClick={() => open(`Open for ${a.bucket.toLowerCase()}`, { age: a.bucket, range: "all" }, "Open tickets of this age")}>
                    <span className="lbl">{a.bucket}</span>
                    <span className="track">
                      <i style={{ width: (a.count / ageMax) * 100 + "%" }} />
                      <i className="od" style={{ width: (a.overdue / ageMax) * 100 + "%" }} />
                    </span>
                    <span className="n">{a.count}{a.overdue ? <em>{a.overdue} late</em> : null}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="card chart-card">
              <h3>When tickets arrive</h3>
              <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>Weekday × hour, tickets filed in the app · select a cell</p>
              <div className="an-heat" role="grid" aria-label="Tickets by weekday and hour">
                <span />
                {[6, 9, 12, 15, 18, 21].map((h) => <span key={h} className="hh" style={{ gridColumn: `${h - 4} / span 3` }}>{h % 12 || 12}{h < 12 ? "a" : "p"}</span>)}
                {DOW.map((d, di) => (
                  <div key={d} className="an-heat-row" role="row">
                    <span className="dd">{d}</span>
                    {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => {
                      const c = heat(di, h);
                      return (
                        <button type="button" role="gridcell" key={h} disabled={!c} title={`${d} ${h}:00 — ${c} ticket${c === 1 ? "" : "s"}`}
                          style={{ opacity: c ? 0.18 + (c / heatMax) * 0.82 : 1 }} className={c ? "on" : ""}
                          onClick={() => open(`${d} around ${h % 12 || 12}${h < 12 ? "am" : "pm"}`, { dow: String(di), hour: String(h) }, "Tickets filed in that hour")} />
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="card" style={{ marginTop: 24 }}>
            <div className="section-head">
              <div>
                <h2>Team performance</h2>
                <p>A shared view of ownership, workload and follow-through. Select an owner to see their tickets.</p>
              </div>
              <Badge tone="blue">All-time leaderboard · {data.ownerLeaderboard.length} owners</Badge>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>RANK / OWNER</th><th>ASSIGNED</th><th>OPEN</th><th>CLOSED</th><th>CRITICAL</th><th>OVERDUE</th><th>MEDIAN TIME</th><th>CLOSE RATE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ownerLeaderboard.map((o, index) => (
                    <tr key={o.name} className="an-row" tabIndex={0} onClick={() => open(o.name, { "f.owner": o.name, range: "all" }, "Every ticket this owner has held")}
                      onKeyDown={(e) => { if (e.key === "Enter") open(o.name, { "f.owner": o.name, range: "all" }); }}>
                      <td>
                        <div className="flex-row owner-rank-cell">
                          <span className={"owner-rank rank-" + (index + 1)}>{String(index + 1).padStart(2, "0")}</span>
                          <Avatar name={o.name} tone="purple" />
                          {o.name}
                        </div>
                      </td>
                      <td>{o.assigned}</td>
                      <td><button type="button" className="an-cell" disabled={!o.open} onClick={(e) => { e.stopPropagation(); open(`${o.name} · open`, { "f.owner": o.name, range: "all", state: "open" }); }}>{o.open}</button></td>
                      <td><Badge tone="green">{o.closed}</Badge></td>
                      <td><Badge tone={o.critical ? "red" : ""}>{o.critical}</Badge></td>
                      <td><button type="button" className={"an-cell" + (o.overdue ? " red" : "")} disabled={!o.overdue} onClick={(e) => { e.stopPropagation(); open(`${o.name} · overdue`, { "f.owner": o.name, range: "all", state: "overdue" }); }}>{o.overdue}</button></td>
                      <td>{o.medianHours === null ? "—" : `${o.medianHours}h`}</td>
                      <td>
                        <div className="flex-row">
                          <div className="progress-bar" style={{ width: 70, margin: 0 }}>
                            <span style={{ width: Math.round((o.closed / Math.max(o.assigned, 1)) * 100) + "%" }} />
                          </div>
                          {Math.round((o.closed / Math.max(o.assigned, 1)) * 100)}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="between wrap" style={{ marginTop: 18, fontSize: 10, color: "var(--muted)" }}>
            <span>All metrics are calculated from persisted tickets. No-SLA records are excluded from SLA compliance; imported history is excluded from resolution time.</span>
            <span>Updated {indiaDate(data.computedAt)}</span>
          </div>
        </>
      )}
      <DrillDrawer request={drill} base={base} onClose={() => setDrill(null)} />
    </Shell>
  );
}

function Trend({ data }: { data: Report["trend"] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.resolved]));
  const w = 560,
    h = 150;
  const path = (key: "created" | "resolved") =>
    data
      .map(
        (d, i) =>
          `${i === 0 ? "M" : "L"}${25 + (i / (data.length - 1)) * (w - 40)},${15 + h - (d[key] / max) * h}`,
      )
      .join(" ");
  return (
    <svg
      className="chart-svg"
      viewBox="0 0 570 195"
      role="img"
      aria-label="Created and resolved ticket trend"
    >
      <defs>
        <linearGradient id="ticketTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".15" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line x1={25} x2={545} y1={15 + i * 50} y2={15 + i * 50} />
          <text x={0} y={19 + i * 50}>
            {Math.round(max * (1 - i / 3))}
          </text>
        </g>
      ))}
      <path
        d={path("created") + " L545,165 L25,165 Z"}
        fill="url(#ticketTrendFill)"
      />
      <path
        d={path("created")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d={path("resolved")}
        fill="none"
        stroke="var(--green)"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      {data
        .filter(
          (_, i) =>
            i % Math.ceil(data.length / 5) === 0 || i === data.length - 1,
        )
        .map((d) => {
          const i = data.indexOf(d);
          return (
            <text
              key={d.date}
              x={25 + (i / (data.length - 1)) * (w - 40)}
              y={187}
              textAnchor="middle"
            >
              {d.label}
            </text>
          );
        })}
    </svg>
  );
}
function Donut({ values, onPick }: { values: Record<string, number>; onPick?: (priority: string) => void }) {
  const keys = ["critical", "high", "medium", "low"];
  const colors = [
    "var(--red)",
    "var(--amber)",
    "var(--accent)",
    "var(--green)",
  ];
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  let offset = 0;
  return (
    <div className="donut-layout">
      <div className="donut">
        <svg viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r="61"
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth="18"
          />
          {keys.map((k, i) => {
            const part = ((values[k] || 0) / Math.max(total, 1)) * 383.27;
            const current = offset;
            offset += part;
            return (
              <circle
                key={k}
                cx="80"
                cy="80"
                r="61"
                fill="none"
                stroke={colors[i]}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, part - 3)} ${383.27 - Math.max(0, part - 3)}`}
                strokeDashoffset={-current}
              />
            );
          })}
        </svg>
        <div className="donut-label">
          <strong>{total}</strong>
          <small>total tickets</small>
        </div>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        {keys.map((k, i) => (
          <button
            type="button"
            className="between an-legend-btn"
            key={k}
            disabled={!values[k]}
            onClick={() => onPick?.(k)}
            style={{ fontSize: 11, minWidth: 110 }}
          >
            <span className="flex-row" style={{ gap: 7 }}>
              <i
                style={{
                  height: 6,
                  width: 6,
                  borderRadius: 9,
                  background: colors[i],
                }}
              />
              {k[0].toUpperCase() + k.slice(1)}
            </span>
            <strong style={{ fontWeight: 500 }}>{values[k] || 0}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Sparkles, Zap, TriangleAlert, Timer, ShieldCheck, RotateCcw, Filter } from "lucide-react";
import type { TicketListRecord } from "@/lib/ticket-contract";

/**
 * The Overview header: a two-card command row over a strip of four metric
 * cards, built to the reference design in
 * `~/Downloads/modern-premium-dashboard-design`.
 *
 * Every figure arrives already computed, so the scoping and filtering rules
 * stay in one place; what is derived here is only the *shape* of a series. A
 * sparkline is a way of drawing a list, not a new fact about it.
 */

const BUCKETS = 20;

/** Whole days between a timestamp and today, both aligned to midnight. */
function dayIndex(when: string | Date, today: number) {
  return Math.round((today - new Date(when).setHours(0, 0, 0, 0)) / 86_400_000);
}

/**
 * Splits a list into `n` equal buckets across the *scope's own* time span,
 * oldest first.
 *
 * A fixed trailing window of days was the obvious thing to reach for and the
 * wrong one: a workspace whose tickets are months old renders every bar at zero
 * and the chart reads as broken rather than as empty. Spanning the data that is
 * actually in scope means the shape always describes the tickets on screen,
 * which is what the surrounding figures describe too.
 */
function bucketCounts(list: TicketListRecord[], span: [number, number], n = BUCKETS) {
  const out: number[] = new Array(n).fill(0);
  const [from, to] = span;
  const width = Math.max(1, to - from);
  for (const t of list) {
    const at = new Date(t.createdAt).getTime();
    if (at < from || at > to) continue;
    const i = Math.min(n - 1, Math.floor(((at - from) / width) * n));
    out[i] += 1;
  }
  return out;
}

/**
 * Counts up to the value once on mount. Purely decorative, so it is skipped
 * entirely for anyone who has asked for reduced motion — an animated figure is
 * exactly the kind of movement that setting exists to stop.
 */
function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const reducedFrame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(reducedFrame);
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  return (
    <>
      {shown.toLocaleString()}
      {suffix}
    </>
  );
}

/** Sparkline: a filled area under a stroked line, with a dot on the last point. */
function Sparkline({ data, stroke, id }: { data: number[]; stroke: string; id: string }) {
  const w = 88;
  const h = 30;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => [i * stepX, h - 4 - ((v - min) / range) * (h - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="ovc-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={`ovc-sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#ovc-sg-${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last?.[0] ?? 0} cy={last?.[1] ?? 0} r={2.6} fill={stroke} className="ovc-spark-dot" />
    </svg>
  );
}

/** Initials from the first and last word of a name. */
function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function OverviewCanvas({
  name,
  tickets,
  open,
  urgent,
  overdue,
  unassigned,
  slaRisk,
  studios,
  onFilter,
}: {
  name: string;
  tickets: TicketListRecord[];
  open: TicketListRecord[];
  urgent: TicketListRecord[];
  overdue: TicketListRecord[];
  ageing: TicketListRecord[];
  unassigned: TicketListRecord[];
  slaRisk: TicketListRecord[];
  studios: number;
  staleDays: number;
  onFilter: (patch: Record<string, unknown>, label: string) => void;
}) {
  // Freeze the reporting window for this mounted view so charts stay stable while
  // the rest of the shell refreshes in the background.
  const [now] = useState(() => Date.now());
  const today = new Date(now).setHours(0, 0, 0, 0);

  const loggedToday = useMemo(
    () => tickets.filter((t) => dayIndex(t.createdAt, today) === 0).length,
    [tickets, today],
  );
  /** Every studio the workspace knows of, not only those with open work. */
  const studioTotal = useMemo(
    () => new Set(tickets.map((t) => t.studio).filter(Boolean)).size,
    [tickets],
  );
  const owners = useMemo(() => {
    const names = new Set<string>();
    for (const t of open) if (t.assignedStaffName) names.add(t.assignedStaffName);
    return [...names];
  }, [open]);

  /** The window every chart is drawn against: the scope's first ticket to now. */
  const span = useMemo((): [number, number] => {
    let first = Infinity;
    for (const t of tickets) {
      const at = new Date(t.createdAt).getTime();
      if (at < first) first = at;
    }
    return [Number.isFinite(first) ? first : now - 20 * 86_400_000, now];
  }, [tickets, now]);

  const volume = useMemo(() => bucketCounts(tickets, span), [tickets, span]);
  /** Tickets *resolved* in each bucket, keyed off `resolvedAt` rather than
   *  `createdAt`, so the line answers "are we keeping up?" against the bars'
   *  "how much arrived?". */
  const resolved = useMemo(() => {
    const done = tickets
      .filter((t) => t.resolvedAt)
      .map((t) => ({ ...t, createdAt: t.resolvedAt as string }));
    return bucketCounts(done, span);
  }, [tickets, span]);
  const volumeTotal = useMemo(() => volume.reduce((a, b) => a + b, 0), [volume]);
  const peak = volume.indexOf(Math.max(...volume, 1));

  const healthy = useMemo(() => {
    const risky = new Set(slaRisk.map((t) => t.id));
    return open.filter((t) => !risky.has(t.id));
  }, [open, slaRisk]);
  const compliance = open.length ? Math.round((healthy.length / open.length) * 100) : 100;

  /** Which card is showing its reverse. Clicking a card flips it; the filter
   *  is a deliberate second step on the back, so a stray click never rewrites
   *  what the table below is showing. */
  const [flipped, setFlipped] = useState<string | null>(null);

  /** Closed inside the window the charts already describe. */
  const resolvedInSpan = useMemo(
    () =>
      tickets.filter((t) => {
        if (!t.resolvedAt) return false;
        const at = new Date(t.resolvedAt).getTime();
        return at >= span[0] && at <= span[1];
      }).length,
    [tickets, span],
  );
  /** Closed against logged over the same window: above 100% the backlog falls. */
  const clearance = volumeTotal ? Math.round((resolvedInSpan / volumeTotal) * 100) : 0;

  const busiestStudio = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of open) if (t.studio) by.set(t.studio, (by.get(t.studio) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [open]);

  const topCategory = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of open) if (t.category) by.set(t.category, (by.get(t.category) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [open]);

  const openMedianAge = useMemo(() => {
    if (!open.length) return 0;
    const ages = open.map((t) => Math.max(0, dayIndex(t.createdAt, today))).sort((a, b) => a - b);
    const mid = Math.floor(ages.length / 2);
    return ages.length % 2 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2);
  }, [open, today]);

  /** The strip under the hero copy: four readings that add context the
   *  headline cannot carry on its own. */
  const strip: { label: string; value: string; hint?: string }[] = [
    { label: "Resolved", value: String(resolvedInSpan), hint: "this period" },
    { label: "Clearance", value: clearance + "%", hint: "closed vs logged" },
    { label: "Median age", value: openMedianAge + "d", hint: "of open work" },
    busiestStudio
      ? { label: "Busiest studio", value: String(busiestStudio[1]), hint: busiestStudio[0] }
      : { label: "Busiest studio", value: "—", hint: "nothing open" },
    topCategory
      ? { label: "Top category", value: String(topCategory[1]), hint: topCategory[0] }
      : { label: "Top category", value: "—", hint: "nothing open" },
  ];

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  /** The headline is the summary: one sentence, the number set in the accent. */
  const lead = overdue.length
    ? { n: `${overdue.length} overdue follow-up${overdue.length === 1 ? "" : "s"}`, tail: "need a decision." }
    : urgent.length
      ? { n: `${urgent.length} urgent ticket${urgent.length === 1 ? "" : "s"}`, tail: "need attention." }
      : { n: "every open ticket", tail: "is on track." };

  /** Share of open work a subset represents — the context a bare count lacks. */
  const shareOfOpen = (n: number) => (open.length ? Math.round((n / open.length) * 100) : 0);

  /** Top three studios by volume within a subset, for the reverse of a card. */
  const topStudios = (list: TicketListRecord[]) => {
    const by = new Map<string, number>();
    for (const t of list) if (t.studio) by.set(t.studio, (by.get(t.studio) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  };

  /** Median age in days, which says more about a backlog than its mean. */
  const medianAge = (list: TicketListRecord[]) => {
    if (!list.length) return 0;
    const ages = list
      .map((t) => Math.max(0, dayIndex(t.createdAt, today)))
      .sort((a, b) => a - b);
    const mid = Math.floor(ages.length / 2);
    return ages.length % 2 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2);
  };

  const kpis = [
    {
      id: "active",
      icon: Zap,
      accent: true,
      value: open.length,
      label: "Active now",
      sub: "Open queues",
      data: bucketCounts(open, span),
      facts: [
        ["Median age", `${medianAge(open)}d`],
        ["Unassigned", `${unassigned.length}`],
        ["Share of scope", `${tickets.length ? Math.round((open.length / tickets.length) * 100) : 0}%`],
      ] as [string, string][],
      studios: topStudios(open),
      onOpen: () => onFilter({ state: "open" }, "Open tickets"),
    },
    {
      id: "attention",
      icon: TriangleAlert,
      accent: false,
      value: urgent.length,
      label: "Needs attention",
      sub: `${shareOfOpen(urgent.length)}% of open`,
      data: bucketCounts(urgent, span),
      facts: [
        ["Critical", `${urgent.filter((t) => t.priority === "critical").length}`],
        ["High", `${urgent.filter((t) => t.priority === "high").length}`],
        ["Median age", `${medianAge(urgent)}d`],
      ] as [string, string][],
      studios: topStudios(urgent),
      onOpen: () => onFilter({ state: "open", priorities: ["critical", "high"] }, "Urgent open tickets"),
    },
    {
      id: "overdue",
      icon: Timer,
      accent: false,
      value: overdue.length,
      label: "Overdue",
      sub: `${shareOfOpen(overdue.length)}% of open`,
      data: bucketCounts(overdue, span),
      facts: [
        ["Median age", `${medianAge(overdue)}d`],
        ["Unassigned", `${overdue.filter((t) => !t.assignedStaffId).length}`],
        ["Also urgent", `${overdue.filter((t) => ["critical", "high"].includes(t.priority)).length}`],
      ] as [string, string][],
      studios: topStudios(overdue),
      onOpen: () => onFilter({ state: "open", slaStates: ["breached"] }, "Overdue follow-ups"),
    },
    {
      id: "sla",
      icon: ShieldCheck,
      accent: false,
      value: compliance,
      suffix: "%",
      label: "SLA compliance",
      sub: "Open within target",
      data: bucketCounts(healthy, span),
      facts: [
        ["Within target", `${healthy.length}`],
        ["At risk", `${slaRisk.length}`],
        ["Breached", `${overdue.length}`],
      ] as [string, string][],
      studios: topStudios(slaRisk),
      onOpen: () => onFilter({ state: "open", slaStates: ["breached", "at_risk"] }, "Tickets at SLA risk"),
    },
  ];

  return (
    <div className="ovc">
      <div className="ovc-row">
        <section className="ovc-card ovc-hero">
          <span className="ovc-bloom" aria-hidden="true" />
          <div className="ovc-hero-inner">
            <p className="ovc-eyebrow ovc-eyebrow-row">
              <span>
                Internal operations · {studios === studioTotal ? "All studios" : "Filtered scope"}
              </span>
              <i aria-hidden="true" />
              <span className="ovc-eyebrow-end">{tickets.length.toLocaleString()} in scope</span>
            </p>
            <h2 className="ovc-title">
              {greet}, {name.split(" ")[0]} — <em>{lead.n}</em> {lead.tail}
            </h2>
            <p className="ovc-lede">
              Member voice, ownership and service risk in one calm view. IRIS has pre-triaged
              today&apos;s queue.
            </p>
            <div className="ovc-cta-row">
              <Link className="ovc-btn ovc-btn-accent" href="/iris">
                <Sparkles size={16} />
                Raise with IRIS
                <ArrowRight size={16} className="ovc-btn-arrow" />
              </Link>
              <button
                className="ovc-btn ovc-btn-soft"
                onClick={() => onFilter({ state: "open" }, "Open tickets")}
              >
                Open work queue
              </button>
            </div>
            <dl className="ovc-strip">
              {strip.map((m) => (
                <div key={m.label}>
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                  {m.hint && <small title={m.hint}>{m.hint}</small>}
                </div>
              ))}
            </dl>
            <footer className="ovc-hero-foot">
              {owners.length > 0 && (
                <span className="ovc-stack" aria-hidden="true">
                  {owners.slice(0, 3).map((o, i) => (
                    <i key={o} data-tone={i % 3}>
                      {initials(o)}
                    </i>
                  ))}
                  {owners.length > 3 && <i className="ovc-stack-more">+{owners.length - 3}</i>}
                </span>
              )}
              <p>
                <b>
                  {owners.length} {owners.length === 1 ? "person" : "people"}
                </b>{" "}
                carrying the load · auto-routed today
              </p>
            </footer>
          </div>
        </section>

        <section className="ovc-card ovc-snapshot">
          <header className="ovc-snapshot-head">
            <p className="ovc-eyebrow">Command snapshot</p>
            <span className={"ovc-flag " + (overdue.length ? "is-alert" : "is-ok")}>
              <i aria-hidden="true" />
              {overdue.length ? "Action needed" : "On track"}
            </span>
          </header>

          <dl className="ovc-stats">
            <div>
              <dd>
                <Counter value={open.length} />
              </dd>
              <dt>Open</dt>
              <small>{loggedToday > 0 ? `+${loggedToday} today` : "none logged today"}</small>
            </div>
            <div>
              <dd>
                <Counter value={unassigned.length} />
              </dd>
              <dt>Unassigned</dt>
              <small>{unassigned.length ? "needs routing" : "All routed"}</small>
            </div>
            <div>
              <dd>
                <Counter value={studios} />
              </dd>
              <dt>Studios live</dt>
              <small>of {studioTotal || studios}</small>
            </div>
          </dl>

          <div className="ovc-volume">
            <div className="ovc-volume-head">
              <p className="ovc-eyebrow">Volume · {volumeTotal}</p>
              <small>this period</small>
            </div>
            <div className="ovc-volume-plot">
              <div className="ovc-volume-bars">
                {volume.map((v, i) => (
                  <span
                    key={i}
                    className={i === peak && volumeTotal > 0 ? "is-peak" : undefined}
                    style={{ height: Math.max(8, (v / Math.max(...volume, 1)) * 100) + "%" }}
                    title={`${v} logged`}
                  />
                ))}
              </div>
              <svg
                className="ovc-volume-line"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d={resolved
                    .map((v, i) => {
                      const x = (i / Math.max(1, resolved.length - 1)) * 100;
                      const y = 100 - (v / Math.max(...volume, 1)) * 100;
                      return `${i ? "L" : "M"}${x.toFixed(2)},${Math.max(0, y).toFixed(2)}`;
                    })
                    .join(" ")}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <p className="ovc-volume-key">
              <span className="is-bar" /> Logged
              <span className="is-line" /> Resolved
            </p>
          </div>
        </section>
      </div>

      <div className="ovc-kpis">
        {kpis.map((k) => {
          const Icon = k.icon;
          const isBack = flipped === k.id;
          const peakOf = Math.max(...k.studios.map(([, n]) => n), 1);
          return (
            <div key={k.id} className={"ovc-kpi-scene" + (isBack ? " is-flipped" : "")}>
              <div className="ovc-kpi-flip">
                <button
                  className="ovc-card ovc-kpi ovc-kpi-face"
                  onClick={() => setFlipped(k.id)}
                  aria-expanded={isBack}
                  aria-label={`${k.label}: ${k.value}${k.suffix ?? ""}. Show detail`}
                  tabIndex={isBack ? -1 : 0}
                >
                  {/* An animated aurora wash behind the figures — the card is a
                      live dial, not a printed label. */}
                  <span className="ovc-kpi-aura" aria-hidden="true" data-tone={k.accent ? "accent" : "neutral"} />
                  <span className="ovc-kpi-top">
                    <span className={"ovc-chip " + (k.accent ? "is-accent" : "is-neutral")}>
                      <Icon size={16} strokeWidth={2} />
                    </span>
                    <span className="ovc-kpi-label">{k.label}</span>
                    <Sparkline
                      data={k.data}
                      id={k.id}
                      stroke={k.accent ? "var(--accent)" : "var(--ovc-spark-muted)"}
                    />
                  </span>
                  <span className="ovc-kpi-value-row">
                    <strong>
                      <Counter value={k.value} suffix={k.suffix ?? ""} />
                    </strong>
                    <small>{k.sub}</small>
                  </span>
                  <span className="ovc-kpi-mini-facts">
                    {k.facts.slice(0, 3).map(([label, value]) => (
                      <span key={label}>
                        <em>{label}</em>
                        <b>{value}</b>
                      </span>
                    ))}
                  </span>
                </button>

                <div className="ovc-card ovc-kpi ovc-kpi-back" aria-hidden={!isBack}>
                  <header>
                    <span className="ovc-kpi-label">{k.label}</span>
                    <button
                      className="ovc-kpi-close"
                      onClick={() => setFlipped(null)}
                      aria-label="Back to the figure"
                      tabIndex={isBack ? 0 : -1}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </header>
                  <dl className="ovc-kpi-facts">
                    {k.facts.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {k.studios.length > 0 && (
                    <div className="ovc-kpi-studios">
                      {k.studios.map(([studio, n]) => (
                        <div key={studio}>
                          <span>{studio}</span>
                          <i>
                            <u style={{ width: (n / peakOf) * 100 + "%" }} />
                          </i>
                          <b>{n}</b>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="ovc-kpi-filter"
                    onClick={k.onOpen}
                    tabIndex={isBack ? 0 : -1}
                  >
                    <Filter size={12} />
                    Filter the table
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

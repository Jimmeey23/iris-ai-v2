"use client";

/**
 * Design preview — /preview
 *
 * A public, database-free route that renders the redesigned product against
 * fixture data, so the visual work can be reviewed without a Supabase session.
 *
 * It is the *real* shell, the *real* overview canvas and the *real* primitives —
 * not screenshots and not a mock-up — so if the system changes, this page changes
 * with it. The only thing faked is the data.
 *
 * Not part of the product: it is listed in `proxy.ts` PUBLIC, carries no nav
 * entry, and is noindex (the root layout sets robots on every page).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Sparkles,
  Ticket,
  LayoutGrid,
  Columns3,
  List,
  ArrowUpRight,
  Search,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Shell } from "@/components/shell";
import {
  AppProvider,
  Avatar,
  Badge,
  Button,
  Empty,
  Field,
  Loading,
  Priority,
  SearchField,
  Status,
  Switch,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { OverviewCanvas } from "@/components/overview-canvas";
import { Kanban, TicketCard } from "@/components/tickets-board";
import {
  PREVIEW_DIRECTORY,
  PREVIEW_TICKETS,
  PREVIEW_USER,
} from "./preview-data";
import { isSlaTracked } from "@/lib/metrics";
import { isClosed } from "@/lib/ticket-filtering";
import { slaState } from "@/lib/utils";

type View = "gallery" | "tickets" | "board" | "components";

const VIEWS: TabItem<View>[] = [
  { id: "gallery", label: "Overview" },
  { id: "tickets", label: "Ticket list" },
  { id: "board", label: "Board" },
  { id: "components", label: "Components" },
];

export default function PreviewPage() {
  return (
    <AppProvider preview={{ user: PREVIEW_USER }}>
      <PreviewBody />
    </AppProvider>
  );
}

function PreviewBody() {
  const [view, setView] = useState<View>("gallery");
  const tickets = PREVIEW_TICKETS;

  const open = useMemo(() => tickets.filter((t) => !isClosed(t)), [tickets]);
  const urgent = useMemo(
    () => open.filter((t) => t.priority === "critical" || t.priority === "high"),
    [open],
  );
  const overdue = useMemo(
    () => open.filter((t) => slaState(t.slaDueAt, t.status, t.createdAt) === "breached"),
    [open],
  );
  const slaRisk = useMemo(
    () =>
      open.filter((t) => {
        const s = slaState(t.slaDueAt, t.status, t.createdAt);
        return s === "breached" || s === "soon";
      }),
    [open],
  );
  const unassigned = useMemo(() => open.filter((t) => !t.assignedStaffId), [open]);
  const tracked = tickets.filter(isSlaTracked);

  return (
    <Shell
      title={view === "gallery" ? "Overview" : view === "components" ? "Components" : "Tickets"}
      eyebrow="Design preview · fixture data"
      activePath="/dashboard"
      fullWidth
      hideFooter
      action={
        <div className="preview-actions">
          <Link className="btn btn-ghost btn-sm" href="/login">
            Real sign-in
            <ArrowUpRight size={13} />
          </Link>
          <Button variant="primary" size="sm" icon={Plus}>
            Log a ticket
          </Button>
        </div>
      }
      banner={<PreviewBanner />}
    >
      <Tabs
        className="preview-tabs"
        label="Preview sections"
        value={view}
        onChange={setView}
        items={VIEWS}
      />

      {view === "gallery" && (
        <div className="stack" style={{ gap: "var(--space-5)" }}>
          <OverviewCanvas
            name={PREVIEW_USER.name}
            tickets={tickets}
            open={open}
            urgent={urgent}
            overdue={overdue}
            ageing={[]}
            unassigned={unassigned}
            slaRisk={slaRisk}
            studios={2}
            staleDays={3}
            onFilter={() => setView("tickets")}
          />
          <PreviewTable tickets={tickets.slice(0, 5)} />
        </div>
      )}

      {view === "tickets" && <PreviewTable tickets={tickets} />}

      {view === "board" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="section-head" style={{ padding: "var(--space-4) var(--space-4) 0", marginBottom: 0 }}>
            <div>
              <h2>Tickets by status</h2>
              <p>{tickets.length} in scope · {open.length} open</p>
            </div>
            <div className="view-switch" role="group" aria-label="View">
              <button className="active" aria-pressed="true"><Columns3 size={14} /></button>
              <button aria-pressed="false" onClick={() => setView("tickets")}><List size={14} /></button>
              <button aria-pressed="false" onClick={() => setView("components")}><LayoutGrid size={14} /></button>
            </div>
          </div>
          <Kanban tickets={tickets} groupBy="status" />
          <div className="ticket-cards-grid">
            {tickets.slice(0, 3).map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </div>
        </div>
      )}

      {view === "components" && <ComponentGallery />}
    </Shell>
  );
}

function PreviewBanner() {
  return (
    <div className="preview-banner">
      <span className="preview-badge">Preview</span>
      <p>
        This is the redesigned interface running on fixture data — the real shell,
        the real components, no sign-in required. Toggle the theme with the control
        in the top bar.
      </p>
    </div>
  );
}

/** The ticket table. Rendered from the same primitives the product uses. */
function PreviewTable({ tickets }: { tickets: typeof PREVIEW_TICKETS }) {
  const [query, setQuery] = useState("");
  const rows = tickets.filter((t) =>
    !query ||
    (t.title + " " + t.ticketNumber + " " + (t.memberName ?? ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <div className="section-head" style={{ padding: "var(--space-4) var(--space-4) 0", marginBottom: "var(--space-3)" }}>
        <div>
          <h2>Ticket workspace</h2>
          <p>{rows.length} shown · newest first</p>
        </div>
        <div className="preview-toolbar">
          <div style={{ width: 240 }}>
            <SearchField value={query} onChange={setQuery} placeholder="Search tickets…" />
          </div>
          <Button size="sm" icon={RefreshCw}>Refresh</Button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="ticket-grid">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Studio</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Priority</th>
              <th>SLA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const sla = slaState(t.slaDueAt, t.status, t.createdAt);
              return (
                <tr key={t.id} data-done={isClosed(t) ? "true" : undefined}>
                  <td>
                    <div className="ticket-name">{t.title}</div>
                    <div className="ticket-meta">
                      <span className="ticket-id">{t.ticketNumber}</span>
                      <span className="chip">{t.category}</span>
                      <span className="muted">{t.subcategory}</span>
                    </div>
                  </td>
                  <td className="muted">{t.studio}</td>
                  <td>
                    {t.assignedStaffName ? (
                      <span className="preview-owner">
                        <Avatar name={t.assignedStaffName} owner />
                        {t.assignedStaffName}
                      </span>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </td>
                  <td><Status status={t.status} /></td>
                  <td><Priority priority={t.priority} /></td>
                  <td>
                    {t.slaDueAt ? (
                      <span className={"sla-countdown is-" + sla}>
                        {sla === "breached" ? "Overdue" : sla === "soon" ? "At risk" : "On track"}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <Empty
          art="search"
          title="Nothing matches"
          detail="No tickets match the current search."
          action={<Button size="sm" onClick={() => setQuery("")}>Clear search</Button>}
        />
      )}
    </section>
  );
}

function ComponentGallery() {
  const [on, setOn] = useState(true);
  return (
    <div className="stack" style={{ gap: "var(--space-4)" }}>
      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="eyebrow">Buttons</div>
        <h3 style={{ margin: "6px 0 16px" }}>Five intents, four sizes</h3>
        <div className="preview-row">
          <Button variant="primary">Log a ticket</Button>
          <Button>Secondary</Button>
          <Button variant="soft" icon={Sparkles}>Ask IRIS</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="preview-row">
          <Button size="lg">Large</Button>
          <Button size="sm" icon={Ticket}>Small</Button>
          <Button size="xs">Extra small</Button>
          <Button variant="primary" icon={Plus} size="sm">New</Button>
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="eyebrow">Form controls</div>
        <h3 style={{ margin: "6px 0 16px" }}>One geometry, one focus ring</h3>
        <div className="preview-grid">
          <Field label="Ticket title" hint="What happened, in one line.">
            <input placeholder="e.g. Bike 7 pedals slip under load" />
          </Field>
          <Field label="Studio">
            <select defaultValue="kwality">
              <option value="kwality">Kwality House, Kemps Corner</option>
              <option value="supreme">Supreme HQ, Bandra</option>
            </select>
          </Field>
          <Field label="Owner">
            <select defaultValue="">
              <option value="">Unassigned</option>
              <option>Rhea D&apos;Souza</option>
              <option>Karan Mehta</option>
            </select>
          </Field>
          <Field label="Search">
            <SearchField value="" onChange={() => {}} placeholder="Search…" />
          </Field>
          <Field label="Description" wide>
            <textarea placeholder="Member reported…" rows={3} />
          </Field>
          <div className="preview-row">
            <Switch checked={on} onChange={setOn} label="Resolution required" />
            <span className="secondary">Resolution required</span>
            <input type="checkbox" defaultChecked aria-label="Notify owner" />
            <span className="secondary">Notify owner</span>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="eyebrow">Data marks</div>
        <h3 style={{ margin: "6px 0 16px" }}>Status, priority and tags</h3>
        <div className="preview-row">
          <Status status="open" />
          <Status status="in_progress" />
          <Status status="waiting_on_member" />
          <Status status="resolved" />
          <Status status="closed" />
          <Status status="recorded" />
        </div>
        <div className="preview-row">
          <Priority priority="critical" />
          <Priority priority="high" />
          <Priority priority="medium" />
          <Priority priority="low" />
        </div>
        <div className="preview-row">
          <Badge tone="blue">Tech</Badge>
          <Badge tone="green">On track</Badge>
          <Badge tone="amber">At risk</Badge>
          <Badge tone="red">Overdue</Badge>
          <Badge tone="purple">Recurring</Badge>
          <span className="chip">Housekeeping</span>
          <span className="chip">Studio 2</span>
        </div>
        <div className="preview-row">
          <Avatar name="Rhea D'Souza" />
          <Avatar name="Karan Mehta" />
          <Avatar name="Farah Qureshi" owner />
          <Avatar name="Unassigned" emptyDark />
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="eyebrow">States</div>
        <h3 style={{ margin: "6px 0 16px" }}>Empty, loading, error</h3>
        <Empty
          art="inbox"
          title="No tickets yet"
          detail="New entries appear here the moment they are filed."
          action={<Button size="sm" icon={Plus}>Log the first ticket</Button>}
        />
        <div style={{ marginTop: "var(--space-4)" }}><Loading rows={3} /></div>
        <div className="error-box" style={{ marginTop: "var(--space-4)" }}>
          <TriangleAlert size={12} /> The server returned an unexpected response. Please retry.
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="eyebrow">Directory</div>
        <h3 style={{ margin: "6px 0 16px" }}>Who is here</h3>
        <div className="preview-row">
          {PREVIEW_DIRECTORY.map((p) => (
            <span key={p.name} className="preview-owner">
              <Avatar name={p.name} showPresence />
              {p.name}
              {p.online && <span className="live-label"><i />live</span>}
            </span>
          ))}
        </div>
        <div style={{ marginTop: "var(--space-4)", display: "flex", gap: 8, alignItems: "center" }}>
          <Search size={14} className="muted" />
          <span className="muted">Search field, kbd and tooltips are shared with the shell.</span>
        </div>
      </section>
    </div>
  );
}

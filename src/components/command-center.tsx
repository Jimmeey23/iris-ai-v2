"use client";

import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {
  Plus, Sparkles, ArrowUpRight, ChevronRight, ChevronLeft, CalendarDays, LayoutGrid, List,
  Columns3, Grid2x2, Rss, Download, TriangleAlert, ArrowRight, Users, RefreshCw, Save,
} from 'lucide-react';
import {Shell} from './shell';
import {useTickets, Kanban, TicketCard, MatrixView, FeedView} from './tickets-board';
import {TicketGrid} from './ticket-grid';
import {TicketFilters} from './ticket-filters';
import {MetricCards, headlineMetrics, pulseMetrics} from './metric-cards';
import {useDashboardPrefs} from './use-dashboard-prefs';
import {TicketDialog} from './ticket-detail';
import {TicketComposer} from './ticket-composer';
import {api, useApp, Badge, Loading, Empty, Modal, Field} from './ui';
import {STUDIOS, CATEGORY_MAP, STATUS_LABELS} from '@/lib/constants';
import {SPECIAL_TEMPLATES} from '@/lib/guided-templates';
import type {GuidedTemplate} from '@/lib/ticket-contract';
import {slaState} from '@/lib/utils';
import {csvDownload, indiaDate} from '@/lib/display';
import {applyFilters, isClosed} from '@/lib/ticket-filtering';
import {COLUMN_META, EMPTY_FILTERS, type FilterState, type GroupBy, type TicketColumn} from '@/lib/dashboard-contract';
import {groupNamesFor, groupValue, sortTickets} from '@/lib/ticket-grouping';

const QUICK_TEMPLATES = ['membership-freeze', 'member-class-experience', 'member-compliment']
  .map((id) => SPECIAL_TEMPLATES.find((t) => t.id === id))
  .filter((t): t is GuidedTemplate => Boolean(t));

/** The tabs are shortcuts onto the same filter state the panel edits. */
const TABS = [
  {id: 'all', name: 'All tickets'},
  {id: 'attention', name: 'Needs attention'},
  {id: 'mine', name: 'Assigned to me'},
  {id: 'feedback', name: 'Feedback'},
  {id: 'sla', name: 'SLA at risk'},
];

export function CommandCenter({directory = false}: {directory?: boolean}) {
  const {tickets, loading, error, reload} = useTickets();
  const {user, view, setView, notify, staleTicketDays} = useApp();
  const {prefs, views, loaded, update, setFilters, resetFilters, saveView, deleteView} = useDashboardPrefs();

  const [detail, setDetail] = useState<number>();
  const [create, setCreate] = useState(false);
  const [template, setTemplate] = useState<GuidedTemplate>();
  const [selected, setSelected] = useState<number[]>([]);
  const [bulk, setBulk] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('in_progress');
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [page, setPage] = useState(0);

  const f = prefs.filters;

  // Any change to what is being shown puts you back on the first page; staying on page 4
  // of a list that now has two pages shows nothing and reads as a bug.
  useEffect(() => { setPage(0); }, [f, prefs.groupBy, prefs.pageSize]);

  const filtered = useMemo(() => applyFilters(tickets, f), [tickets, f]);

  // The tab is a further cut on top of the filters, not a replacement for them.
  const tabbed = useMemo(() => {
    switch (f.tab) {
      case 'attention': return filtered.filter((t) => !isClosed(t) && ['critical', 'high'].includes(t.priority));
      case 'mine': return filtered.filter((t) => Boolean(user?.staffId) && t.assignedStaffId === user?.staffId);
      case 'feedback': return filtered.filter((t) => ['compliment', 'feedback', 'assessment'].includes(t.kind));
      case 'sla': return filtered.filter((t) => !isClosed(t) && slaState(t.slaDueAt, t.status) !== 'ok');
      default: return filtered;
    }
  }, [filtered, f.tab, user]);

  const tabCounts = useMemo(() => ({
    all: filtered.length,
    attention: filtered.filter((t) => !isClosed(t) && ['critical', 'high'].includes(t.priority)).length,
    mine: filtered.filter((t) => Boolean(user?.staffId) && t.assignedStaffId === user?.staffId).length,
    feedback: filtered.filter((t) => ['compliment', 'feedback', 'assessment'].includes(t.kind)).length,
    sla: filtered.filter((t) => !isClosed(t) && slaState(t.slaDueAt, t.status) !== 'ok').length,
  }), [filtered, user]);

  const headline = useMemo(() => headlineMetrics(filtered), [filtered]);
  const pulse = useMemo(() => pulseMetrics(filtered), [filtered]);

  const open = useMemo(() => filtered.filter((t) => !isClosed(t)), [filtered]);
  const slaRisk = useMemo(() => open.filter((t) => slaState(t.slaDueAt, t.status) !== 'ok'), [open]);

  // Grouped views paginate by group, not by row: splitting a group across two pages would
  // show a header with a third of its rows under it.
  const grouped = prefs.groupBy !== 'none';
  const pageSize = prefs.pageSize;
  const pageCount = Math.max(1, Math.ceil(tabbed.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = grouped ? tabbed : sortTickets(tabbed, prefs.sortKey, prefs.sortDir).slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  function onSort(key: TicketColumn) {
    if (prefs.sortKey === key) update({sortDir: prefs.sortDir === 'asc' ? 'desc' : 'asc'});
    else update({sortKey: key, sortDir: COLUMN_META[key].numeric ? 'desc' : 'asc'});
  }

  function onToggleGroup(name: string) {
    update({
      expandedGroups: prefs.expandedGroups.includes(name)
        ? prefs.expandedGroups.filter((g) => g !== name)
        : [...prefs.expandedGroups, name],
    });
  }

  function onGroupBy(groupBy: GroupBy) {
    // Switching grouping opens every group: a screen of collapsed headers with nothing under
    // them looks like the tickets have gone.
    update({groupBy, expandedGroups: groupBy === 'none' ? [] : groupNamesFor(tabbed, groupBy)});
  }

  function applyMetricFilter(patch: Partial<FilterState>, label: string) {
    setFilters({...patch, tab: 'all'});
    update({filtersOpen: true});
    notify(`Showing ${label.toLowerCase()} in the table.`);
  }

  function exportTickets() {
    const cols = prefs.columns;
    const header = [...(grouped ? ['Group'] : []), ...cols.map((c) => COLUMN_META[c].label)];
    const value = (t: (typeof tabbed)[number], c: TicketColumn): string => {
      switch (c) {
        case 'label': return t.title;
        case 'ticketNumber': return t.ticketNumber;
        case 'member': return t.memberName || '';
        case 'kind': return t.kind;
        case 'category': return t.category;
        case 'subcategory': return t.subcategory || '';
        case 'studio': return t.studio || '';
        case 'status': return String(STATUS_LABELS[t.status] || t.status);
        case 'priority': return t.priority;
        case 'owner': return t.assignedStaffName || 'Unassigned';
        case 'department': return t.departmentName || '';
        case 'source': return t.source;
        case 'created': return indiaDate(t.createdAt);
        case 'updated': return t.updatedAt ? indiaDate(t.updatedAt) : '';
        case 'age': return String(Math.round((Date.now() - new Date(t.createdAt).getTime()) / 86400000)) + 'd';
        case 'slaDue': return t.slaDueAt ? indiaDate(t.slaDueAt) : '';
        case 'sla': return t.slaDueAt ? slaState(t.slaDueAt, t.status) : 'none';
        case 'resolved': return t.resolvedAt ? indiaDate(t.resolvedAt) : '';
        case 'timeToResolve': return t.resolvedAt ? String(Math.round((new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000)) + 'h' : '';
        default: return '';
      }
    };
    const ordered = sortTickets(tabbed, prefs.sortKey, prefs.sortDir);
    csvDownload('iris-tickets.csv', [
      header,
      ...ordered.map((t) => [...(grouped ? [groupValue(t, prefs.groupBy)] : []), ...cols.map((c) => value(t, c))]),
    ]);
    notify(`${ordered.length} tickets exported with the columns on screen.`);
  }

  async function doSaveView() {
    if (!saveName.trim()) return;
    try {
      await saveView({
        name: saveName.trim(), filters: f, groupBy: prefs.groupBy,
        columns: prefs.columns, sortKey: prefs.sortKey, sortDir: prefs.sortDir, view,
      });
      setSaveOpen(false);
      setSaveName('');
      notify('View saved to your workspace profile.');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function applyBulk() {
    setBusy(true);
    const outcomes = await Promise.allSettled(selected.map((id) => {
      const t = tickets.find((x) => x.id === id);
      return api('/api/tickets/' + id, {method: 'PATCH', body: JSON.stringify({status: bulkStatus, version: t?.version})});
    }));
    const success = outcomes.filter((o) => o.status === 'fulfilled').length;
    notify(
      `${success} ticket${success === 1 ? '' : 's'} updated${success < selected.length ? `; ${selected.length - success} could not be changed (permissions or concurrent edits).` : '.'}`,
      success < selected.length ? 'error' : 'success',
    );
    setSelected([]);
    setBulk(false);
    setBusy(false);
    await reload();
  }

  const workspace = (
    <section className="card tickets-panel">
      <div className="section-head">
        <div className="tickets-title">
          <h2>{directory ? 'All logged tickets' : 'Ticket workspace'}</h2>
          <span className="small-counter">{tabbed.length}</span>
        </div>
        <div className="flex-row">
          <button className="icon-btn" aria-label="Export tickets" title="Export what is on screen" onClick={exportTickets}><Download size={13}/></button>
          <div className="view-switch">
            <button aria-label="List view" title="List view" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={14}/></button>
            <button aria-label="Board view" title="Board view" className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><Columns3 size={14}/></button>
            <button aria-label="Card view" title="Card view" className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}><LayoutGrid size={14}/></button>
            <button aria-label="Matrix view" title="Category × status matrix" className={view === 'matrix' ? 'active' : ''} onClick={() => setView('matrix')}><Grid2x2 size={14}/></button>
            <button aria-label="Feed view" title="Chronological feed" className={view === 'feed' ? 'active' : ''} onClick={() => setView('feed')}><Rss size={14}/></button>
          </div>
        </div>
      </div>

      <div className="workspace-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={f.tab === t.id ? 'active' : ''} onClick={() => setFilters({tab: t.id})}>
            {t.name}<span>{tabCounts[t.id as keyof typeof tabCounts]}</span>
          </button>
        ))}
      </div>

      <TicketFilters
        open={prefs.filtersOpen}
        onOpenChange={(filtersOpen) => update({filtersOpen})}
        filters={f}
        onChange={setFilters}
        onReset={resetFilters}
        tickets={tickets}
        matched={tabbed.length}
        groupBy={prefs.groupBy}
        onGroupBy={onGroupBy}
        columns={prefs.columns}
        onColumns={(columns) => update({columns})}
        density={prefs.density}
        onDensity={(density) => update({density})}
        pageSize={prefs.pageSize}
        onPageSize={(n) => update({pageSize: n})}
        views={views}
        onApplyView={(v) => {
          setFilters({...EMPTY_FILTERS, ...v.filters});
          update({
            groupBy: v.groupBy,
            ...(v.columns ? {columns: v.columns} : {}),
            ...(v.sortKey ? {sortKey: v.sortKey} : {}),
            ...(v.sortDir ? {sortDir: v.sortDir} : {}),
            expandedGroups: v.groupBy === 'none' ? [] : groupNamesFor(tickets, v.groupBy),
          });
          if (v.view) setView(v.view);
          notify(`Loaded “${v.name}”.`);
        }}
        onSaveView={() => setSaveOpen(true)}
        onDeleteView={(name) => void deleteView(name).then(() => notify(`“${name}” removed.`))}
        taxonomy={CATEGORY_MAP}
        studios={STUDIOS.map((s) => s.name)}
      />

      {selected.length > 0 && (
        <div className="ticket-toolbar" style={{background: 'var(--accent-soft)'}}>
          <Badge tone="blue">{selected.length} selected</Badge>
          <button className="btn btn-sm" onClick={() => setBulk(true)}>Update status</button>
          <button className="text-btn" onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}

      {loading || !loaded ? <div style={{padding: 20}}><Loading/></div>
        : error ? <div className="error-box" style={{margin: 20}}>{error}<button className="text-btn" onClick={() => void reload()}>Retry</button></div>
        : !tabbed.length ? (
          <Empty
            art="search"
            title={f.tab === 'mine' && !user ? 'Sign in for your personal queue' : 'Nothing matches'}
            detail={f.tab === 'mine' && !user ? 'Link your staff profile to see assigned tickets.' : 'No tickets match the current filters.'}
            action={<button className="btn" onClick={resetFilters}>Clear filters</button>}
          />
        )
        : view === 'board' ? <Kanban tickets={tabbed} onSelect={setDetail}/>
        : view === 'matrix' ? <MatrixView tickets={tabbed} onCell={(category, states) => { setFilters({category, statuses: states, tab: 'all'}); setView('list'); }}/>
        : view === 'feed' ? <FeedView tickets={tabbed} onSelect={setDetail}/>
        : view === 'cards' ? <div className="ticket-cards-grid rise-stagger">{rows.map((t) => <TicketCard key={t.id} ticket={t} onSelect={setDetail}/>)}</div>
        : (
          <TicketGrid
            tickets={rows}
            columns={prefs.columns}
            groupBy={prefs.groupBy}
            sortKey={prefs.sortKey}
            sortDir={prefs.sortDir}
            density={prefs.density}
            expandedGroups={prefs.expandedGroups}
            staleDays={staleTicketDays}
            onSort={onSort}
            onToggleGroup={onToggleGroup}
            onSetGroups={(expandedGroups) => update({expandedGroups})}
            onSelect={setDetail}
            selected={selected}
            onToggleSelect={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          />
        )}

      {!['board', 'matrix', 'feed'].includes(view) && !grouped && (
        <div className="table-pagination">
          <span>{tabbed.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, tabbed.length)} of {tabbed.length} tickets</span>
          <div className="pagination-controls">
            <button disabled={!currentPage} aria-label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft size={12}/></button>
            {Array.from({length: Math.min(pageCount, 5)}, (_, i) => (
              <button key={i} className={currentPage === i ? 'active' : ''} onClick={() => setPage(i)}>{i + 1}</button>
            ))}
            <button disabled={currentPage >= pageCount - 1} aria-label="Next page" onClick={() => setPage((p) => p + 1)}><ChevronRight size={12}/></button>
          </div>
        </div>
      )}
      {grouped && !['board', 'matrix', 'feed'].includes(view) && (
        <div className="table-pagination"><span>{tabbed.length} tickets across {groupNamesFor(tabbed, prefs.groupBy).length} groups · grouping shows every row</span></div>
      )}
    </section>
  );

  return (
    <Shell
      title={directory ? 'Every ticket, one shared log.' : 'The team’s ops log.'}
      eyebrow={directory ? 'TICKET DIRECTORY' : 'INTERNAL OPERATIONS'}
      action={
        <div className="flex-row">
          <select className="btn" aria-label="Reporting date range" value={f.from || f.to ? 'custom' : f.range} onChange={(e) => setFilters({range: e.target.value, from: '', to: ''})}>
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button className="btn btn-primary" onClick={() => setCreate(true)}><Plus size={14}/>Log a ticket</button>
        </div>
      }
    >
      {!directory && (
        <div className="cc-overview">
          <div className="iris-banner">
            <span className="iris-banner-shine" aria-hidden="true"/>
            <div className="iris-orb"><Sparkles size={24}/></div>
            <div className="grow">
              <div className="flex-row"><h2>Saw something? Heard something? Tell Iris.</h2><Badge tone="blue">AI ASSISTANT</Badge></div>
              <p>Log it in your own words — Iris classifies it, links the right member or class, and routes it to the right desk with a follow-up target.</p>
            </div>
            <Link className="btn btn-primary" href="/iris">Log with Iris <ArrowUpRight size={14}/></Link>
          </div>
          <MetricCards metrics={headline} onApplyFilter={applyMetricFilter} onOpenTicket={setDetail}/>
          <div style={{marginTop: 16}}>
            <MetricCards metrics={pulse} onApplyFilter={applyMetricFilter} onOpenTicket={setDetail}/>
          </div>
        </div>
      )}

      <div className={(!directory && view === 'list' ? 'overview-grid' : '') + (!directory ? ' cc-overview' : '')} style={{marginTop: !directory ? 22 : 0}}>
        {workspace}
        {!directory && view === 'list' && (
          <aside className="sidebar-widgets">
            <section className="card insights-widget">
              <h3><Sparkles size={15} className="accent"/>Iris intelligence <Badge tone="purple">LIVE</Badge></h3>
              <p className="sub">Small signals. Meaningful action.</p>
              <div className="insight-line">
                <div className="insight-icon"><TriangleAlert size={13}/></div>
                <div>
                  <strong>{slaRisk.length} ticket{slaRisk.length === 1 ? '' : 's'} need a timely follow-up</strong>
                  <p>{slaRisk.length ? 'Bring at-risk and overdue tickets to the top of the team’s list.' : 'Every follow-up target is currently on track.'}</p>
                  <button className="text-btn" style={{fontSize: 10, marginTop: 7}} onClick={() => { setFilters({tab: 'sla'}); update({filtersOpen: true}); }}>Review priority tickets <ArrowRight size={11}/></button>
                </div>
              </div>
              <div className="insight-line">
                <div className="insight-icon" style={{color: 'var(--accent)', background: 'var(--accent-soft)'}}><Users size={13}/></div>
                <div>
                  <strong>{new Set(open.filter((t) => t.assignedStaffId).map((t) => t.assignedStaffId)).size} people carrying the load</strong>
                  <p>Tickets are matched automatically to the right department and studio owner.</p>
                </div>
              </div>
              <div className="insight-footer"><span>Based on your live ticket data</span><RefreshCw size={11}/></div>
            </section>
            <section className="card studio-pulse">
              <div className="between"><h3>Studio pulse</h3><Link className="text-btn" href="/radar">Ops Radar <ArrowUpRight size={14}/></Link></div>
              <p className="muted" style={{fontSize: 10, marginTop: 5}}>Active tickets across your studios · Live Radar</p>
              {STUDIOS.map((s, i) => {
                const count = open.filter((t) => t.studio === s.name).length;
                return (
                  <div className="studio-row" key={s.id}>
                    <div className="between"><span>{s.name.split(',')[0].replace('the Studio by ', '')}</span><strong>{count}</strong></div>
                    <div className="progress-bar"><span style={{width: (open.length ? (count / open.length) * 100 : 0) + '%', background: i % 2 ? 'var(--purple)' : 'var(--accent)'}}/></div>
                  </div>
                );
              })}
            </section>
            <section className="card quick-templates">
              <div className="between"><h3>A head start</h3><Link href="/templates" className="text-btn" style={{fontSize: 10}}>View all <ChevronRight size={11}/></Link></div>
              {QUICK_TEMPLATES.map((t) => (
                <button className="quick-template" key={t.id} onClick={() => setTemplate(t)}>
                  <div className="quick-template-icon"><CalendarDays size={14}/></div>
                  <div className="grow"><strong>{t.title}</strong><p>Guided template</p></div>
                  <ChevronRight size={12} className="muted"/>
                </button>
              ))}
            </section>
          </aside>
        )}
      </div>

      {detail && <TicketDialog open id={detail} onClose={() => setDetail(undefined)} onUpdated={() => void reload()}/>}
      <TicketComposer open={create} onClose={() => setCreate(false)} onCreated={(id) => { void reload(); setDetail(id); }}/>
      {template && <TicketComposer open template={template} onClose={() => setTemplate(undefined)} onCreated={(id) => { void reload(); setDetail(id); }}/>}

      <Modal
        open={saveOpen} onClose={() => setSaveOpen(false)} size="narrow"
        title="Save this view"
        description="Filters, grouping, columns and sort order — kept on your workspace profile, not this browser."
        footer={<><button className="btn" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!saveName.trim()} onClick={() => void doSaveView()}><Save size={13}/>Save view</button></>}
      >
        <Field label="View name"><input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Bandra · high priority"/></Field>
      </Modal>

      <Modal
        open={bulk} onClose={() => setBulk(false)} size="narrow"
        title="Update selected tickets"
        description={`${selected.length} tickets selected. Changes are individually checked for permissions and conflicts.`}
        footer={<><button className="btn" onClick={() => setBulk(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void applyBulk()}>Apply changes</button></>}
      >
        <Field label="Move to status">
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {['triaged', 'assigned', 'in_progress', 'waiting_on_member', 'waiting_on_vendor'].map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
          </select>
        </Field>
      </Modal>
    </Shell>
  );
}

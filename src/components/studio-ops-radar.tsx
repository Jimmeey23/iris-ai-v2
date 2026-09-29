"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Box,
  Move,
  Radio,
  Flame,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Wind,
  Volume2,
  Lightbulb,
  ArrowRight,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Activity,
  UserCheck,
  Eye,
  MapPin,
} from 'lucide-react';
import { Badge, Loading, useApp, api } from './ui';
import { indiaDate } from '@/lib/display';
import { isBreachedOpen } from '@/lib/metrics';
import { FLOORPLANS, type FloorplanSpot } from '@/lib/radar-floorplans';

interface RoomTicket {
  id: number;
  ticketNumber: string;
  title: string;
  summary: string;
  category: string;
  subcategory: string;
  priority: string;
  severity: string;
  status: string;
  assignedStaffName?: string | null;
  departmentName?: string | null;
  slaHours: number;
  slaDueAt?: string | null;
  createdAt: string;
  impact?: string | null;
  /** The revision quick_resolve is checked against. */
  version: number;
  resolutionRequired: boolean;
}

interface EquipmentReports {
  ac: number;
  sound: number;
  lighting: number;
}

interface RoomData {
  id: string;
  name: string;
  category: 'workout' | 'wellness' | 'amenity' | 'admin';
  description: string;
  paxCapacity: number | null;
  status: 'optimal' | 'warning' | 'critical';
  openTicketsCount: number;
  /** Open tickets in this room that mention each equipment family — reports, not readings. */
  openEquipmentReports: EquipmentReports;
  minRemainingMinutes: number | null;
  isBreached: boolean;
  slaLabel: string;
  tickets: RoomTicket[];
}

interface StudioSummary {
  id: string;
  name: string;
  shortName: string;
  city: string;
  healthScore: number;
  criticalCount: number;
  warningCount: number;
  tightestSlaMinutes: number | null;
}

interface ActiveStudio extends Omit<StudioSummary, 'criticalCount' | 'warningCount'> {
  address: string;
  studioCriticalCount: number;
  studioWarningCount: number;
  unplacedTicketsCount: number;
  rooms: RoomData[];
}

interface RadarApiResponse {
  timestamp: string;
  activeStudio: ActiveStudio;
  allStudiosSummary: StudioSummary[];
  globalRadar: {
    totalActiveIncidents: number;
    criticalIncidents: number;
    totalStudiosMonitored: number;
    networkHealthScore: number;
  };
}

const POLL_MS = 12000;

// Humanise an SLA delta given in minutes. Long-overdue tickets are common in
// seeded data, so anything past a day collapses to whole days — "-1272130m" is
// not a number anyone can read at a glance.
function formatSlaDelta(mins: number): string {
  const abs = Math.abs(mins);
  const overdue = mins < 0;
  let body: string;
  if (abs < 60) body = `${abs}m`;
  else if (abs < 1440) body = `${Math.floor(abs / 60)}h ${abs % 60}m`;
  else if (abs < 43200) body = `${Math.floor(abs / 1440)}d ${Math.floor((abs % 1440) / 60)}h`;
  else body = `${Math.floor(abs / 1440)}d`;
  return overdue ? `Overdue by ${body}` : `${body} left`;
}

/* One shared 1s clock for every ticking label. Only the components that subscribe re-render
 * each second — the radar itself re-renders on data, never on the clock. */
const clock = {
  now: Date.now(),
  listeners: new Set<() => void>(),
  timer: undefined as ReturnType<typeof setInterval> | undefined,
  subscribe(fn: () => void) {
    clock.listeners.add(fn);
    if (!clock.timer) clock.timer = setInterval(() => { clock.now = Date.now(); clock.listeners.forEach((l) => l()); }, 1000);
    return () => {
      clock.listeners.delete(fn);
      if (!clock.listeners.size && clock.timer) { clearInterval(clock.timer); clock.timer = undefined; }
    };
  },
};
const useNow = () => useSyncExternalStore(clock.subscribe, () => clock.now, () => clock.now);

/** The studio's tightest target, counted down from the snapshot the server sent. */
function TightestSla({ minutes, asOf }: { minutes: number | null; asOf: string }) {
  const now = useNow();
  if (minutes === null) return <div className="countdown-clock all-clear"><ShieldCheck size={14} /><span>No targets due</span></div>;
  const live = minutes - Math.max(0, Math.floor((now - Date.parse(asOf)) / 60000));
  return <div className={`countdown-clock ${live < 0 ? 'breached' : 'active'}`}><Clock size={14} className="clock-icon" /><span>{formatSlaDelta(live)}</span></div>;
}

/** A ticket's target line; flips to overdue on the second it passes. */
function TicketSla({ ticket }: { ticket: RoomTicket }) {
  const now = useNow();
  const overdue = isBreachedOpen(ticket, now);
  return (
    <div className="sla-progress-box">
      <div className="sla-labels">
        <span className="sla-clock"><Clock size={10} />{overdue ? 'Overdue' : 'Follow-up due'}</span>
        <span className={`sla-time ${overdue ? 'red-text' : 'accent-text'}`}>{indiaDate(ticket.slaDueAt)}</span>
      </div>
    </div>
  );
}

const EQUIPMENT_LABELS: { key: keyof EquipmentReports; label: string; short: string; icon: typeof Wind }[] = [
  { key: 'ac', label: 'Air conditioning', short: 'AC', icon: Wind },
  { key: 'sound', label: 'Sound', short: 'Sound', icon: Volume2 },
  { key: 'lighting', label: 'Lighting', short: 'Lights', icon: Lightbulb },
];
const reportsText = (n: number) => (n ? `${n} open ${n === 1 ? 'report' : 'reports'}` : 'No open reports');

async function postRadar(body: Record<string, unknown>) {
  // Raw fetch (not api()) so a 409 revision conflict can be told apart from other failures.
  const res = await fetch('/api/ops/radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  return { status: res.status, ok: res.ok, message: data.message || data.error || '' };
}

export function StudioOpsRadar({ initialStudio = 'kwality' }: { initialStudio?: string }) {
  const { notify, user } = useApp();
  const [selectedStudioId, setSelectedStudioId] = useState(initialStudio);
  const [data, setData] = useState<RadarApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  /** Rooms compared side by side. The first click selects; ⌘/Ctrl or shift adds. Kept apart
   *  from `selectedRoomId` so the single-room drawer keeps working exactly as it did. */
  const [alsoSelected, setAlsoSelected] = useState<string[]>([]);
  /** Corrections to where rooms sit, shared by the whole workspace. */
  const [layout, setLayout] = useState<Record<string, Record<string, FloorplanSpot>>>({});
  /** AI-rendered plan images matching a saved layout, per studio id. Falls back to the
   *  shipped reference photo until one has been regenerated. */
  const [layoutImages, setLayoutImages] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState(false);
  /** Rooms actually dragged since the plan image was last regenerated (or reset), per
   *  studio — so a regenerate call only asks the AI to move what changed, not redraw
   *  the whole building. */
  const [movedRooms, setMovedRooms] = useState<Record<string, Record<string, {before: FloorplanSpot; after: FloorplanSpot}>>>({});
  const [arranging, setArranging] = useState(false);
  /** Degrees of tilt. Zero is the plan seen from directly above. */
  const [tilt, setTilt] = useState(0);
  const [spin, setSpin] = useState(0);
  const dragRef = useRef<{room: string; startX: number; startY: number; origin: FloorplanSpot; box: DOMRect} | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const seq = useRef(0);

  // Only the latest request may write state, so a slow poll never overwrites a newer studio.
  // State is written in the promise callbacks, never synchronously from the effect.
  const load = useCallback((studioId: string) => {
    const id = ++seq.current;
    return api<RadarApiResponse>(`/api/ops/radar?studio=${encodeURIComponent(studioId)}`).then(
      (res) => {
        if (id !== seq.current) return;
        setData(res);
        setError('');
        setLoading(false);
        setLastUpdated(new Date());
        // Keep the selected room if it is still on the plan; otherwise the first room with open work.
        setSelectedRoomId((cur) => {
          const rooms = res.activeStudio.rooms;
          if (cur && rooms.some((r) => r.id === cur)) return cur;
          return (rooms.find((r) => r.status !== 'optimal') || rooms[0])?.id ?? null;
        });
      },
      (e: unknown) => {
        if (id !== seq.current) return;
        setError(e instanceof Error ? e.message : 'The radar could not be loaded.');
        setLoading(false);
      },
    );
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(selectedStudioId);
    setRefreshing(false);
  }, [load, selectedStudioId]);

  // Poll while the tab is visible; catch up the moment it becomes visible again.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { if (!timer) timer = setInterval(() => void load(selectedStudioId), POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { void load(selectedStudioId); start(); }
    };
    void load(selectedStudioId);
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [selectedStudioId, load]);

  useEffect(() => {
    void api<{layout: Record<string, Record<string, FloorplanSpot>>; images: Record<string, string>}>('/api/ops/radar/layout')
      .then(d => { setLayout(d.layout || {}); setLayoutImages(d.images || {}); })
      .catch(() => {});
  }, []);

  const selectedRoom = useMemo(() => {
    if (!data || !selectedRoomId) return null;
    return data.activeStudio.rooms.find((r) => r.id === selectedRoomId) || data.activeStudio.rooms[0] || null;
  }, [data, selectedRoomId]);

  async function handleQuickResolve(t: RoomTicket) {
    setResolvingId(t.id);
    try {
      const res = await postRadar({ action: 'quick_resolve', ticketId: t.id, version: t.version });
      if (res.status === 409) {
        notify(`${t.ticketNumber} changed since the radar loaded. The radar has been refreshed — check it and try again.`, 'error');
      } else if (!res.ok) {
        notify(res.message || 'The ticket could not be resolved.', 'error');
      } else {
        notify(res.message || `${t.ticketNumber} marked resolved.`);
      }
      await refresh();
    } catch {
      notify('The ticket could not be resolved. Check your connection and try again.', 'error');
    } finally {
      setResolvingId(null);
    }
  }

  async function handleDispatch(ticketId: number) {
    try {
      const res = await api<{ success: boolean; message: string }>('/api/ops/radar', {
        method: 'POST',
        body: JSON.stringify({ action: 'dispatch_staff', ticketId }),
      });
      notify(res.message || 'Studio team asked to inspect the room.');
      await refresh();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  if (loading && !data) {
    return (
      <div className="radar-loading-skeleton">
        <div className="radar-spinner-wrap">
          <Activity size={32} className="animate-pulse accent" />
          <p>Loading the studio ops radar…</p>
        </div>
        <Loading rows={4} variant="card" />
      </div>
    );
  }

  if (!data) {
    return <div className="empty-state radar-error-state"><AlertTriangle size={28} /><h3>The radar is unavailable</h3><p>{error || 'The studio feed could not be reached.'}</p><button type="button" className="btn btn-primary" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/>Retry</button></div>;
  }

  const activeStudio = data.activeStudio;
  const globalRadar = data.globalRadar;
  const floorplan = FLOORPLANS[activeStudio.id] || FLOORPLANS.kwality;
  /** The plan as drawn, with any corrections laid over it. Plain object rather than a memo:
   *  this sits after an early return, where a hook cannot go. */
  const spots: Record<string, FloorplanSpot> = {...floorplan.rooms, ...(layout[activeStudio.id] || {})};
  const floorplanSrc = layoutImages[activeStudio.id] || floorplan.src;

  /** Dragging writes straight into `layout`, so the room follows the pointer; the save
   *  happens once on release rather than on every frame. */
  const startDrag = (roomName: string, e: React.PointerEvent<HTMLElement>) => {
    if (!arranging) return;
    const model = (e.currentTarget as HTMLElement).closest('.floorplan-model');
    if (!model) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {room: roomName, startX: e.clientX, startY: e.clientY, origin: spots[roomName], box: model.getBoundingClientRect()};
  };
  const onDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.box.width) * 100;
    const dy = ((e.clientY - d.startY) / d.box.height) * 100;
    // Clamped so a room cannot be dragged off the plan and lost.
    const x = Math.max(-2, Math.min(100 - d.origin.w + 2, d.origin.x + dx));
    const y = Math.max(-2, Math.min(100 - d.origin.h + 2, d.origin.y + dy));
    setLayout(l => ({...l, [activeStudio.id]: {...(l[activeStudio.id] || {}), [d.room]: {...d.origin, x, y}}}));
  };
  const endDrag = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const rooms = {...spots, ...(layout[activeStudio.id] || {})};
    const after = rooms[d.room];
    try {
      await api('/api/ops/radar/layout', {method: 'PUT', body: JSON.stringify({studio: activeStudio.id, rooms})});
      setMovedRooms(m => {
        const forStudio = m[activeStudio.id] || {};
        // Keep the very first "before" if this room was already nudged this session,
        // so the regenerate prompt describes the whole move, not the last pixel of it.
        const before = forStudio[d.room]?.before ?? d.origin;
        return {...m, [activeStudio.id]: {...forStudio, [d.room]: {before, after}}};
      });
      notify(`${d.room} moved. Everyone now sees it here.`);
    } catch (e) {
      // The optimistic move above only lives in this tab's state — if the save failed,
      // put the room back where the saved plan actually has it so the two never disagree.
      setLayout(l => ({...l, [activeStudio.id]: {...(l[activeStudio.id] || {}), [d.room]: d.origin}}));
      notify(e instanceof Error ? e.message : 'The new position could not be saved', 'error');
    }
  };
  const regenerateImage = async () => {
    const changes = movedRooms[activeStudio.id] || {};
    const changedRooms = Object.entries(changes).map(([room, c]) => ({room, before: c.before, after: c.after}));
    if (!changedRooms.length) {
      notify('Move a room first — regenerating redraws only what changed.', 'error');
      return;
    }
    setRegenerating(true);
    try {
      const res = await api<{imageUrl: string}>('/api/ops/radar/layout/regenerate', {
        method: 'POST',
        body: JSON.stringify({studio: activeStudio.id, studioName: activeStudio.name, changedRooms, allRooms: Object.keys(spots)}),
      });
      setLayoutImages(m => ({...m, [activeStudio.id]: res.imageUrl}));
      setMovedRooms(m => ({...m, [activeStudio.id]: {}}));
      notify('The floor plan has been redrawn — only the moved rooms changed.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The plan could not be regenerated', 'error');
    } finally {
      setRegenerating(false);
    }
  };
  const resetLayout = async () => {
    try {
      const res = await api<{layout: Record<string, unknown>; images: Record<string, string>}>('/api/ops/radar/layout', {method: 'DELETE', body: JSON.stringify({studio: activeStudio.id})});
      setLayout(l => { const next = {...l}; delete next[activeStudio.id]; return next; });
      setLayoutImages(res.images || {});
      setMovedRooms(m => ({...m, [activeStudio.id]: {}}));
      notify('Room positions restored to the original plan.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not restore the plan', 'error');
    }
  };

  /** Click selects; ⌘/Ctrl or shift adds to the comparison. */
  const pickRoom = (roomId: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      setAlsoSelected(list => list.includes(roomId) ? list.filter(r => r !== roomId) : [...list, roomId]);
      return;
    }
    setAlsoSelected([]);
    setSelectedRoomId(roomId);
  };

  return (
    <div className="studio-ops-radar-container">
      {/* 1. Network summary */}
      <section className="radar-telemetry-banner">
        <div className="telemetry-brand">
          <div className="radar-ping-icon">
            <Radio size={20} className="radar-live-icon" />
            <span className="ping-ring" />
          </div>
          <div>
            <div className="telemetry-title-row">
              <h2>Studio ops radar</h2>
              <span className="live-pill">
                <span className="pulse-dot" />
                Live
              </span>
            </div>
            <p className="telemetry-subtitle">
              Every room on the plan, coloured by its open tickets and their follow-up targets
            </p>
          </div>
        </div>

        <div className="telemetry-stats-row">
          <div className="telemetry-metric-box">
            <span className="t-label">Network health</span>
            <div className="t-val-row">
              <span className="t-val accent-text">{globalRadar.networkHealthScore}%</span>
              <span className="t-sub">Across {globalRadar.totalStudiosMonitored} sites</span>
            </div>
          </div>

          <div className="telemetry-metric-box">
            <span className="t-label">Open tickets</span>
            <div className="t-val-row">
              <span className={`t-val ${globalRadar.criticalIncidents > 0 ? 'red-text' : 'amber-text'}`}>
                {globalRadar.totalActiveIncidents}
              </span>
              <span className="t-sub">{globalRadar.criticalIncidents} critical</span>
            </div>
          </div>

          <div className="telemetry-metric-box countdown-box">
            <span className="t-label">Tightest target</span>
            <div className="t-val-row">
              <TightestSla minutes={activeStudio.tightestSlaMinutes} asOf={data.timestamp} />
            </div>
          </div>

          <button
            type="button"
            className="radar-sync-btn"
            onClick={() => void refresh()}
            disabled={refreshing}
            title={lastUpdated ? `Last updated ${indiaDate(lastUpdated)}` : 'Load the latest tickets'}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {error && <div className="error-box radar-refresh-error" role="alert">Refresh failed. Showing the last successful snapshot. <button type="button" className="text-btn" onClick={() => void refresh()}>Retry</button></div>}

      {/* 2. Studio selector */}
      <nav className="studio-tabs-nav" aria-label="Studios">
        {data.allStudiosSummary.map((st) => {
          const isCurrent = st.id === selectedStudioId;
          const hasCritical = st.criticalCount > 0;
          const hasWarning = st.warningCount > 0;
          // Health drives the meter colour independently of incident counts: a
          // site can be all-clear right now and still be sitting at 60%.
          const healthTone = st.healthScore >= 90 ? 'good' : st.healthScore >= 60 ? 'mid' : 'bad';

          return (
            <button
              type="button"
              key={st.id}
              aria-pressed={isCurrent}
              className={`studio-tab-card ${isCurrent ? 'active' : ''} ${hasCritical ? 'has-critical' : hasWarning ? 'has-warning' : 'all-optimal'}`}
              onClick={() => {
                setSelectedStudioId(st.id);
                setSelectedRoomId(null);
              }}
            >
              <span className="studio-tab-rail" aria-hidden />
              <div className="studio-tab-top">
                <Building2 size={13} className="studio-tab-icon" />
                <strong>{st.shortName}</strong>
                {isCurrent && <span className="studio-viewing-badge">Viewing</span>}
                <span className={`health-tag ${healthTone}`}>{st.healthScore}%</span>
              </div>
              <div className={`studio-health-meter ${healthTone}`} aria-hidden>
                <i style={{ width: `${Math.max(st.healthScore, 3)}%` }} />
              </div>
              <div className="studio-tab-sub">
                <span className="studio-tab-city">{st.city}</span>
                {hasCritical ? (
                  <span className="badge-critical-pill"><Flame size={9} /> {st.criticalCount} critical</span>
                ) : hasWarning ? (
                  <span className="badge-warning-pill"><AlertTriangle size={9} /> {st.warningCount} open</span>
                ) : (
                  <span className="badge-optimal-pill"><CheckCircle2 size={9} /> All clear</span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* 3. Room plan heatmap + room inspector */}
      <div className="radar-layout-grid">
        <div className="floorplan-heatmap-container">
          <div className="floorplan-head">
            <div className="head-left">
              <h3>{activeStudio.name} — room plan</h3>
              {activeStudio.unplacedTicketsCount > 0 && (
                <span className="manager-tag">{activeStudio.unplacedTicketsCount} open {activeStudio.unplacedTicketsCount === 1 ? 'ticket names' : 'tickets name'} no room</span>
              )}
            </div>
            <div className="legend-pills">
              <span className="legend-item optimal"><i /> No open tickets</span>
              <span className="legend-item warning"><i /> Open tickets</span>
              <span className="legend-item critical"><i /> Needs attention</span>
            </div>
          </div>

          <div className="floorplan-tools">
            <div className="fp-tool-group" role="group" aria-label="Plan view">
              <button
                type="button"
                className={"fp-tool" + (tilt === 0 ? " is-on" : "")}
                onClick={() => { setTilt(0); setSpin(0); }}
                aria-pressed={tilt === 0}
              >
                Flat
              </button>
              <button
                type="button"
                className={"fp-tool" + (tilt > 0 ? " is-on" : "")}
                onClick={() => setTilt(t => (t > 0 ? 0 : 52))}
                aria-pressed={tilt > 0}
              >
                <Box size={13} /> 3D
              </button>
            </div>
            {tilt > 0 && (
              <div className="fp-tool-group fp-sliders">
                <label>
                  <span className="sr-only">Tilt</span>
                  <input type="range" min={10} max={70} value={tilt} onChange={e => setTilt(Number(e.target.value))} aria-label="Tilt the plan" />
                </label>
                <label>
                  <span className="sr-only">Rotate</span>
                  <input type="range" min={-45} max={45} value={spin} onChange={e => setSpin(Number(e.target.value))} aria-label="Rotate the plan" />
                </label>
              </div>
            )}
            {user?.role === 'admin' && (
              <div className="fp-tool-group">
                <button
                  type="button"
                  className={"fp-tool" + (arranging ? " is-on" : "")}
                  onClick={() => setArranging(v => !v)}
                  aria-pressed={arranging}
                  title="Drag rooms to match the real building. Everyone sees the same plan."
                >
                  <Move size={13} /> {arranging ? 'Done arranging' : 'Arrange rooms'}
                </button>
                {arranging && Object.keys(movedRooms[activeStudio.id] || {}).length > 0 && (
                  <button
                    type="button"
                    className="fp-tool"
                    onClick={() => void regenerateImage()}
                    disabled={regenerating}
                    title="Ask the AI to redraw only the rooms that moved, keeping the rest of the plan identical"
                  >
                    <Sparkles size={13} className={regenerating ? 'animate-pulse' : ''} /> {regenerating ? 'Redrawing…' : 'Regenerate plan'}
                  </button>
                )}
                {arranging && layout[activeStudio.id] && (
                  <button type="button" className="fp-tool" onClick={() => void resetLayout()}>Reset</button>
                )}
              </div>
            )}
            {alsoSelected.length > 0 && (
              <span className="fp-selection-note">
                {alsoSelected.length + 1} rooms compared
                <button type="button" onClick={() => setAlsoSelected([])}>clear</button>
              </span>
            )}
          </div>

          <div
            className={"floorplan-stage floorplan-architectural-stage" + (tilt > 0 ? " is-tilted" : "") + (arranging ? " is-arranging" : "")}
            style={{'--fp-tilt': `${tilt}deg`, '--fp-spin': `${spin}deg`} as CSSProperties}
          >
          <div className="floorplan-model" style={{aspectRatio: `${floorplan.width} / ${floorplan.height}`}}>
            <Image
              src={floorplanSrc}
              alt={`Bird’s-eye architectural floor plan of ${activeStudio.name}`}
              fill
              priority
              unoptimized={floorplanSrc.startsWith('data:')}
              sizes="(max-width: 1150px) 100vw, 70vw"
              className="floorplan-render"
            />
            {activeStudio.rooms.map((room) => {
              const isSelected = selectedRoom?.id === room.id || alsoSelected.includes(room.id);
              const hasCritical = room.status === 'critical';
              const hasWarning = room.status === 'warning';
              const statusText = hasCritical ? 'needs attention' : hasWarning ? `${room.openTicketsCount} open` : 'no open tickets';
              const spot = spots[room.name];
              if (!spot) return null;
              const spotStyle = {'--room-x': `${spot.x}%`, '--room-y': `${spot.y}%`, '--room-w': `${spot.w}%`, '--room-h': `${spot.h}%`} as CSSProperties;

              return (
                <button
                  type="button"
                  key={room.id}
                  className={`floorplan-room-hotspot ${room.category} ${room.status} ${isSelected ? 'selected' : ''}`}
                  style={spotStyle}
                  aria-pressed={isSelected}
                  aria-label={`${room.name}, ${statusText}${isSelected ? ', selected' : ''}`}
                  onClick={(e) => pickRoom(room.id, e)}
                  onPointerDown={(e) => startDrag(room.name, e)}
                  onPointerMove={onDrag}
                  onPointerUp={() => void endDrag()}
                >
                  <span className="floorplan-room-focus" aria-hidden />
                  <span className="floorplan-room-label">
                    <strong>{room.name}</strong>
                    <small>{hasCritical ? 'Needs attention' : hasWarning ? `${room.openTicketsCount} open · ${room.slaLabel}` : 'Clear'}</small>
                  </span>
                  <span className={`floorplan-status-beacon ${room.status}`} aria-hidden>
                    {hasCritical ? <Flame size={12}/> : hasWarning ? <AlertTriangle size={12}/> : <CheckCircle2 size={12}/>}
                  </span>
                  {isSelected && <span className="floorplan-selected-tag"><MapPin size={11}/> Viewing</span>}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        <aside className="room-inspector-drawer" aria-label="Room details">
          {selectedRoom ? (
            <div className="inspector-content">
              <div className="inspector-header">
                <div className="header-top">
                  <div>
                    <span className="room-super-tag">{activeStudio.shortName}</span>
                    <h3 className="inspector-room-name">{selectedRoom.name}</h3>
                  </div>
                  <Badge tone={selectedRoom.status === 'critical' ? 'red' : selectedRoom.status === 'warning' ? 'amber' : 'green'}>
                    {selectedRoom.status === 'critical' ? 'Needs attention' : selectedRoom.status === 'warning' ? 'Open tickets' : 'Clear'}
                  </Badge>
                </div>

                <p className="inspector-room-specs">
                  {selectedRoom.paxCapacity ? <>Capacity: <strong>{selectedRoom.paxCapacity}</strong> · </> : null}Type: <strong>{selectedRoom.category}</strong>
                  {selectedRoom.description && <><br />{selectedRoom.description}</>}
                </p>
              </div>

              <div className="diagnostics-panel">
                <div className="diag-cell">
                  <span className="d-label">Open tickets</span>
                  <strong className="d-val">{selectedRoom.openTicketsCount}</strong>
                  <span className="d-sub">{selectedRoom.slaLabel}</span>
                </div>
                {EQUIPMENT_LABELS.map(({ key, label }) => {
                  const n = selectedRoom.openEquipmentReports[key];
                  return (
                    <div key={key} className="diag-cell">
                      <span className="d-label">{label}</span>
                      <strong className={`d-val ${n ? 'red-text' : 'green-text'}`}>{n}</strong>
                      <span className="d-sub">{reportsText(n)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="inspector-incidents-section">
                <div className="incidents-section-head">
                  <div className="left">
                    <Activity size={13} className="accent" />
                    <h4>Open tickets in this room ({selectedRoom.tickets.length})</h4>
                  </div>
                  {selectedRoom.tickets.length > 0 && (
                    <span className="sla-urgent-pill">{selectedRoom.slaLabel}</span>
                  )}
                </div>

                {selectedRoom.tickets.length === 0 ? (
                  <div className="empty-room-state">
                    <CheckCircle2 size={24} className="green-text mb-2" />
                    <strong>Nothing open in {selectedRoom.name}</strong>
                    <p>No open tickets are filed against this room.</p>
                    <Link href="/iris" className="btn btn-primary btn-sm">
                      <Sparkles size={12} />
                      <span>Log it with IRIS</span>
                    </Link>
                  </div>
                ) : (
                  <div className="active-tickets-stack">
                    {selectedRoom.tickets.map((t) => (
                      <div key={t.id} className={`incident-ticket-card ${t.priority}`}>
                        <div className="ticket-top-row">
                          <span className="ticket-number-tag">{t.ticketNumber}</span>
                          <span className={`priority-badge ${t.priority}`}>{t.priority}</span>
                        </div>

                        <strong className="ticket-title-text">{t.title}</strong>
                        <p className="ticket-category-sub">{t.category} → {t.subcategory}</p>

                        {t.slaDueAt && <TicketSla ticket={t} />}

                        <div className="incident-actions-row">
                          <button
                            type="button"
                            className="btn btn-success btn-xs"
                            disabled={resolvingId === t.id}
                            aria-busy={resolvingId === t.id || undefined}
                            onClick={() => void handleQuickResolve(t)}
                          >
                            <CheckCircle2 size={12} />
                            <span>{resolvingId === t.id ? 'Resolving…' : 'Resolve ticket'}</span>
                          </button>

                          <button
                            type="button"
                            className="btn btn-outline btn-xs"
                            onClick={() => void handleDispatch(t.id)}
                          >
                            <UserCheck size={12} />
                            <span>Ask studio team</span>
                          </button>

                          <Link href={`/tickets/${t.id}`} className="btn btn-ghost btn-xs">
                            <Eye size={12} />
                            <span>Open ticket</span>
                            <ChevronRight size={10} />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="drawer-iris-shortcut-card">
                <div className="shortcut-text">
                  <Sparkles size={14} className="accent" />
                  <div>
                    <strong>Need to log something in {selectedRoom.name}?</strong>
                    <span>Tell IRIS the room and studio and it files the ticket against them.</span>
                  </div>
                </div>
                <Link href="/iris" className="btn btn-soft btn-sm">
                  <span>Chat with IRIS</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="no-room-selected">
              <p>Select a room on the plan to see its open tickets.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

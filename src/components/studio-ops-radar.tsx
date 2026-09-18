"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Radio,
  Flame,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Users,
  Thermometer,
  Wind,
  Volume2,
  Lightbulb,
  ArrowRight,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Wrench,
  ChevronRight,
  Zap,
  Activity,
  UserCheck,
  Eye,
} from 'lucide-react';
import { Badge, useApp, api } from './ui';

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
  assignedStaffName?: string;
  departmentName?: string;
  slaHours: number;
  slaDueAt?: string;
  createdAt: string;
  impact?: string;
}

interface RoomData {
  id: string;
  name: string;
  category: 'workout' | 'wellness' | 'amenity' | 'admin';
  paxCapacity: number;
  currentPax: number;
  activeTrainer?: string;
  activeClass?: string;
  ambientTemp: number;
  acStatus: 'optimal' | 'calibrating' | 'service_required';
  soundStatus: 'optimal' | 'glitch' | 'offline';
  lightingStatus: 'optimal' | 'dimmed' | 'fault';
  status: 'optimal' | 'warning' | 'critical';
  openTicketsCount: number;
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

interface ActiveStudio extends StudioSummary {
  address: string;
  leadManager: string;
  contactNumber: string;
  studioCriticalCount: number;
  studioWarningCount: number;
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

export function StudioOpsRadar({ initialStudio = 'kwality' }: { initialStudio?: string }) {
  const { notify } = useApp();
  const [selectedStudioId, setSelectedStudioId] = useState(initialStudio);
  const [data, setData] = useState<RadarApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Keep live SLA ticking every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Radar data
  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await api<RadarApiResponse>(`/api/ops/radar?studio=${encodeURIComponent(selectedStudioId)}`);
      setData(res);
      // Auto-select first room with incident or first room
      if (!selectedRoomId && res.activeStudio.rooms.length > 0) {
        const incidentRoom = res.activeStudio.rooms.find((r) => r.status !== 'optimal');
        setSelectedRoomId(incidentRoom ? incidentRoom.id : res.activeStudio.rooms[0].id);
      }
    } catch {
      // Handled
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), 12000);
    return () => clearInterval(interval);
  }, [selectedStudioId]);

  // Selected room details
  const selectedRoom = useMemo(() => {
    if (!data || !selectedRoomId) return null;
    return data.activeStudio.rooms.find((r) => r.id === selectedRoomId) || data.activeStudio.rooms[0];
  }, [data, selectedRoomId]);

  // 1-Click Fast Resolution from Radar
  async function handleQuickResolve(ticketId: number) {
    setResolvingId(ticketId);
    try {
      const res = await api<{ success: boolean; message: string }>('/api/ops/radar', {
        method: 'POST',
        body: JSON.stringify({ action: 'quick_resolve', ticketId }),
      });
      notify(res.message || 'Ticket marked resolved!');
      await fetchData(true);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setResolvingId(null);
    }
  }

  // 1-Click Dispatch Duty Lead
  async function handleDispatch(ticketId: number) {
    try {
      const res = await api<{ success: boolean; message: string }>('/api/ops/radar', {
        method: 'POST',
        body: JSON.stringify({ action: 'dispatch_staff', ticketId }),
      });
      notify(res.message || 'Dispatched on-site lead!');
      await fetchData(true);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  if (loading && !data) {
    return (
      <div className="radar-loading-skeleton">
        <div className="radar-spinner-wrap">
          <Activity size={32} className="animate-pulse accent" />
          <p>Connecting to Studio Floor Sensors &amp; Live SLA Radar…</p>
        </div>
      </div>
    );
  }

  const activeStudio = data?.activeStudio;
  const globalRadar = data?.globalRadar;

  return (
    <div className="studio-ops-radar-container">
      {/* 1. TOP EXECUTIVE TELEMETRY & GLOBAL SLA RADAR BAR */}
      <section className="radar-telemetry-banner">
        <div className="telemetry-brand">
          <div className="radar-ping-icon">
            <Radio size={20} className="radar-live-icon" />
            <span className="ping-ring" />
          </div>
          <div>
            <div className="telemetry-title-row">
              <h2>Studio Floor Operations Radar &amp; SLA Heatmap</h2>
              <span className="live-pill">
                <span className="pulse-dot" />
                LIVE RADAR
              </span>
            </div>
            <p className="telemetry-subtitle">
              Real-time architectural layout, environmental sensors, room occupancy &amp; SLA breach countdown
            </p>
          </div>
        </div>

        <div className="telemetry-stats-row">
          {/* Global Network Health */}
          <div className="telemetry-metric-box">
            <span className="t-label">NETWORK HEALTH</span>
            <div className="t-val-row">
              <span className="t-val accent-text">{globalRadar?.networkHealthScore || 100}%</span>
              <span className="t-sub">Across 4 Sites</span>
            </div>
          </div>

          {/* Active Incidents */}
          <div className="telemetry-metric-box">
            <span className="t-label">ACTIVE SNAGS</span>
            <div className="t-val-row">
              <span className={`t-val ${(globalRadar?.criticalIncidents || 0) > 0 ? 'red-text' : 'amber-text'}`}>
                {globalRadar?.totalActiveIncidents || 0}
              </span>
              <span className="t-sub">{globalRadar?.criticalIncidents || 0} Critical</span>
            </div>
          </div>

          {/* Tightest SLA Countdown Clock */}
          <div className="telemetry-metric-box countdown-box">
            <span className="t-label">TIGHTEST SLA DEADLINE</span>
            <div className="t-val-row">
              {activeStudio?.tightestSlaMinutes !== null && activeStudio?.tightestSlaMinutes !== undefined ? (
                <div className={`countdown-clock ${activeStudio.tightestSlaMinutes < 0 ? 'breached' : 'active'}`}>
                  <Clock size={14} className="clock-icon" />
                  <span>
                    {activeStudio.tightestSlaMinutes < 0
                      ? `OVERDUE -${Math.abs(activeStudio.tightestSlaMinutes)}m`
                      : `${activeStudio.tightestSlaMinutes}m left`}
                  </span>
                </div>
              ) : (
                <div className="countdown-clock all-clear">
                  <ShieldCheck size={14} />
                  <span>All SLAs Clear</span>
                </div>
              )}
            </div>
          </div>

          {/* Sync Button */}
          <button
            type="button"
            className="radar-sync-btn"
            onClick={() => void fetchData(true)}
            disabled={refreshing}
            title="Poll latest telemetry and tickets"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Syncing…' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {/* 2. STUDIO LOCATION SELECTOR TABS */}
      <nav className="studio-tabs-nav">
        {data?.allStudiosSummary.map((st) => {
          const isCurrent = st.id === selectedStudioId;
          const hasCritical = st.criticalCount > 0;
          const hasWarning = st.warningCount > 0;

          return (
            <button
              type="button"
              key={st.id}
              className={`studio-tab-card ${isCurrent ? 'active' : ''} ${hasCritical ? 'has-critical' : hasWarning ? 'has-warning' : 'all-optimal'}`}
              onClick={() => {
                setSelectedStudioId(st.id);
                setSelectedRoomId(null);
              }}
            >
              <div className="studio-tab-top">
                <Building2 size={13} />
                <strong>{st.shortName}</strong>
                <span className="health-tag">{st.healthScore}%</span>
              </div>
              <div className="studio-tab-sub">
                <span>{st.city}</span>
                {hasCritical ? (
                  <span className="badge-critical-pill">🚨 {st.criticalCount} Critical</span>
                ) : hasWarning ? (
                  <span className="badge-warning-pill">⚠️ {st.warningCount} Snag</span>
                ) : (
                  <span className="badge-optimal-pill">✓ All Clear</span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* 3. MAIN DUAL VIEW: ARCHITECTURAL FLOORPLAN GRID + DEEP ROOM INSPECTOR */}
      <div className="radar-layout-grid">
        {/* LEFT/CENTER: ARCHITECTURAL FLOORPLAN HEATMAP */}
        <div className="floorplan-heatmap-container">
          <div className="floorplan-head">
            <div className="head-left">
              <h3>{activeStudio?.name} — Floorplan Radar</h3>
              <span className="manager-tag">Duty Lead: {activeStudio?.leadManager}</span>
            </div>
            <div className="legend-pills">
              <span className="legend-item optimal"><i /> Optimal</span>
              <span className="legend-item warning"><i /> Active Snag</span>
              <span className="legend-item critical"><i /> SLA Alert</span>
            </div>
          </div>

          {/* ROOM CARDS SCHEMATIC */}
          <div className="rooms-schematic-grid">
            {activeStudio?.rooms.map((room) => {
              const isSelected = selectedRoom?.id === room.id;
              const hasCritical = room.status === 'critical';
              const hasWarning = room.status === 'warning';
              const occupancyPct = Math.round((room.currentPax / room.paxCapacity) * 100);

              return (
                <div
                  key={room.id}
                  className={`room-radar-card ${room.category} ${room.status} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  {/* Status Indicator / Pulse */}
                  {hasCritical && <span className="room-pulse-ring" />}

                  <div className="room-card-head">
                    <div className="room-title-wrap">
                      <strong>{room.name}</strong>
                      <span className={`room-category-badge ${room.category}`}>{room.category}</span>
                    </div>
                    {hasCritical ? (
                      <span className="room-alert-badge critical">
                        <Flame size={11} />
                        SLA ALERT
                      </span>
                    ) : hasWarning ? (
                      <span className="room-alert-badge warning">
                        <AlertTriangle size={11} />
                        SNAG
                      </span>
                    ) : (
                      <span className="room-alert-badge optimal">
                        <CheckCircle2 size={11} />
                        OPTIMAL
                      </span>
                    )}
                  </div>

                  {/* Class / Trainer Info if Workout Studio */}
                  {room.category === 'workout' && (
                    <div className="room-class-info">
                      <span className="class-name">{room.activeClass || 'Open Studio Floor'}</span>
                      <span className="trainer-name">{room.activeTrainer ? `w/ ${room.activeTrainer}` : 'Floor Staff'}</span>
                    </div>
                  )}

                  {/* Pax Capacity Bar */}
                  <div className="occupancy-section">
                    <div className="occupancy-labels">
                      <span className="occ-label"><Users size={10} /> Occupancy</span>
                      <span className="occ-count">{room.currentPax} / {room.paxCapacity} pax</span>
                    </div>
                    <div className="occupancy-bar-track">
                      <div
                        className={`occupancy-bar-fill ${occupancyPct > 85 ? 'high' : ''}`}
                        style={{ width: `${Math.min(occupancyPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Environmental Sensors Row */}
                  <div className="environmental-sensors-row">
                    <div className={`sensor-item ${room.ambientTemp > 24.5 ? 'alert' : ''}`} title="Ambient Room Temperature">
                      <Thermometer size={11} />
                      <span>{room.ambientTemp}°C</span>
                    </div>
                    <div className={`sensor-item ${room.acStatus !== 'optimal' ? 'alert' : ''}`} title={`AC Status: ${room.acStatus}`}>
                      <Wind size={11} />
                      <span>AC {room.acStatus === 'optimal' ? 'OK' : 'ERR'}</span>
                    </div>
                    <div className={`sensor-item ${room.soundStatus !== 'optimal' ? 'alert' : ''}`} title={`Sound/Mic: ${room.soundStatus}`}>
                      <Volume2 size={11} />
                      <span>Audio</span>
                    </div>
                    <div className={`sensor-item ${room.lightingStatus !== 'optimal' ? 'alert' : ''}`} title={`Lighting: ${room.lightingStatus}`}>
                      <Lightbulb size={11} />
                      <span>Lights</span>
                    </div>
                  </div>

                  {/* SLA Countdown Badge (if incident active) */}
                  {room.openTicketsCount > 0 && (
                    <div className={`room-sla-countdown-footer ${hasCritical ? 'critical' : 'warning'}`}>
                      <Clock size={11} />
                      <span>{room.slaLabel}</span>
                      <span className="tickets-badge">{room.openTicketsCount} snag</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: ROOM INSPECTOR DRAWER */}
        <aside className="room-inspector-drawer">
          {selectedRoom ? (
            <div className="inspector-content">
              {/* Drawer Header */}
              <div className="inspector-header">
                <div className="header-top">
                  <div>
                    <span className="room-super-tag">{activeStudio?.shortName}</span>
                    <h3 className="inspector-room-name">{selectedRoom.name}</h3>
                  </div>
                  <Badge tone={selectedRoom.status === 'critical' ? 'red' : selectedRoom.status === 'warning' ? 'amber' : 'green'}>
                    {selectedRoom.status.toUpperCase()}
                  </Badge>
                </div>

                <p className="inspector-room-specs">
                  Capacity: <strong>{selectedRoom.paxCapacity} pax</strong> · Type: <strong>{selectedRoom.category}</strong>
                  {selectedRoom.activeTrainer && ` · Instructor: ${selectedRoom.activeTrainer}`}
                </p>
              </div>

              {/* Environmental Diagnostics Grid */}
              <div className="diagnostics-panel">
                <div className="diag-cell">
                  <span className="d-label">TEMPERATURE</span>
                  <strong className="d-val">{selectedRoom.ambientTemp}°C</strong>
                  <span className="d-sub">{selectedRoom.ambientTemp <= 22 ? 'Chilled / Optimal' : 'Needs Cooling'}</span>
                </div>
                <div className="diag-cell">
                  <span className="d-label">HVAC / AC SYSTEM</span>
                  <strong className={`d-val ${selectedRoom.acStatus !== 'optimal' ? 'red-text' : 'green-text'}`}>
                    {selectedRoom.acStatus === 'optimal' ? 'Functional' : 'Check Service'}
                  </strong>
                  <span className="d-sub">Carrier Inverter V3</span>
                </div>
                <div className="diag-cell">
                  <span className="d-label">SOUND &amp; MIC</span>
                  <strong className={`d-val ${selectedRoom.soundStatus !== 'optimal' ? 'amber-text' : 'green-text'}`}>
                    {selectedRoom.soundStatus === 'optimal' ? 'Calibrated' : 'Check Headset'}
                  </strong>
                  <span className="d-sub">Bose Pro Audio</span>
                </div>
                <div className="diag-cell">
                  <span className="d-label">LIGHTING FIXTURES</span>
                  <strong className={`d-val ${selectedRoom.lightingStatus !== 'optimal' ? 'red-text' : 'green-text'}`}>
                    {selectedRoom.lightingStatus === 'optimal' ? 'Functional' : 'Check Fixtures'}
                  </strong>
                  <span className="d-sub">Dimmable LED Panels</span>
                </div>
              </div>

              {/* Active Tickets / Snag List */}
              <div className="inspector-incidents-section">
                <div className="incidents-section-head">
                  <div className="left">
                    <Activity size={13} className="accent" />
                    <h4>Active Incidents in this Space ({selectedRoom.tickets.length})</h4>
                  </div>
                  {selectedRoom.tickets.length > 0 && (
                    <span className="sla-urgent-pill">{selectedRoom.slaLabel}</span>
                  )}
                </div>

                {selectedRoom.tickets.length === 0 ? (
                  <div className="empty-room-state">
                    <CheckCircle2 size={24} className="green-text mb-2" />
                    <strong>All Systems Clear in {selectedRoom.name}</strong>
                    <p>No active facility disruptions or open complaints recorded for this space.</p>
                    <Link
                      href={`/iris`}
                      className="btn-create-snag"
                    >
                      <Sparkles size={12} />
                      <span>Log Observation with IRIS</span>
                    </Link>
                  </div>
                ) : (
                  <div className="active-tickets-stack">
                    {selectedRoom.tickets.map((t) => {
                      const isOverdue = t.slaDueAt ? new Date(t.slaDueAt).getTime() < now : false;

                      return (
                        <div key={t.id} className={`incident-ticket-card ${t.priority}`}>
                          <div className="ticket-top-row">
                            <span className="ticket-number-tag">{t.ticketNumber}</span>
                            <span className={`priority-badge ${t.priority}`}>{t.priority.toUpperCase()}</span>
                          </div>

                          <strong className="ticket-title-text">{t.title}</strong>
                          <p className="ticket-category-sub">{t.category} → {t.subcategory}</p>

                          {/* SLA Urgency Countdown Meter */}
                          {t.slaDueAt && (
                            <div className="sla-progress-box">
                              <div className="sla-labels">
                                <span className="sla-clock">
                                  <Clock size={10} />
                                  {isOverdue ? 'SLA BREACHED' : 'Target SLA Due'}
                                </span>
                                <span className={`sla-time ${isOverdue ? 'red-text' : 'accent-text'}`}>
                                  {new Date(t.slaDueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons for this Ticket */}
                          <div className="incident-actions-row">
                            <button
                              type="button"
                              className="btn-quick-resolve"
                              disabled={resolvingId === t.id}
                              onClick={() => void handleQuickResolve(t.id)}
                            >
                              <CheckCircle2 size={12} />
                              <span>{resolvingId === t.id ? 'Resolving…' : 'Resolve Snag (1-Click)'}</span>
                            </button>

                            <button
                              type="button"
                              className="btn-dispatch-lead"
                              onClick={() => void handleDispatch(t.id)}
                            >
                              <UserCheck size={12} />
                              <span>Dispatch Duty Lead</span>
                            </button>

                            <Link href={`/tickets?id=${t.id}`} className="btn-view-ticket">
                              <Eye size={12} />
                              <span>Full Ticket</span>
                              <ChevronRight size={10} />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Launch IRIS Assistant Pre-Filled */}
              <div className="drawer-iris-shortcut-card">
                <div className="shortcut-text">
                  <Sparkles size={14} className="accent" />
                  <div>
                    <strong>Need to log something in {selectedRoom.name}?</strong>
                    <span>IRIS automatically links {selectedRoom.name} and {activeStudio?.shortName}</span>
                  </div>
                </div>
                <Link href={`/iris`} className="btn-open-iris-link">
                  <span>Chat with Iris</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="no-room-selected">
              <p>Click any room on the floorplan to inspect diagnostics and live SLAs.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

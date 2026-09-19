"use client";

import {useCallback,useEffect,useMemo,useState} from 'react';
import {Bike,RefreshCw,ShieldCheck,TriangleAlert,Wrench} from 'lucide-react';
import {api,Badge,Empty,Loading,useApp} from '@/components/ui';
import {STUDIOS} from '@/lib/constants';
import {relativeTime} from '@/lib/utils';

/**
 * The equipment register, per studio.
 *
 * The point of the register is not the list — it is that every fault ever logged on a bike
 * is now visible against that bike, so "which one keeps breaking" is a glance rather than
 * a memory. Bikes that are off the floor sort to the top, because that is what changes
 * today's schedule.
 */
export type FleetAsset = {
  id: number;
  studio: string;
  area: string | null;
  type: string;
  label: string;
  name: string;
  status: string;
  serial: string | null;
  statusNote: string | null;
  statusChangedAt: string | null;
  faultCount: number;
  lastFaultAt: string | null;
  faults: number;
  openFaults: number;
  available: boolean;
};

const STATUS_TONE: Record<string, string> = {
  'in-service': 'green',
  'out-of-rotation': 'red',
  'in-repair': 'amber',
  retired: '',
};

const STATUS_LABEL: Record<string, string> = {
  'in-service': 'In service',
  'out-of-rotation': 'Out of rotation',
  'in-repair': 'In repair',
  retired: 'Retired',
};

export function EquipmentPanel({initialStudio}: {initialStudio?: string}) {
  const {notify} = useApp();
  const [studio, setStudio] = useState(initialStudio || STUDIOS[0]?.name || '');
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api<{assets: FleetAsset[]}>(`/api/assets?view=fleet&studio=${encodeURIComponent(studio)}`);
      setAssets(d.assets || []);
      setError('');
      setBusy(false);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }, [studio]);

  // Re-reads on an interval so a bike taken out of rotation on the floor shows up here
  // without a refresh — the whole reason the status exists.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const summary = useMemo(() => {
    const available = assets.filter((a) => a.available).length;
    const total = assets.length;
    const openFaults = assets.reduce((n, a) => n + (a.openFaults || 0), 0);
    // The fleet's problem children: repeat offenders, worst first. Two faults in a quarter
    // is a bike worth looking at; three is a bike worth replacing.
    const repeat = assets.filter((a) => a.faults >= 2).sort((a, b) => b.faults - a.faults);
    return {available, total, openFaults, repeat};
  }, [assets]);

  const ordered = useMemo(
    () =>
      [...assets].sort((a, b) => {
        if (a.available !== b.available) return a.available ? 1 : -1;
        if ((b.faults || 0) !== (a.faults || 0)) return (b.faults || 0) - (a.faults || 0);
        return String(a.label).localeCompare(String(b.label), undefined, {numeric: true});
      }),
    [assets],
  );

  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="between wrap" style={{gap: 12}}>
          <div>
            <h3 style={{marginBottom: 4}}>Equipment register</h3>
            <p className="muted" style={{fontSize: 12}}>
              Every logged fault, against the bike it happened to.
            </p>
          </div>
          <div className="flex-row">
            <select value={studio} onChange={(e) => setStudio(e.target.value)} aria-label="Studio">
              {STUDIOS.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => { setBusy(true); void load(); }} disabled={busy}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        <div className="detail-fields" style={{marginTop: 16}}>
          <div className="between">
            <span className="muted">Available</span>
            <strong>
              {summary.available} of {summary.total}
            </strong>
          </div>
          <div className="between">
            <span className="muted">Open faults</span>
            <strong>{summary.openFaults}</strong>
          </div>
          <div className="between">
            <span className="muted">Repeat offenders</span>
            <strong>{summary.repeat.length}</strong>
          </div>
        </div>

        {summary.available < summary.total ? (
          <div className="info-box" style={{marginTop: 14}}>
            <TriangleAlert size={16} />
            <span>
              {summary.total - summary.available} off the floor
              {summary.repeat.length ? ` · ${summary.repeat.slice(0, 3).map((a) => `${a.name} (${a.faults})`).join(', ')} are repeat faults` : ''}
            </span>
          </div>
        ) : null}
      </div>

      {error ? <div className="info-box"><TriangleAlert size={16} /><span>{error}</span></div> : null}

      {busy && !assets.length ? (
        <Loading rows={3} variant="card" />
      ) : !ordered.length ? (
        <Empty title="No equipment registered" detail="Assets are created the first time one is reported." />
      ) : (
        <div className="card card-pad">
          <div className="asset-grid">
            {ordered.map((a) => (
              <div key={a.id} className={'asset-card' + (a.available ? '' : ' asset-card-down')}>
                <div className="between">
                  <strong className="flex-row" style={{gap: 7}}>
                    <Bike size={15} />
                    {a.name}
                  </strong>
                  <Badge tone={STATUS_TONE[a.status] || ''}>{STATUS_LABEL[a.status] || a.status}</Badge>
                </div>
                <small className="muted">{a.area || a.studio}</small>
                <div className="asset-card-stats">
                  <span>
                    <strong>{a.faults || 0}</strong> faults
                  </span>
                  <span>
                    <strong>{a.openFaults || 0}</strong> open
                  </span>
                  <span>{a.lastFaultAt ? `last ${relativeTime(a.lastFaultAt)}` : 'no faults logged'}</span>
                </div>
                {a.statusNote ? <small className="muted">{a.statusNote}</small> : null}
                {!a.available && a.statusChangedAt ? (
                  <small className="muted flex-row" style={{gap: 5}}>
                    <Wrench size={11} /> since {relativeTime(a.statusChangedAt)}
                  </small>
                ) : null}
              </div>
            ))}
          </div>
          {summary.repeat.length ? (
            <div className="info-box" style={{marginTop: 16}}>
              <ShieldCheck size={16} />
              <span>
                {summary.repeat.length} bike{summary.repeat.length === 1 ? '' : 's'} with repeat faults — worth a
                service decision rather than another repair.
              </span>
            </div>
          ) : (
            <div className="info-box" style={{marginTop: 16}}>
              <ShieldCheck size={16} />
              <span>No repeat faults recorded at this studio.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

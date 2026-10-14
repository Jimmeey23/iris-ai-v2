"use client";
import {useEffect, useRef, useState} from 'react';
import {Activity, CheckCircle2, ChevronRight, Clock3, Layers, Loader2, MapPin, Repeat, Sparkles, Timer, TrendingUp, Volume1, type LucideIcon} from 'lucide-react';
import {api} from '../ui';
import type {Finding, FindingKind} from '@/lib/trend-patterns';
import type {Narrative} from '@/lib/trend-narrative';

const KIND: Record<FindingKind, {label: string; icon: LucideIcon}> = {
  spike: {label: 'Spike', icon: TrendingUp},
  rise: {label: 'Climbing', icon: TrendingUp},
  quiet: {label: 'Gone quiet', icon: Volume1},
  concentration: {label: 'Hotspot', icon: MapPin},
  'breach-driver': {label: 'SLA drag', icon: Timer},
  'slow-lane': {label: 'Slow lane', icon: Clock3},
  backlog: {label: 'Backlog', icon: Layers},
  rhythm: {label: 'Rhythm', icon: Activity},
  chronic: {label: 'Chronic', icon: Repeat},
  win: {label: 'Win', icon: CheckCircle2},
};
const WHEN = {now: 'Now', 'this-week': 'This week', watch: 'Watch'} as const;

/** Nine weekly counts as bars, the last one (the week being judged) in the accent colour. */
function Spark({series}: {series: number[]}) {
  const max = Math.max(1, ...series.map(Math.abs));
  return (
    <svg className="pt-spark" viewBox={`0 0 ${series.length * 8} 26`} role="img" aria-label={`Weekly counts, oldest first: ${series.join(', ')}`}>
      {series.map((v, i) => {
        const h = Math.max(1.5, (Math.abs(v) / max) * 24);
        return <rect key={i} x={i * 8 + 1} y={26 - h} width={5.5} height={h} rx={1.2} className={i === series.length - 1 ? 'last' : ''} />;
      })}
    </svg>
  );
}

/** The written briefing: loaded separately from the figures, so the dashboard never waits on a model. */
export function BriefingCard({params, reload, findings, onFinding}: {params: Record<string, string>; reload: number; findings: Finding[]; onFinding: (f: Finding) => void}) {
  // What has loaded is tagged with the view it was loaded for; "busy" is simply that tag not
  // matching the current view, so no state is set synchronously inside the effect.
  const key = JSON.stringify(params) + '|' + reload;
  const [state, setState] = useState<{key?: string; narrative?: Narrative; error?: string}>({});
  const refreshed = useRef(0);
  useEffect(() => {
    let live = true;
    const fresh = reload !== refreshed.current;
    refreshed.current = reload;
    api<{narrative: Narrative}>('/api/analytics/briefing?' + new URLSearchParams(fresh ? {...params, fresh: '1'} : params))
      .then(d => { if (live) setState({key, narrative: d.narrative}); })
      .catch(e => { if (live) setState({key, error: (e as Error).message}); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const busy = state.key !== key;

  const n = state.narrative;
  const byId = new Map(findings.map(f => [f.id, f]));
  return (
    <section className="card pt-brief" aria-live="polite" aria-busy={busy}>
      <div className="section-head">
        <div>
          <h2><Sparkles size={15} /> IRIS briefing</h2>
          <p>{n ? (n.engine === 'model' ? 'Written by the connected AI model from the detected patterns; every figure is checked against them.' : 'Written from the detected patterns.') : 'Reading the patterns…'}</p>
        </div>
        {busy && <Loader2 size={15} className="spin" aria-label="Loading" />}
      </div>
      {state.error && !n && <p className="muted" style={{fontSize: 12}}>The briefing could not be loaded ({state.error}). The patterns below are unaffected.</p>}
      {!n && busy && <div className="pt-skel" aria-hidden="true"><i /><i /><i /></div>}
      {n && (
        <>
          <h3 className="pt-headline">{n.headline}</h3>
          <p className="pt-summary">{n.summary}</p>
          {n.actions.length > 0 && (
            <ol className="pt-actions">
              {n.actions.map((a, i) => {
                const f = byId.get(a.findingIds[0]);
                return (
                  <li key={i} className={'when-' + a.when}>
                    <span className="pt-when">{WHEN[a.when]}</span>
                    <div>
                      <strong>{a.subject}</strong>
                      <p>{a.text}</p>
                      {f?.drill && <button type="button" className="an-more" onClick={() => onFinding(f)}>See the tickets <ChevronRight size={11} /></button>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

export function PatternGrid({findings, onFinding}: {findings: Finding[]; onFinding: (f: Finding) => void}) {
  const [all, setAll] = useState(false);
  if (!findings.length) return null;
  const shown = all ? findings : findings.slice(0, 6);
  return (
    <section className="card pt-patterns">
      <div className="section-head">
        <div>
          <h2><Activity size={15} /> Patterns detected</h2>
          <p>Found by comparing this week with the previous eight, and by looking at where, when and how long — not only at totals. Select one to see the tickets.</p>
        </div>
      </div>
      <div className="pt-grid">
        {shown.map(f => {
          const K = KIND[f.kind], I = K.icon;
          return (
            <article key={f.id} className={'pt-card tone-' + f.tone}>
              <header><span className="pt-kind"><I size={11} /> {K.label}</span>{f.series && <Spark series={f.series} />}</header>
              <h3>{f.title}</h3>
              <p>{f.detail}</p>
              {f.evidence.length > 0 && <div className="pt-chips">{f.evidence.map(e => <span key={e}>{e}</span>)}</div>}
              <p className="pt-action"><b>Do next:</b> {f.action}</p>
              {f.drill && <button type="button" className="an-more" onClick={() => onFinding(f)}>See the tickets <ChevronRight size={11} /></button>}
            </article>
          );
        })}
      </div>
      {findings.length > 6 && <button type="button" className="text-btn" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${findings.length}`}</button>}
    </section>
  );
}

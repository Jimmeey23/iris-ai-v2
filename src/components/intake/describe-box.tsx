"use client";
import {useRef, useState} from 'react';
import {ArrowRight, Loader2, Sparkles} from 'lucide-react';
import {api} from '../ui';
import type {IntakeSuggestion, Pick} from '@/lib/intake/suggest';

const LEVEL_COPY = {
  high: 'Confident',
  medium: 'Likely — check it',
  low: 'Not sure — closest matches',
} as const;

/**
 * "Describe it" entry to the intake form. The desk types what happened in their own words;
 * IRIS proposes a drawer and pre-fills what the words already say. Nothing is filed or
 * chosen for them — the proposal is one click to accept and every pre-filled answer stays
 * editable and badged as auto-filled on the form.
 */
export function DescribeBox({onUse}: {onUse: (pick: Pick, s: IntakeSuggestion) => void}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IntakeSuggestion>();
  // Drops the answer to a description the desk has since changed or re-submitted.
  const seq = useRef(0);

  const ready = text.trim().length >= 8;
  const run = async () => {
    if (!ready || busy) return;
    const mine = ++seq.current;
    setBusy(true); setError('');
    try {
      const s = await api<IntakeSuggestion>('/api/intake/classify', {method: 'POST', body: JSON.stringify({text})});
      if (mine === seq.current) setResult(s);
    } catch (e) {
      if (mine === seq.current) { setResult(undefined); setError(e instanceof Error ? e.message : 'IRIS could not read that — pick a category below.'); }
    } finally { if (mine === seq.current) setBusy(false); }
  };

  const top = result?.picks[0];
  const alts = result?.picks.slice(1) || [];
  const pct = Math.round((top?.confidence ?? 0) * 100);
  return (
    <section className="intake-describe" aria-label="Describe what happened">
      <div className="intake-describe-head"><Sparkles size={15} /><strong>Describe the issue to suggest a category</strong></div>
      <div className="intake-describe-row">
        <textarea
          value={text} rows={2} maxLength={2000}
          onChange={e => { setText(e.target.value); if (result) { seq.current++; setResult(undefined); } }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run(); } }}
          placeholder="e.g. AC stopped working in Studio 1 at Kwality since the 7am class, members complaining it is boiling"
          aria-label="What happened"
        />
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()}>
          {busy ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}{busy ? 'Reading…' : 'Suggest'}
        </button>
      </div>
      <div aria-live="polite">
        {error && <p className="intake-describe-error">{error}</p>}
        {result && !top && <p className="intake-describe-note">IRIS could not place that. Add a detail (what, where) or pick a category below.</p>}
        {result && top && (
          <div className="intake-suggest" data-level={result.level}>
            <div className="intake-suggest-main">
              <span className="intake-suggest-label">{LEVEL_COPY[result.level]}{result.engine === 'keywords' ? ' · keyword match' : ''}</span>
              <strong>{top.subcategory}</strong>
              <small>{top.category}</small>
              <div className="intake-suggest-meter" role="img" aria-label={`${pct}% confidence`}><i style={{width: `${pct}%`}} /></div>
              {Object.keys(result.prefill).filter(k => k !== 'summary').length > 0 && <small>Pre-fills: {Object.keys(result.prefill).filter(k => k !== 'summary').map(k => k.replace('_', ' ')).join(', ')} + your description</small>}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onUse(top, result)}>Use this <ArrowRight size={14} /></button>
            {alts.length > 0 && (
              <div className="intake-suggest-alts"><span>Or:</span>
                {alts.map(a => <button type="button" key={`${a.category}|${a.subcategory}`} className="tag" onClick={() => onUse(a, result)} title={a.category}>{a.subcategory}</button>)}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

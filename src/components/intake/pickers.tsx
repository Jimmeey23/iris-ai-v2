"use client";
import {useMemo, useState} from 'react';
import {ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, Clock3, ListChecks, Search, UserRound} from 'lucide-react';
import {Avatar, Priority} from '../ui';
import {CategoryArt, CATEGORY_TONE} from '../ticket-art';
import type {IntakeTaxonomy, IntakeCategory} from './types';

export function CategoryGrid({taxonomy, onPick, onClassDesk}: {taxonomy: IntakeTaxonomy; onPick: (c: IntakeCategory) => void; onClassDesk: () => void}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return taxonomy.categories.map(c => ({c, hits: [] as string[]}));
    return taxonomy.categories.map(c => ({c, hits: c.subs.filter(x => x.name.toLowerCase().includes(s)).map(x => x.name)}))
      .filter(({c, hits}) => c.name.toLowerCase().includes(s) || hits.length || c.department.name.toLowerCase().includes(s));
  }, [taxonomy, q]);
  return (
    <div className="intake-step rise">
      <div className="intake-step-head">
        <div>
          <div className="eyebrow">Step 1 of 4</div>
          <h2>What is this about?</h2>
          <p>Pick the drawer it belongs in. The department, owner and follow-up target come with it.</p>
        </div>
        <div className="search-input intake-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search categories or sub-categories…" aria-label="Search categories" /></div>
      </div>
      <button type="button" className="intake-classdesk-cta" onClick={onClassDesk}>
        <span className="intake-classdesk-icon"><CalendarDays size={18} /></span>
        <span className="grow"><strong>Start from a class instead</strong><small>Pick the session out of Momence — roll call, capacity and coach come with it, and the ticket builds itself around the class.</small></span>
        <ArrowUpRight size={15} />
      </button>
      <div className="intake-cat-grid">
        {rows.map(({c, hits}) => (
          <button type="button" key={c.name} className="card intake-cat-card" data-tone={CATEGORY_TONE[c.name] || 'accent'} onClick={() => onPick(c)}>
            <CategoryArt category={c.name} className="intake-cat-art" />
            <div className="intake-cat-body">
              <h3>{c.name}</h3>
              <p className="intake-cat-dept">{c.department.name || c.hubDepartment || 'Operations'}</p>
              <div className="intake-cat-owner">
                {c.owner ? <><Avatar name={c.owner.name} tone="purple" /><span><b>{c.owner.name}</b><small>{c.owner.role}</small></span></> : <><Avatar name="" emptyDark /><span><b>Department queue</b><small>picked up on arrival</small></span></>}
              </div>
              {hits.length > 0 && <div className="intake-cat-hits">{hits.slice(0, 3).map(h => <span className="tag" key={h}>{h}</span>)}{hits.length > 3 && <span className="tag">+{hits.length - 3}</span>}</div>}
            </div>
            <div className="intake-cat-foot"><span className="mono">{c.subs.length} sub-categories</span><ChevronRight size={14} /></div>
          </button>
        ))}
      </div>
      {!rows.length && <div className="empty-state"><h3>Nothing matches “{q}”</h3><p>Try a broader word — the sub-category search looks through all {taxonomy.categories.reduce((n, c) => n + c.subs.length, 0)} entries.</p></div>}
    </div>
  );
}

export function SubcategoryGrid({category, onBack, onPick}: {category: IntakeCategory; onBack: () => void; onPick: (sub: string) => void}) {
  const [q, setQ] = useState('');
  const subs = useMemo(() => {
    const s = q.trim().toLowerCase();
    return category.subs.filter(x => !s || x.name.toLowerCase().includes(s));
  }, [category, q]);
  return (
    <div className="intake-step rise">
      <div className="intake-step-head">
        <div>
          <div className="intake-back-row"><button type="button" className="text-btn intake-back" onClick={onBack}><ArrowLeft size={13} /> All categories</button></div>
          <div className="eyebrow">Step 2 of 4 · {category.name}</div>
          <h2>Which sub-category?</h2>
          <p>Each one carries its own questions, so the owner gets what they need first time. {category.department.name ? <>Routes to <b>{category.department.name}</b>{category.owner ? <> · {category.owner.name}</> : null}.</> : null}</p>
        </div>
        <div className="search-input intake-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${category.subs.length} sub-categories…`} aria-label="Search sub-categories" autoFocus /></div>
      </div>
      <div className="intake-sub-grid">
        {subs.map(s => (
          <button type="button" key={s.name} className="card intake-sub-card" onClick={() => onPick(s.name)}>
            <div className="between" style={{alignItems: 'flex-start'}}>
              <h3>{s.name}</h3>
              <Priority priority={s.priority} />
            </div>
            <div className="intake-sub-meta">
              <span title="Follow-up target at the default priority"><Clock3 size={11} />{s.slaHours}h target</span>
              <span title="Required questions · optional questions"><ListChecks size={11} />{s.requiredCount} required · {s.fieldCount - s.requiredCount} optional</span>
              {s.hist > 0 && <span title={`${s.hist} earlier tickets in the Support Hub archive`}><UserRound size={11} />{s.hist} in the archive</span>}
            </div>
          </button>
        ))}
      </div>
      {!subs.length && <div className="empty-state"><h3>No sub-category matches “{q}”</h3><p>Clear the search, or go back and try another category.</p></div>}
    </div>
  );
}

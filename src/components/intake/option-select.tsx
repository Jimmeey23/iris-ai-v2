"use client";
import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {Check, ChevronDown, Search, X} from 'lucide-react';

type Value = string | number | string[] | undefined | null;

/**
 * One dropdown for every controlled list on the form, single or multi. Every answer sits in a
 * control of the same height, so a pair of questions always lines up, however many options
 * either has. Long lists get a search box; multi-select shows checkboxes and a count.
 */
export function OptionSelect({id, options, value, onChange, multi = false, placeholder, invalid, disabled, format = (o: string) => o, clearable = true}: {
  id?: string; options: string[]; value: Value; onChange: (v: string | string[]) => void;
  multi?: boolean; placeholder?: string; invalid?: boolean; disabled?: boolean;
  /** How an option reads, when its stored value is a key. */
  format?: (o: string) => string;
  /** False for a question that always has an answer. */
  clearable?: boolean;
}) {
  const chosen = useMemo(() => multi ? (Array.isArray(value) ? value.map(String) : value ? String(value).split(/\s*\|\s*/).filter(Boolean) : []) : value == null || value === '' ? [] : [String(value)], [value, multi]);
  // An answer saved against a list that has since changed still shows, and can be cleared.
  const all = useMemo(() => [...options, ...chosen.filter(c => !options.includes(c))], [options, chosen]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchable = all.length > 7;
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? all.filter(o => format(o).toLowerCase().includes(s)) : all; }, [all, q, format]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({block: 'nearest'}); }, [cursor, open]);

  const show = () => {
    if (disabled) return;
    const r = root.current?.getBoundingClientRect();
    setUp(Boolean(r && window.innerHeight - r.bottom < 300 && r.top > 320));
    setQ(''); setCursor(Math.max(0, all.indexOf(chosen[0] ?? ''))); setOpen(true);
    if (searchable) setTimeout(() => search.current?.focus(), 0);
  };
  const pick = (o: string) => {
    if (!multi) { onChange(o); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.osel-trigger')?.focus(); return; }
    onChange(chosen.includes(o) ? chosen.filter(x => x !== o) : [...chosen, o]);
  };
  const key = (e: KeyboardEvent) => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.osel-trigger')?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(shown.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' || (e.key === ' ' && e.target !== search.current)) { e.preventDefault(); if (shown[cursor]) pick(shown[cursor]); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const summary = !chosen.length ? <span className="osel-placeholder">{placeholder || (multi ? 'Select all that apply' : 'Select an option')}</span>
    : !multi ? <span className="osel-value">{format(chosen[0])}</span>
    : <span className="osel-tags">{chosen.slice(0, 2).map(c => <span className="osel-tag" key={c}>{format(c)}</span>)}{chosen.length > 2 && <span className="osel-more">+{chosen.length - 2}</span>}</span>;

  return (
    <div ref={root} className={'osel' + (open ? ' open' : '') + (up ? ' up' : '') + (invalid ? ' invalid' : '') + (chosen.length && clearable ? ' filled' : '')} onKeyDown={key}>
      <button type="button" id={id} className="osel-trigger" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={listId} aria-invalid={invalid || undefined} disabled={disabled} onClick={() => open ? setOpen(false) : show()}>
        {summary}
        {multi && chosen.length > 0 && <span className="osel-count">{chosen.length}</span>}
        <ChevronDown size={15} className="osel-chev" aria-hidden="true" />
      </button>
      {clearable && chosen.length > 0 && !disabled && <button type="button" className="osel-clear" aria-label="Clear answer" onClick={() => onChange(multi ? [] : '')}><X size={12} /></button>}
      {open && (
        <div className="osel-pop">
          {searchable && <div className="osel-search"><Search size={13} /><input ref={search} value={q} onChange={e => { setQ(e.target.value); setCursor(0); }} placeholder="Search options" aria-label="Search options" aria-controls={listId} /></div>}
          <div ref={list} id={listId} className="osel-list" role="listbox" aria-multiselectable={multi || undefined}>
            {shown.map((o, i) => {
              const on = chosen.includes(o);
              return <div key={o} data-i={i} role="option" aria-selected={on} className={'osel-opt' + (on ? ' on' : '') + (i === cursor ? ' cur' : '')} onMouseEnter={() => setCursor(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}>
                <span className={multi ? 'osel-box' : 'osel-tick'}>{on && <Check size={11} strokeWidth={3} />}</span>
                <span className="osel-label">{format(o)}</span>
              </div>;
            })}
            {!shown.length && <div className="osel-empty">No option matches “{q}”.</div>}
          </div>
          {multi && <div className="osel-foot"><span>{chosen.length ? `${chosen.length} selected` : 'None selected'}</span><span className="flex-row" style={{gap: 12}}>{chosen.length > 0 && <button type="button" className="text-btn" onClick={() => onChange([])}>Clear</button>}<button type="button" className="text-btn" onClick={() => setOpen(false)}>Done</button></span></div>}
        </div>
      )}
    </div>
  );
}

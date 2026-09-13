"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {Search,X,Check,Loader2} from 'lucide-react';
import {api} from './ui';
import type {MomenceRecord} from '@/lib/momence';
import type {PickerModule,PickerOption} from '@/lib/ticket-contract';
import {STUDIOS,TRAINERS,CLASS_FORMATS,MEMBERSHIPS} from '@/lib/constants';
import {indiaDate} from '@/lib/display';

const STATIC_OPTIONS: Record<string, PickerOption[]> = {
  trainers: TRAINERS.map((t) => ({ id: t, label: t })),
  studios: STUDIOS.map((s) => ({ id: s.name, label: s.name, sublabel: s.city })),
  formats: CLASS_FORMATS.map((f) => ({ id: f, label: f })),
  memberships: MEMBERSHIPS.map((m) => ({ id: m, label: m })),
};

const LIVE_MODULES = new Set<PickerModule>(['members', 'sessions']);

function toOption(module: PickerModule, r: MomenceRecord): PickerOption {
  if (module === 'sessions') {
    return { id: r.id, label: r.name, sublabel: `${r.subtitle}${r.raw.startsAt ? ' · ' + indiaDate(r.raw.startsAt) : ''}`, meta: r.raw };
  }
  return { id: r.id, label: r.name, sublabel: r.subtitle, meta: r.raw };
}

/**
 * Searchable picker with pre-populated options (trainers, studios, class formats,
 * memberships) merged live with Momence for members/sessions. Supports single or
 * multi selection so staff can flag more than one class/trainer on one ticket.
 */
export function MultiSelect({
  module,
  value,
  onChange,
  multi = false,
  placeholder,
  emptyHint,
  source,
}: {
  module: PickerModule;
  value: PickerOption[];
  onChange: (next: PickerOption[]) => void;
  multi?: boolean;
  placeholder?: string;
  emptyHint?: string;
  source?: (opt: PickerOption) => void;
}) {
  const [q, setQ] = useState('');
  const [live, setLive] = useState<PickerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [dataSource, setDataSource] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!LIVE_MODULES.has(module)) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      api<{ items: MomenceRecord[]; source: string }>(
        `/api/momence?module=${module}&q=${encodeURIComponent(q)}&page=0`,
        { signal: controller.signal },
      )
        .then((d) => {
          setLive(d.items.map((r) => toOption(module, r)));
          setDataSource(d.source);
        })
        .catch((e) => { if (e.name !== 'AbortError') setLive([]); })
        .finally(() => setBusy(false));
    }, 220);
    return () => { clearTimeout(t); controller.abort(); };
  }, [module, q, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pool = useMemo(() => {
    const base = LIVE_MODULES.has(module) ? live : STATIC_OPTIONS[module] || [];
    if (LIVE_MODULES.has(module)) return base;
    const query = q.trim().toLowerCase();
    return query ? base.filter((o) => (o.label + ' ' + (o.sublabel || '')).toLowerCase().includes(query)) : base;
  }, [module, live, q]);

  const isChecked = (id: string | number) => value.some((v) => String(v.id) === String(id));
  function toggle(opt: PickerOption) {
    source?.(opt);
    if (!multi) { onChange([opt]); setOpen(false); setQ(''); return; }
    if (isChecked(opt.id)) onChange(value.filter((v) => String(v.id) !== String(opt.id)));
    else onChange([...value, opt]);
  }
  function remove(id: string | number) { onChange(value.filter((v) => String(v.id) !== String(id))); }

  return (
    <div className="multiselect" ref={boxRef}>
      {value.length > 0 && (
        <div className="multiselect-chips">
          {value.map((v) => (
            <span className="multiselect-chip" key={v.id}>
              {v.label}
              <button type="button" onClick={() => remove(v.id)} aria-label={'Remove ' + v.label}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="multiselect-search">
        <Search size={13} className="muted" />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          placeholder={placeholder || `Search or pick from ${pool.length} known ${module}…`}
        />
        {busy && <Loader2 size={13} className="animate-spin muted" />}
      </div>
      {open && (
        <div className="multiselect-list">
          {pool.length === 0 && !busy && (
            <div className="multiselect-empty">{emptyHint || 'No matches yet — keep typing or enter details manually.'}</div>
          )}
          {pool.slice(0, 60).map((opt) => (
            <button
              type="button"
              key={opt.id}
              className="multiselect-row"
              aria-pressed={isChecked(opt.id)}
              onClick={() => toggle(opt)}
            >
              {multi && <span className="multiselect-check">{isChecked(opt.id) && <Check size={11} />}</span>}
              <span className="grow">
                <strong>{opt.label}</strong>
                {opt.sublabel && <p>{opt.sublabel}</p>}
              </span>
            </button>
          ))}
        </div>
      )}
      {LIVE_MODULES.has(module) && (
        <div className="multiselect-source">
          <span>{dataSource === 'live' ? 'Live Momence data' : dataSource === 'demo' ? 'Demo data · connect Momence for live records' : 'Momence lookup'}</span>
          <span>{multi ? `${value.length} selected` : value.length ? 'Selected' : 'Nothing selected'}</span>
        </div>
      )}
    </div>
  );
}

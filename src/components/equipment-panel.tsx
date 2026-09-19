"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Bike, Dumbbell, Image as ImageIcon, Laptop, LayoutGrid, Lightbulb, MapPin, Mic, Pencil,
  Plus, RefreshCw, Rows3, ShieldCheck, Snowflake, Trash2, TriangleAlert, Upload, Wrench,
} from 'lucide-react';
import {api, Badge, Empty, Field, Loading, Modal, SearchField, useApp} from '@/components/ui';
import {STUDIOS} from '@/lib/constants';
import {relativeTime} from '@/lib/utils';

/**
 * The equipment register, per studio.
 *
 * The point of the register is not the list — it is that every fault ever logged against a
 * piece of equipment is visible against that piece of equipment, so "which one keeps
 * breaking" is a glance rather than a memory. Things that are off the floor sort to the
 * top, because that is what changes today's schedule.
 *
 * It began as bikes. A studio's failures are not confined to its bikes: the biometric
 * machine, the pantry microwave, the 5 kg weights and the air conditioning all break, and
 * until each is a row, none of them can be counted.
 */
export type FleetAsset = {
  id: number;
  studio: string;
  area: string | null;
  locationId: number | null;
  locationName: string | null;
  type: string;
  category: string;
  label: string;
  name: string;
  status: string;
  serial: string | null;
  assetTag: string | null;
  manufacturer: string | null;
  model: string | null;
  vendor: string | null;
  quantity: number;
  condition: string | null;
  imageUrl: string | null;
  purchaseCost: string | null;
  warrantyUntil: string | null;
  acquiredAt: string | null;
  notes: string | null;
  statusNote: string | null;
  statusChangedAt: string | null;
  faultCount: number;
  lastFaultAt: string | null;
  faults: number;
  openFaults: number;
  available: boolean;
};

type CatalogueEntry = {type: string; category: string; countable?: boolean};
type LocationRow = {id: number; studio: string; name: string; description: string | null; active: boolean};
type TypeSummaryRow = {type: string; category: string; items: number; units: number; outOfService: number; faults: number; openFaults: number};

type FleetResponse = {
  assets: FleetAsset[];
  locations: LocationRow[];
  summary: TypeSummaryRow[];
  catalogue: CatalogueEntry[];
  categories: string[];
  conditions: string[];
  statuses: string[];
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

/** A glyph per category, so a long register is scannable without reading every line. */
function CategoryIcon({category, size = 15}: {category: string; size?: number}) {
  switch (category) {
    case 'Cardio': return <Bike size={size} />;
    case 'Strength & studio': return <Dumbbell size={size} />;
    case 'IT & systems': return <Laptop size={size} />;
    case 'Audio & visual': return <Mic size={size} />;
    case 'Climate & facilities': return <Snowflake size={size} />;
    case 'Pantry': return <Lightbulb size={size} />;
    default: return <Wrench size={size} />;
  }
}

/** A picture of the item, or a typed placeholder standing in for one.
 *
 *  Equipment photographs are how the floor confirms it is looking at the right item —
 *  "the barre in Studio 2" is three barres. Until a photo is added, the placeholder at
 *  least carries the category glyph rather than an empty square. */
export type ThumbLike = {imageUrl: string | null; category: string; name: string};

function AssetThumb({asset, size = 38}: {asset: ThumbLike; size?: number}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(asset.imageUrl) && !failed;
  return (
    <span className="eq-thumb" style={{width: size, height: size}} data-category={asset.category}>
      {showImage ? (
        // Plain <img>: these are arbitrary external URLs a studio pastes in, which the
        // image optimiser cannot be given an allow-list for.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.imageUrl as string} alt={asset.name} onError={() => setFailed(true)} loading="lazy"/>
      ) : (
        <span className="eq-thumb-placeholder" title={asset.imageUrl ? 'Image could not be loaded' : 'No photo yet'}>
          <CategoryIcon category={asset.category} size={Math.round(size * 0.42)}/>
        </span>
      )}
    </span>
  );
}

/** The catalogue entry's category for a type, used before an asset row exists. */
function EQUIPMENT_CATEGORY_OF(type: string, catalogue: CatalogueEntry[]): string {
  return catalogue.find((c) => c.type === type)?.category || 'Uncategorised';
}

/** The editable shape of one item. Kept as strings because it is bound to form inputs;
 *  the API does the coercion, and doing it twice is how the two disagree. */
type FormState = {
  id?: number;
  studio: string; type: string; label: string; name: string;
  locationId: string; area: string; serial: string; assetTag: string;
  manufacturer: string; model: string; vendor: string; quantity: string;
  condition: string; imageUrl: string; purchaseCost: string; warrantyUntil: string; acquiredAt: string;
  status: string; notes: string;
};

const emptyForm = (studio: string, type = ''): FormState => ({
  studio, type, label: '', name: '', locationId: '', area: '', serial: '', assetTag: '',
  manufacturer: '', model: '', vendor: '', quantity: '1', condition: '', imageUrl: '', purchaseCost: '',
  warrantyUntil: '', acquiredAt: '', status: 'in-service', notes: '',
});

const dateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

const formFrom = (a: FleetAsset): FormState => ({
  id: a.id, studio: a.studio, type: a.type, label: a.label, name: a.name,
  locationId: a.locationId ? String(a.locationId) : '', area: a.area || '',
  serial: a.serial || '', assetTag: a.assetTag || '', manufacturer: a.manufacturer || '',
  model: a.model || '', vendor: a.vendor || '', quantity: String(a.quantity ?? 1),
  condition: a.condition || '', imageUrl: a.imageUrl || '', purchaseCost: a.purchaseCost || '',
  warrantyUntil: dateInput(a.warrantyUntil), acquiredAt: dateInput(a.acquiredAt),
  status: a.status, notes: a.notes || '',
});

/** Empty strings mean "not set", not "set to empty" — sending them would blank a column
 *  the form happened not to fill in. */
const payloadFrom = (f: FormState) => ({
  ...(f.id ? {id: f.id} : {}),
  studio: f.studio,
  type: f.type,
  label: f.label.trim(),
  status: f.status || undefined,
  name: f.name.trim() || undefined,
  locationId: f.locationId ? Number(f.locationId) : null,
  // A managed location supersedes the free-text area; sending both leaves two competing
  // answers to "where is it?" on the same row.
  area: f.locationId ? null : (f.area.trim() || null),
  serial: f.serial.trim() || null,
  assetTag: f.assetTag.trim() || null,
  manufacturer: f.manufacturer.trim() || null,
  model: f.model.trim() || null,
  vendor: f.vendor.trim() || null,
  quantity: Number(f.quantity) || 1,
  condition: f.condition || null,
  imageUrl: f.imageUrl.trim() || null,
  purchaseCost: f.purchaseCost.trim() || null,
  warrantyUntil: f.warrantyUntil || null,
  acquiredAt: f.acquiredAt || null,
  notes: f.notes.trim() || null,
});

export function EquipmentPanel({initialStudio}: {initialStudio?: string}) {
  const {notify, user} = useApp();
  const [studio, setStudio] = useState(initialStudio || STUDIOS[0]?.name || '');
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [typeRows, setTypeRows] = useState<TypeSummaryRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<'items' | 'types'>('items');
  // A register is a list you scan and compare, so it opens as a table. Cards stay available
  // for the photo-led view once studios start adding pictures.
  const [layout, setLayout] = useState<'table' | 'cards'>('table');

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canEdit = user?.role === 'admin' || user?.role === 'agent';

  const load = useCallback(async () => {
    try {
      const d = await api<FleetResponse>(`/api/assets?view=fleet&studio=${encodeURIComponent(studio)}`);
      setAssets(d.assets || []);
      setLocations(d.locations || []);
      setCatalogue(d.catalogue || []);
      setCategories(d.categories || []);
      setConditions(d.conditions || []);
      setStatuses(d.statuses || []);
      setTypeRows(d.summary || []);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [studio]);

  // Re-reads on an interval so equipment taken out of rotation on the floor shows up here
  // without a refresh — the whole reason the status exists.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const summary = useMemo(() => {
    const available = assets.filter((a) => a.available).length;
    const total = assets.length;
    const units = assets.reduce((n, a) => n + (a.quantity || 1), 0);
    const openFaults = assets.reduce((n, a) => n + (a.openFaults || 0), 0);
    // The register's problem children: repeat offenders, worst first. Two faults in a
    // quarter is worth looking at; three is worth a replacement decision.
    const repeat = assets.filter((a) => a.faults >= 2).sort((a, b) => b.faults - a.faults);
    return {available, total, units, openFaults, repeat};
  }, [assets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter((a) => (!category || a.category === category) && (!statusFilter || a.status === statusFilter))
      .filter((a) => !q || [a.name, a.type, a.serial, a.assetTag, a.manufacturer, a.model, a.locationName, a.area]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.available !== b.available) return a.available ? 1 : -1;
        if ((b.faults || 0) !== (a.faults || 0)) return (b.faults || 0) - (a.faults || 0);
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return String(a.label).localeCompare(String(b.label), undefined, {numeric: true});
      });
  }, [assets, query, category, statusFilter]);

  const studioLocations = useMemo(() => locations.filter((l) => l.studio === studio && l.active), [locations, studio]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setFormError('');
    try {
      const body = payloadFrom(editing);
      await api('/api/assets', {method: editing.id ? 'PATCH' : 'POST', body: JSON.stringify(body)});
      notify(editing.id ? `${body.name || body.label} updated.` : `${body.label} added to the register.`);
      setEditing(null);
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(asset: FleetAsset, status: string) {
    try {
      await api('/api/assets', {method: 'PATCH', body: JSON.stringify({id: asset.id, status})});
      notify(`${asset.name} is now ${(STATUS_LABEL[status] || status).toLowerCase()}.`);
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function remove(asset: FleetAsset) {
    // Equipment with a fault history is retired rather than deleted, because the faults
    // happened whether or not the studio still owns the thing. Say so up front.
    const warning = asset.faults > 0
      ? `${asset.name} has ${asset.faults} ticket${asset.faults === 1 ? '' : 's'} against it. It will be retired rather than deleted, so its fault history survives. Continue?`
      : `Remove ${asset.name} from the register? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    try {
      const d = await api<{message: string}>(`/api/assets?id=${asset.id}`, {method: 'DELETE'});
      notify(d.message);
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="between wrap" style={{gap: 12}}>
          <div>
            <h3 style={{marginBottom: 4}}>Equipment register</h3>
            <p className="muted" style={{fontSize: 12}}>
              Every logged fault, against the item it happened to.
            </p>
          </div>
          <div className="flex-row wrap">
            <select value={studio} onChange={(e) => setStudio(e.target.value)} aria-label="Studio" className="filter-select">
              {STUDIOS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            {canEdit ? (
              <button className="btn btn-sm btn-primary" onClick={() => { setFormError(''); setEditing(emptyForm(studio)); }}>
                <Plus size={13} /> Add equipment
              </button>
            ) : null}
            {canEdit ? (
              <button className="btn btn-sm" onClick={() => setImportOpen(true)}>
                <Upload size={13} /> Bulk upload
              </button>
            ) : null}
            {isAdmin ? (
              <button className="btn btn-sm" onClick={() => setLocationsOpen(true)}>
                <MapPin size={13} /> Locations
              </button>
            ) : null}
            <button className="btn btn-sm" onClick={() => { setBusy(true); void load(); }} disabled={busy}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        <div className="detail-fields" style={{marginTop: 16}}>
          <div className="between">
            <span className="muted">In service</span>
            <strong>{summary.available} of {summary.total}</strong>
          </div>
          <div className="between">
            <span className="muted">Units counted</span>
            <strong>{summary.units}</strong>
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

      <div className="card card-pad">
        <div className="between wrap" style={{gap: 10, marginBottom: 14}}>
          <div className="module-tabs">
            <button className={'context-tab' + (tab === 'items' ? ' active' : '')} onClick={() => setTab('items')}>
              Items ({assets.length})
            </button>
            <button className={'context-tab' + (tab === 'types' ? ' active' : '')} onClick={() => setTab('types')}>
              By type ({typeRows.length})
            </button>
          </div>
          {tab === 'items' ? (
            <div className="flex-row wrap" style={{gap: 8}}>
              <SearchField value={query} onChange={setQuery} placeholder="Serial, model, location…" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="filter-select">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="filter-select">
                <option value="">Any status</option>
                {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
              </select>
              <div className="view-switch">
                <button aria-label="Table view" title="Table view" className={layout === 'table' ? 'active' : ''} onClick={() => setLayout('table')}><Rows3 size={14}/></button>
                <button aria-label="Card view" title="Card view" className={layout === 'cards' ? 'active' : ''} onClick={() => setLayout('cards')}><LayoutGrid size={14}/></button>
              </div>
            </div>
          ) : null}
        </div>

        {busy && !assets.length ? (
          <Loading rows={3} variant="card" />
        ) : tab === 'types' ? (
          !typeRows.length ? (
            <Empty title="Nothing registered yet" detail="Add equipment, or import a sheet of it, to see fault counts per type." />
          ) : (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Type</th><th>Category</th><th>Items</th><th>Units</th>
                    <th>Off the floor</th><th>Tickets</th><th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {typeRows.map((r) => (
                    <tr key={r.type}>
                      <td><span className="flex-row" style={{gap: 7}}><CategoryIcon category={r.category} size={13} />{r.type}</span></td>
                      <td className="muted">{r.category}</td>
                      <td>{r.items}</td>
                      <td>{r.units}</td>
                      <td>{r.outOfService ? <Badge tone="red">{r.outOfService}</Badge> : <span className="muted">—</span>}</td>
                      <td><strong>{r.faults}</strong></td>
                      <td>{r.openFaults ? <Badge tone="amber">{r.openFaults}</Badge> : <span className="muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !visible.length ? (
          <Empty
            title={assets.length ? 'Nothing matches those filters' : 'No equipment registered'}
            detail={assets.length ? 'Clear the search or the filters to see the whole register.' : 'Add an item, import a sheet, or let one be created the first time it is reported.'}
          />
        ) : layout === 'table' ? (
          <div className="table-wrap">
            <table className="data-table data-table-rich equipment-table">
              <thead>
                <tr>
                  <th className="eq-th-img"><ImageIcon size={11}/></th>
                  <th>ITEM</th><th>CATEGORY</th><th>LOCATION</th><th>SERIAL / TAG</th>
                  <th>QTY</th><th>STATUS</th><th style={{textAlign: 'right'}}>TICKETS</th>
                  {canEdit ? <th/> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id} className={a.available ? '' : 'eq-row-down'}>
                    <td><AssetThumb asset={a}/></td>
                    <td>
                      <p className="ticket-name">{a.name}</p>
                      <div className="ticket-meta">
                        <span>{a.type}</span>
                        {(a.manufacturer || a.model) && <><span>·</span><span>{[a.manufacturer, a.model].filter(Boolean).join(' ')}</span></>}
                      </div>
                    </td>
                    <td><span className="chip chip-quiet">{a.category}</span></td>
                    <td>
                      {a.locationName
                        ? <span className="eq-loc"><MapPin size={10}/>{a.locationName}</span>
                        : a.area
                          ? <span className="eq-loc eq-loc-free">{a.area}</span>
                          : <span className="muted">—</span>}
                      <span className="category-sub">{a.studio.split(',')[0]}</span>
                    </td>
                    <td>
                      {a.serial ? <span className="mono" style={{fontSize: 10.5}}>{a.serial}</span> : <span className="muted">—</span>}
                      {a.assetTag ? <span className="category-sub">Tag {a.assetTag}</span> : null}
                    </td>
                    <td className="mono">{a.quantity > 1 ? `×${a.quantity}` : '1'}</td>
                    <td>
                      {canEdit ? (
                        <select value={a.status} aria-label={`Status for ${a.name}`} className="filter-select eq-status-select" data-status={a.status}
                          onChange={(e) => void changeStatus(a, e.target.value)}>
                          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                        </select>
                      ) : <Badge tone={STATUS_TONE[a.status] || ''}>{STATUS_LABEL[a.status] || a.status}</Badge>}
                      {a.statusNote ? <span className="category-sub">{a.statusNote}</span> : null}
                    </td>
                    <td style={{textAlign: 'right'}}>
                      <strong>{a.faults || 0}</strong>
                      {a.openFaults ? <Badge tone="amber" className="eq-open-badge">{a.openFaults} open</Badge> : null}
                      <span className="category-sub">{a.lastFaultAt ? relativeTime(a.lastFaultAt) : 'none logged'}</span>
                    </td>
                    {canEdit ? (
                      <td>
                        <div className="flex-row" style={{gap: 5, justifyContent: 'flex-end'}}>
                          <button className="icon-btn eq-icon-sm" onClick={() => { setFormError(''); setEditing(formFrom(a)); }} aria-label={`Edit ${a.name}`}><Pencil size={12}/></button>
                          {isAdmin ? <button className="icon-btn eq-icon-sm" onClick={() => void remove(a)} aria-label={`Remove ${a.name}`}><Trash2 size={12}/></button> : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="asset-grid">
            {visible.map((a) => (
              <div key={a.id} className={'asset-card' + (a.available ? '' : ' asset-card-down')}>
                <div className="between">
                  <strong className="flex-row" style={{gap: 9}}>
                    <AssetThumb asset={a} size={34}/>
                    {a.name}
                    {a.quantity > 1 ? <span className="chip chip-quiet">×{a.quantity}</span> : null}
                  </strong>
                  <Badge tone={STATUS_TONE[a.status] || ''}>{STATUS_LABEL[a.status] || a.status}</Badge>
                </div>
                <small className="muted">{[a.locationName || a.area, a.studio].filter(Boolean).join(' · ')}</small>
                {a.serial || a.assetTag || a.model ? (
                  <small className="muted">
                    {[a.manufacturer, a.model].filter(Boolean).join(' ')}
                    {a.serial ? ` · S/N ${a.serial}` : ''}
                    {a.assetTag ? ` · Tag ${a.assetTag}` : ''}
                  </small>
                ) : null}
                <div className="asset-card-stats">
                  <span><strong>{a.faults || 0}</strong> tickets</span>
                  <span><strong>{a.openFaults || 0}</strong> open</span>
                  <span>{a.lastFaultAt ? `last ${relativeTime(a.lastFaultAt)}` : 'no faults logged'}</span>
                </div>
                {a.statusNote ? <small className="muted">{a.statusNote}</small> : null}
                {!a.available && a.statusChangedAt ? (
                  <small className="muted flex-row" style={{gap: 5}}>
                    <Wrench size={11} /> since {relativeTime(a.statusChangedAt)}
                  </small>
                ) : null}
                {canEdit ? (
                  <div className="flex-row wrap" style={{gap: 6, marginTop: 10}}>
                    <select
                      value={a.status}
                      aria-label={`Status for ${a.name}`}
                      className="filter-select"
                      onChange={(e) => void changeStatus(a, e.target.value)}
                    >
                      {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                    </select>
                    <button className="btn btn-sm" onClick={() => { setFormError(''); setEditing(formFrom(a)); }}>
                      <Pencil size={12} /> Edit
                    </button>
                    {isAdmin ? (
                      <button className="btn btn-sm" onClick={() => void remove(a)} title="Remove from register">
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {tab === 'items' && assets.length ? (
          <div className="info-box" style={{marginTop: 16}}>
            <ShieldCheck size={16} />
            <span>
              {summary.repeat.length
                ? `${summary.repeat.length} item${summary.repeat.length === 1 ? '' : 's'} with repeat faults — worth a service decision rather than another repair.`
                : 'No repeat faults recorded at this studio.'}
            </span>
          </div>
        ) : null}
      </div>

      <AssetForm
        form={editing}
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={save}
        saving={saving}
        error={formError}
        catalogue={catalogue}
        locations={studioLocations}
        conditions={conditions}
        statuses={statuses}
      />

      <BulkImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        studio={studio}
        catalogue={catalogue}
        onDone={load}
      />

      <LocationManager
        open={locationsOpen}
        onClose={() => setLocationsOpen(false)}
        studio={studio}
        locations={locations.filter((l) => l.studio === studio)}
        onChanged={load}
      />
    </div>
  );
}

/* ----------------------------- Add / edit ----------------------------- */

function AssetForm({
  form, onChange, onClose, onSave, saving, error, catalogue, locations, conditions, statuses,
}: {
  form: FormState | null;
  onChange: (f: FormState) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string;
  catalogue: CatalogueEntry[];
  locations: LocationRow[];
  conditions: string[];
  statuses: string[];
}) {
  if (!form) return null;
  const set = (patch: Partial<FormState>) => onChange({...form, ...patch});
  const grouped = new Map<string, CatalogueEntry[]>();
  for (const entry of catalogue) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category)!.push(entry);
  }
  const countable = catalogue.find((c) => c.type === form.type)?.countable;

  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title={form.id ? `Edit ${form.name || form.label}` : 'Add equipment'}
      description={form.id ? 'Everything here is editable; the fault history stays attached.' : 'Only studio, type and label are required — fill in the rest as you find it.'}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving || !form.type || !form.label.trim()}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add to register'}
          </button>
        </>
      }
    >
      {error ? <div className="info-box" style={{marginBottom: 14}}><TriangleAlert size={16} /><span>{error}</span></div> : null}
      <div className="form-grid">
        <Field label="Studio">
          <select value={form.studio} onChange={(e) => set({studio: e.target.value})}>
            {STUDIOS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={form.type} onChange={(e) => set({type: e.target.value})}>
            <option value="">Choose a type…</option>
            {[...grouped.entries()].map(([cat, entries]) => (
              <optgroup key={cat} label={cat}>
                {entries.map((e) => <option key={e.type} value={e.type}>{e.type}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Label" hint="The number or short name the floor uses — 6, Front desk, Studio 2.">
          <input value={form.label} onChange={(e) => set({label: e.target.value})} placeholder="6" maxLength={40} />
        </Field>
        <Field label="Display name" hint="Leave blank to name it automatically from the type and label.">
          <input value={form.name} onChange={(e) => set({name: e.target.value})} maxLength={160} />
        </Field>
        <Field label="Location" hint={locations.length ? undefined : 'No locations defined yet — add them from the Locations button.'}>
          <select value={form.locationId} onChange={(e) => set({locationId: e.target.value, ...(e.target.value ? {area: ''} : {})})}>
            <option value="">Not in a defined location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        {/* Area is the fallback for anywhere that is not a defined location — a pantry shelf,
            a corridor. Once a location is chosen it is the answer, so the free-text field is
            withdrawn rather than left to contradict it. */}
        {form.locationId ? (
          <Field label="Area">
            <div className="eq-area-locked">
              <MapPin size={13}/>
              <span>{locations.find((l) => String(l.id) === form.locationId)?.name || 'Selected location'}</span>
              <button type="button" className="text-btn" onClick={() => set({locationId: ''})}>Use free text instead</button>
            </div>
          </Field>
        ) : (
          <Field label="Area" hint="Free text, for anywhere not in the location list.">
            <input value={form.area} onChange={(e) => set({area: e.target.value})} maxLength={80} placeholder="e.g. Pantry shelf" />
          </Field>
        )}
        <Field label="Serial number">
          <input value={form.serial} onChange={(e) => set({serial: e.target.value})} maxLength={120} />
        </Field>
        <Field label="Asset tag" hint="The studio's own sticker, if it tags equipment.">
          <input value={form.assetTag} onChange={(e) => set({assetTag: e.target.value})} maxLength={60} />
        </Field>
        <Field label="Manufacturer">
          <input value={form.manufacturer} onChange={(e) => set({manufacturer: e.target.value})} maxLength={120} />
        </Field>
        <Field label="Model">
          <input value={form.model} onChange={(e) => set({model: e.target.value})} maxLength={120} />
        </Field>
        <Field label="Vendor">
          <input value={form.vendor} onChange={(e) => set({vendor: e.target.value})} maxLength={120} />
        </Field>
        <Field
          label="Quantity"
          hint={countable ? 'Held in multiples — one row can stand for the whole rack.' : 'Usually 1 for an individually tracked item.'}
        >
          <input type="number" min={1} max={10000} value={form.quantity} onChange={(e) => set({quantity: e.target.value})} />
        </Field>
        <Field label="Condition">
          <select value={form.condition} onChange={(e) => set({condition: e.target.value})}>
            <option value="">Not recorded</option>
            {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set({status: e.target.value})}>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
          </select>
        </Field>
        <Field label="Purchase cost">
          <input value={form.purchaseCost} onChange={(e) => set({purchaseCost: e.target.value})} placeholder="0.00" maxLength={30} />
        </Field>
        <Field label="Acquired on">
          <input type="date" value={form.acquiredAt} onChange={(e) => set({acquiredAt: e.target.value})} />
        </Field>
        <Field label="Warranty until">
          <input type="date" value={form.warrantyUntil} onChange={(e) => set({warrantyUntil: e.target.value})} />
        </Field>
        <Field label="Photo" hint="An https link to a picture of the item. Left blank, the register shows a typed placeholder.">
          <div className="eq-image-field">
            <AssetThumb asset={{imageUrl: form.imageUrl, category: EQUIPMENT_CATEGORY_OF(form.type, catalogue), name: form.name || form.type} as ThumbLike} size={46}/>
            <input value={form.imageUrl} onChange={(e) => set({imageUrl: e.target.value})} maxLength={600} placeholder="https://…" />
          </div>
        </Field>
        <Field label="Notes" wide>
          <textarea rows={3} value={form.notes} onChange={(e) => set({notes: e.target.value})} maxLength={2000} />
        </Field>
      </div>
    </Modal>
  );
}

/* ----------------------------- Bulk import ----------------------------- */

const IMPORT_COLUMNS = [
  'type', 'label', 'name', 'location', 'area', 'serial', 'assetTag', 'manufacturer',
  'model', 'vendor', 'quantity', 'condition', 'status', 'purchaseCost', 'acquiredAt',
  'warrantyUntil', 'notes',
];

/** Header cells are matched loosely — "Serial No", "serial_no" and "serial" are the same
 *  column, because the sheet was written by whoever counted the equipment, not by us. */
const HEADER_ALIASES: Record<string, string> = {
  type: 'type', equipment: 'type', equipmenttype: 'type', item: 'type',
  label: 'label', number: 'label', no: 'label', itemno: 'label', unit: 'label',
  name: 'name', displayname: 'name',
  location: 'location', room: 'location', place: 'location',
  area: 'area', zone: 'area',
  serial: 'serial', serialno: 'serial', serialnumber: 'serial', sn: 'serial',
  assettag: 'assetTag', tag: 'assetTag', assetid: 'assetTag',
  manufacturer: 'manufacturer', make: 'manufacturer', brand: 'manufacturer',
  model: 'model', modelno: 'model',
  vendor: 'vendor', supplier: 'vendor',
  quantity: 'quantity', qty: 'quantity', count: 'quantity',
  condition: 'condition',
  status: 'status',
  purchasecost: 'purchaseCost', cost: 'purchaseCost', price: 'purchaseCost',
  acquiredat: 'acquiredAt', purchasedate: 'acquiredAt', acquired: 'acquiredAt',
  warrantyuntil: 'warrantyUntil', warranty: 'warrantyUntil', warrantyexpiry: 'warrantyUntil',
  notes: 'notes', note: 'notes', remarks: 'notes',
};

const normaliseHeader = (h: string) => HEADER_ALIASES[h.toLowerCase().replaceAll(/[^a-z0-9]/g, '')] || '';

type ImportRow = Record<string, string>;
type ImportResult = {row: number; name: string; status: string; message?: string};

function BulkImport({
  open, onClose, studio, catalogue, onDone,
}: {
  open: boolean; onClose: () => void; studio: string;
  catalogue: CatalogueEntry[]; onDone: () => Promise<void>;
}) {
  const {notify} = useApp();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const knownTypes = useMemo(() => new Set(catalogue.map((c) => c.type.toLowerCase())), [catalogue]);

  function reset() {
    setRows([]); setFileName(''); setError(''); setResults(null); setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  /** Parsing happens in the browser so the sheet can be checked before anything is sent.
   *  `xlsx` is loaded on demand — it is a large dependency and most visits never import. */
  async function readFile(file: File) {
    setError(''); setResults(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, {type: 'array'});
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) throw new Error('That file has no sheets in it.');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval: '', raw: false});
      if (!raw.length) throw new Error('That sheet has no rows under its header.');

      const mapped: ImportRow[] = [];
      const unknownHeaders = new Set<string>();
      for (const source of raw) {
        const row: ImportRow = {};
        for (const [header, value] of Object.entries(source)) {
          const key = normaliseHeader(header);
          if (!key) { if (String(header).trim()) unknownHeaders.add(String(header)); continue; }
          row[key] = String(value ?? '').trim();
        }
        if (Object.values(row).some(Boolean)) mapped.push(row);
      }
      if (!mapped.length) throw new Error('No recognisable columns. The sheet needs at least a type and a label column.');
      setRows(mapped);
      setFileName(file.name);
      if (unknownHeaders.size) {
        setError(`Ignored ${unknownHeaders.size} unrecognised column${unknownHeaders.size === 1 ? '' : 's'}: ${[...unknownHeaders].slice(0, 5).join(', ')}.`);
      }
    } catch (e) {
      setRows([]);
      setError((e as Error).message);
    }
  }

  const preview = useMemo(() => {
    const bad = rows.filter((r) => !r.type || !r.label);
    const unknownType = rows.filter((r) => r.type && !knownTypes.has(r.type.toLowerCase()));
    return {bad: bad.length, unknownType: [...new Set(unknownType.map((r) => r.type))]};
  }, [rows, knownTypes]);

  async function submit() {
    setBusy(true); setError('');
    try {
      // Locations arrive as names; the server takes ids, so the name is kept as `area`.
      // A row that names a room the studio has not defined should not be rejected over it.
      const payload = rows.map((r) => ({
        studio,
        type: r.type,
        label: r.label,
        name: r.name || undefined,
        area: r.location || r.area || undefined,
        serial: r.serial || undefined,
        assetTag: r.assetTag || undefined,
        manufacturer: r.manufacturer || undefined,
        model: r.model || undefined,
        vendor: r.vendor || undefined,
        quantity: r.quantity ? Number(r.quantity) || 1 : undefined,
        condition: r.condition || undefined,
        status: r.status || undefined,
        purchaseCost: r.purchaseCost || undefined,
        acquiredAt: r.acquiredAt || undefined,
        warrantyUntil: r.warrantyUntil || undefined,
        notes: r.notes || undefined,
      }));
      const d = await api<{results: ImportResult[]; created: number; updated: number; skipped: number; errors: number}>(
        '/api/assets', {method: 'POST', body: JSON.stringify({rows: payload, mode})},
      );
      setResults(d.results);
      notify(`${d.created} added, ${d.updated} updated, ${d.skipped} skipped, ${d.errors} failed.`, d.errors ? 'error' : undefined);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const csv = [IMPORT_COLUMNS.join(','), 'PowerCycle bike,1,,PowerCycle Studio,,SN-0001,TAG-01,Stages,SC3,,1,good,in-service,,,,'].join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'equipment-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      size="wide"
      title="Bulk upload equipment"
      description={`Rows are added to ${studio}. A CSV or Excel file with a header row.`}
      footer={
        <>
          <button className="btn" onClick={() => { reset(); onClose(); }} disabled={busy}>Close</button>
          {rows.length && !results ? (
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Importing…' : `Import ${rows.length} row${rows.length === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <div className="flex-row wrap" style={{gap: 8}}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            aria-label="Equipment file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }}
          />
          <button className="btn btn-sm" onClick={downloadTemplate}>Download template</button>
        </div>

        <Field label="If an item is already in the register" hint="Matched on studio, type and label.">
          <select value={mode} onChange={(e) => setMode(e.target.value as 'skip' | 'update')}>
            <option value="skip">Leave it alone</option>
            <option value="update">Update it from the sheet</option>
          </select>
        </Field>

        {error ? <div className="info-box"><TriangleAlert size={16} /><span>{error}</span></div> : null}

        {rows.length && !results ? (
          <>
            <p className="muted" style={{fontSize: 12}}>
              {fileName} · {rows.length} row{rows.length === 1 ? '' : 's'} read.
              {preview.bad ? ` ${preview.bad} missing a type or label and will fail.` : ''}
              {preview.unknownType.length ? ` Not in the catalogue: ${preview.unknownType.slice(0, 4).join(', ')}.` : ''}
            </p>
            <div className="data-table">
              <table>
                <thead><tr><th>Type</th><th>Label</th><th>Location</th><th>Serial</th><th>Qty</th></tr></thead>
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td>{r.type || <span className="muted">missing</span>}</td>
                      <td>{r.label || <span className="muted">missing</span>}</td>
                      <td className="muted">{r.location || r.area || '—'}</td>
                      <td className="muted">{r.serial || '—'}</td>
                      <td>{r.quantity || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 8 ? <small className="muted">Showing the first 8 of {rows.length}.</small> : null}
          </>
        ) : null}

        {results ? (
          <div className="data-table">
            <table>
              <thead><tr><th>Row</th><th>Item</th><th>Outcome</th></tr></thead>
              <tbody>
                {results.filter((r) => r.status === 'error').concat(results.filter((r) => r.status !== 'error')).slice(0, 60).map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.name}</td>
                    <td>
                      <Badge tone={r.status === 'error' ? 'red' : r.status === 'skipped' ? '' : 'green'}>{r.status}</Badge>
                      {r.message ? <small className="muted"> {r.message}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ----------------------------- Locations ----------------------------- */

function LocationManager({
  open, onClose, studio, locations, onChanged,
}: {
  open: boolean; onClose: () => void; studio: string;
  locations: LocationRow[]; onChanged: () => Promise<void>;
}) {
  const {notify} = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      await api('/api/assets/locations', {method: 'POST', body: JSON.stringify({studio, name: name.trim(), description: description.trim() || null})});
      notify(`${name.trim()} added to ${studio}.`);
      setName(''); setDescription('');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(location: LocationRow) {
    try {
      await api('/api/assets/locations', {method: 'PATCH', body: JSON.stringify({id: location.id, active: !location.active})});
      await onChanged();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function remove(location: LocationRow) {
    if (!window.confirm(`Remove ${location.name}? Equipment there keeps its row and loses its location.`)) return;
    try {
      const d = await api<{message: string}>(`/api/assets/locations?id=${location.id}`, {method: 'DELETE'});
      notify(d.message);
      await onChanged();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function seed() {
    try {
      const d = await api<{added: number}>('/api/assets/locations', {method: 'POST', body: JSON.stringify({action: 'seed'})});
      notify(d.added ? `${d.added} room${d.added === 1 ? '' : 's'} added from the studio plans.` : 'Every room in the studio plans is already listed.');
      await onChanged();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Locations at ${studio}`}
      description="Where equipment lives. Defined once so counts can be trusted, rather than retyped on every item."
      footer={<button className="btn" onClick={onClose}>Done</button>}
    >
      <div className="stack">
        {error ? <div className="info-box"><TriangleAlert size={16} /><span>{error}</span></div> : null}
        <div className="form-grid">
          <Field label="New location"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="PowerCycle Studio" maxLength={120} /></Field>
          <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} /></Field>
        </div>
        <div className="flex-row" style={{gap: 8}}>
          <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !name.trim()}>
            <Plus size={13} /> Add location
          </button>
          <button className="btn btn-sm" onClick={seed} title="Add the rooms described in the studio plans">
            Import rooms from studio plan
          </button>
        </div>

        {!locations.length ? (
          <Empty title="No locations yet" detail="Add one, or import the rooms already described in the studio plan." />
        ) : (
          <div className="data-table">
            <table>
              <thead><tr><th>Name</th><th>Description</th><th>Active</th><th /></tr></thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td className="muted">{l.description || '—'}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => void toggle(l)}>
                        {l.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => void remove(l)} aria-label={`Remove ${l.name}`}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

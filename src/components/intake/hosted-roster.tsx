"use client";
import {useEffect, useMemo, useState} from 'react';
import {Check, ChevronDown, Loader2, Plus, Trash2, UserRound} from 'lucide-react';
import {decodeLookups, type IntakeValue} from '@/lib/intake/plan';
import {rosterRows, type SessionDetail} from '@/lib/intake/class-desk';
import {OptionSelect} from './option-select';

export const HOSTED_ATTENDANCE = ['Attended', 'Came late', 'Left early', 'No-show', 'Cancelled'];
export const HOSTED_OUTCOME = ['Bought a package', 'Booked an intro or trial', 'Interested, follow up', 'Undecided', 'Not interested'];
export const HOSTED_FOLLOW_UP = ['None needed', 'Call', 'WhatsApp', 'Email', 'Send the intro offer', 'Invite to the next hosted class'];
/** Switches the desk flips per attendee. Each is one fact the partnership review counts. */
export const HOSTED_FLAGS: {id: string; label: string; hint: string}[] = [
  {id: 'first_timer', label: 'First time at Physique 57', hint: 'New to the method'},
  {id: 'proximity_mismatch', label: 'Proximity mismatch', hint: 'Lives or works too far from the studio'},
  {id: 'schedule_mismatch', label: 'Schedule mismatch', hint: 'Our class times do not suit them'},
  {id: 'price_sensitive', label: 'Price sensitive', hint: 'Pricing came up as a blocker'},
  {id: 'not_interested', label: 'Not interested', hint: 'Said they will not continue'},
  {id: 'came_late', label: 'Came late', hint: 'Arrived after the class started'},
  {id: 'already_member', label: 'Already a member', hint: 'Holds an active package'},
  {id: 'medical_note', label: 'Injury or medical note', hint: 'Shared a condition with the trainer'},
  {id: 'content_consent', label: 'Content consent given', hint: 'Agreed to photos or video'},
];

export type HostedRow = {
  key: string; bookingId?: string; memberId?: string; name: string; email?: string; session?: string; booking: string; manual?: boolean;
  attendance: string; outcome: string; followUp: string; flags: string[]; note: string;
};

const bookingState = (r: ReturnType<typeof rosterRows>[number]) => r.cancelled ? 'Cancelled' : r.checkedIn ? 'Checked in' : r.waitlist ? 'Waitlist' : 'Booked';
const summarise = (rows: HostedRow[]) => ({
  booked: rows.filter(r => !r.manual && r.booking !== 'Cancelled').length,
  walkIns: rows.filter(r => r.manual).length,
  attended: rows.filter(r => r.attendance === 'Attended' || r.attendance === 'Came late' || r.attendance === 'Left early').length,
  firstTimers: rows.filter(r => r.flags.includes('first_timer')).length,
  warm: rows.filter(r => /bought|booked|interested, follow/i.test(r.outcome)).length,
});
export const hostedSummary = summarise;

/** The roster of every hosted session linked on the form, with a line per attendee the desk
 *  fills in: attendance, outcome, follow-up, the switches and a note. Bookings come from
 *  Momence; walk-ins are added by hand. Answers already given survive a re-read. */
export function HostedRoster({sessions, rows, onRows, onStatus}: {sessions: IntakeValue; rows: HostedRow[]; onStatus?: (status: 'loading' | 'ready' | 'error') => void; onRows: (next: HostedRow[] | ((prev: HostedRow[]) => HostedRow[]), loaded?: {firstTimers: number; booked: number}) => void}) {
  const refs = useMemo(() => decodeLookups(sessions).filter(r => !r.manual && /^\d+$/.test(r.id)), [sessions]);
  const ids = refs.map(r => r.id).join(',');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ids) { onStatus?.('ready'); return; }
    let cancelled = false;
    (async () => {
      setBusy(true); setError(''); onStatus?.('loading');
      try {
        const details = await Promise.all(refs.map(async ref => {
          const res = await fetch(`/api/momence?module=sessions&id=${encodeURIComponent(ref.id)}`, {cache: 'no-store'});
          if (!res.ok) throw new Error('The roster could not be read from Momence.');
          return {ref, detail: await res.json() as SessionDetail};
        }));
        if (cancelled) return;
        const fresh: HostedRow[] = details.flatMap(({ref, detail}) => rosterRows(detail).map(r => ({
          key: `${ref.id}:${r.bookingId}`, bookingId: r.bookingId, memberId: r.memberId, name: r.name, email: r.email, session: ref.label,
          booking: bookingState(r), attendance: r.cancelled ? 'Cancelled' : r.checkedIn ? 'Attended' : '', outcome: '', followUp: '',
          flags: r.firstTimer ? ['first_timer'] : [], note: '',
        })));
        onRows(prev => {
          const kept = new Map(prev.map(p => [p.key, p]));
          return [...fresh.map(f => kept.has(f.key) ? {...f, ...kept.get(f.key)!, booking: f.booking} : f), ...prev.filter(p => p.manual)];
        }, {firstTimers: fresh.filter(r => r.flags.includes('first_timer')).length, booked: fresh.filter(r => r.booking !== 'Cancelled').length});
        onStatus?.('ready');
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : 'The roster could not be read.'); onStatus?.('error'); } }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, retry]);

  const set = (key: string, patch: Partial<HostedRow>) => onRows(prev => prev.map(r => r.key === key ? {...r, ...patch} : r));
  const toggle = (row: HostedRow, flag: string) => {
    const on = row.flags.includes(flag);
    const flags = on ? row.flags.filter(f => f !== flag) : [...row.flags, flag];
    const patch: Partial<HostedRow> = {flags};
    // The switches and the answers say the same thing, so each keeps the other honest.
    if (flag === 'came_late' && !on && (!row.attendance || row.attendance === 'Attended')) patch.attendance = 'Came late';
    if (flag === 'not_interested' && !on && !row.outcome) patch.outcome = 'Not interested';
    set(row.key, patch);
  };
  const addWalkIn = () => { const key = 'walkin:' + crypto.randomUUID(); onRows(prev => [...prev, {key, name: '', booking: 'Walk-in', manual: true, attendance: 'Attended', outcome: '', followUp: '', flags: [], note: ''}]); setOpen(key); };
  const s = summarise(rows);

  return (
    <div className="hroster">
      <p className="field-hint">A comment is required for every member row, including no-shows and cancellations.</p>
      <div className="hroster-bar">
        <dl className="hroster-stats">
          <div><dt>Booked</dt><dd>{s.booked}</dd></div>
          <div><dt>Attended</dt><dd>{s.attended}</dd></div>
          <div><dt>Walk-ins</dt><dd>{s.walkIns}</dd></div>
          <div><dt>First-timers</dt><dd>{s.firstTimers}</dd></div>
          <div><dt>Warm leads</dt><dd>{s.warm}</dd></div>
        </dl>
        <div className="hroster-actions">
          {rows.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onRows(prev => prev.map(r => r.attendance || r.booking === 'Cancelled' ? r : {...r, attendance: 'Attended'}))}><Check size={13} /> Mark the rest attended</button>}
          <button type="button" className="btn btn-sm" onClick={addWalkIn}><Plus size={13} /> Add walk-in</button>
        </div>
      </div>
      {busy && <div className="hroster-empty"><Loader2 size={15} className="animate-spin" /> Reading the roster from Momence…</div>}
      {error && <div className="hroster-empty error">{error}<button type="button" className="btn btn-sm" onClick={() => setRetry(v => v + 1)}>Retry roster</button></div>}
      {!busy && !rows.length && <div className="hroster-empty"><UserRound size={15} /> {ids ? 'No bookings on the linked class yet. Add walk-ins by hand.' : 'Link the hosted class at the top of the form to load everyone who booked.'}</div>}
      {rows.length > 0 && (
        <div className="hroster-table" role="table" aria-label="Hosted class attendees">
          <div className="hroster-row head" role="row">
            <span role="columnheader">Attendee</span><span role="columnheader">Attendance</span><span role="columnheader">Outcome</span><span role="columnheader">Follow-up</span><span role="columnheader" className="sr-only">Details</span>
          </div>
          {rows.map(r => {
            const isOpen = open === r.key;
            const done = Boolean(r.attendance && r.outcome && r.note.trim());
            return (
              <div className={'hroster-item' + (isOpen ? ' open' : '') + (r.booking === 'Cancelled' ? ' muted' : '')} key={r.key} role="rowgroup">
                <div className="hroster-row" role="row">
                  <span role="cell" className="hroster-who">
                    <span className={'hroster-dot' + (done ? ' done' : '')} aria-hidden="true">{done && <Check size={9} strokeWidth={3} />}</span>
                    {r.manual ? <input className="hroster-name-input" value={r.name} placeholder="Walk-in name" aria-label="Walk-in name" onChange={e => set(r.key, {name: e.target.value})} />
                      : <span className="hroster-name"><b>{r.name}</b><em>{[r.booking, r.email].filter(Boolean).join(' · ')}</em></span>}
                    {!r.note.trim() && <span className="hroster-comment-needed">Comment needed</span>}
                    {r.flags.length > 0 && <span className="hroster-flagcount" title={r.flags.map(f => HOSTED_FLAGS.find(x => x.id === f)?.label).join(', ')}>{r.flags.length}</span>}
                  </span>
                  <span role="cell"><OptionSelect options={HOSTED_ATTENDANCE} value={r.attendance} onChange={v => set(r.key, {attendance: String(v)})} placeholder="Attendance" /></span>
                  <span role="cell"><OptionSelect options={HOSTED_OUTCOME} value={r.outcome} onChange={v => set(r.key, {outcome: String(v)})} placeholder="Outcome" /></span>
                  <span role="cell"><OptionSelect options={HOSTED_FOLLOW_UP} value={r.followUp} onChange={v => set(r.key, {followUp: String(v)})} placeholder="Follow-up" /></span>
                  <span role="cell"><button type="button" className="hroster-expand" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} notes and flags for ${r.name || 'walk-in'}`} onClick={() => setOpen(isOpen ? null : r.key)}><ChevronDown size={15} /></button></span>
                </div>
                <div className="icollapse" inert={!isOpen || undefined}>
                  <div className="icollapse-inner hroster-detail">
                    <div className="hroster-flags" role="group" aria-label="Flags">
                      {HOSTED_FLAGS.map(f => {
                        const on = r.flags.includes(f.id);
                        return <button type="button" key={f.id} role="switch" aria-checked={on} className={'hroster-flag' + (on ? ' on' : '')} onClick={() => toggle(r, f.id)} title={f.hint}>
                          <span className="intake-switch-track" aria-hidden="true"><i /></span><span>{f.label}</span>
                        </button>;
                      })}
                    </div>
                    <label className="hroster-note">
                      <span>Member comment · Required</span>
                      <textarea required aria-label={`Required comment for ${r.name || 'walk-in'}`} rows={2} value={r.note} placeholder="Member reported… For absent members, document the no-show or cancellation." onChange={e => set(r.key, {note: e.target.value})} />
                    </label>
                    {r.manual && <button type="button" className="text-btn hroster-remove" onClick={() => onRows(prev => prev.filter(x => x.key !== r.key))}><Trash2 size={12} /> Remove walk-in</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

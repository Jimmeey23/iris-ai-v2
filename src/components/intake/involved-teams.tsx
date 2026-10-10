"use client";
import {Check, Crown, Sparkles} from 'lucide-react';
import {DEPARTMENT_RECORDS} from '@/lib/constants';

export const INVOLVABLE_TEAMS: {id: string; name: string}[] = DEPARTMENT_RECORDS.filter(d => d.active).map(d => ({id: d.id, name: d.name}));
export const teamName = (id: string) => INVOLVABLE_TEAMS.find(t => t.id === id)?.name || id;

/** Words that say a class-experience ticket is about the room or the kit. */
const FACILITY_SIGNAL = /equipment|facilit|bike|machine|reformer|\bmats?\b|\bweights?\b|\bprops?\b|\bac\b|air ?con|hvac|temperature|too (hot|cold)|lighting|\blights?\b|audio|music|speaker|\bmic\b|sound system|clean|hygien|washroom|shower|locker|odou?r|broken|repair|leak|maintenance/i;
/** Teams worth pre-selecting as co-owners beside the lead department. A class-experience
 *  complaint involving a member is a client-servicing conversation and a training one; when it
 *  is about the room or the kit, operations has work too. Only a suggestion: the desk can
 *  untick any of them, and the caller drops whichever is already the lead. Pure and kept free
 *  of the intake plan, so the legacy composer can use it without loading the plan data. */
export function suggestTeams({category, sub, memberInvolved, text = ''}: {category: string; sub: string; memberInvolved: boolean; text?: string}): string[] {
  if (category !== 'Class Experience') return [];
  const out: string[] = [];
  if (memberInvolved) out.push('sales-client-servicing', 'training');
  if (FACILITY_SIGNAL.test(`${sub} ${text}`)) out.push('operations');
  return out;
}

/** "Also involve these teams": each team picked gets a co-owner of its own beside the lead
 *  owner the category routes to. The lead department is shown, marked, and cannot be picked;
 *  suggested teams carry a spark so the desk can see why they are already on. */
export function InvolvedTeams({lead, value, suggested = [], onChange, compact = false}: {
  lead?: string | null; value: string[]; suggested?: string[]; onChange: (next: string[]) => void; compact?: boolean;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <div className={'iteams' + (compact ? ' compact' : '')}>
      <div className="iteams-head">
        <span className="iteams-label">Also involve these teams</span>
        <small>Each team gets a co-owner beside the lead owner.</small>
      </div>
      <div className="iteams-chips" role="group" aria-label="Also involve these teams">
        {INVOLVABLE_TEAMS.map(t => {
          if (t.id === lead) return <span key={t.id} className="iteams-chip lead" title="The department this ticket routes to"><Crown size={11} />{t.name}<em>Lead</em></span>;
          const on = value.includes(t.id);
          return <button type="button" key={t.id} role="checkbox" aria-checked={on} className={'iteams-chip' + (on ? ' on' : '')} onClick={() => toggle(t.id)}
            title={suggested.includes(t.id) ? 'Suggested from what this ticket is about' : undefined}>
            <span className="iteams-box" aria-hidden="true">{on && <Check size={9} strokeWidth={3} />}</span>{t.name}{suggested.includes(t.id) && <Sparkles size={10} className="iteams-spark" aria-label="suggested" />}
          </button>;
        })}
      </div>
    </div>
  );
}

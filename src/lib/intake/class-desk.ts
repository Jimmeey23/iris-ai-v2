/**
 * Class desk helpers: turn a Momence session detail (item + bookings) into the roll-call
 * numbers and the answers the intake form expects. Pure, so the same code reads a session
 * for the desk and for the review sheet.
 */
import {object} from '../display';
import {encodeLookup, encodeLookups, localDateTime, relativeFor, type ClassSnapshot, type IntakeData} from './plan';

export type SessionDetail = {
  item: {id: string; name: string; subtitle: string; raw: Record<string, unknown>};
  related: Record<string, Record<string, unknown>[]>;
  source: string;
  errors?: string[];
};

export type RosterRow = {
  bookingId: string;
  memberId?: string;
  name: string;
  email?: string;
  checkedIn: boolean;
  cancelled: boolean;
  waitlist: boolean;
  guest: boolean;
  firstTimer: boolean;
  paidWith?: string;
  compatible: boolean | null;
  credits?: number;
};

export type RosterEntry = {status?: string; actions?: string[]; note?: string};

export const ATT_STATUS = ['Attended', 'Late arrival', 'Left early', 'No-show', 'Cancelled before the class', 'On the waitlist, never added', 'Turned away at the door', 'Added as a guest', 'Double-booked spot', 'Checked in but did not train', 'Attended, asked to stop (safety)'];
export const ATT_ACTION = ['Nothing needed', 'Class credit granted', 'Manual check-in in Momence', 'Added from the waitlist', 'Guest pass issued', 'Money credit adjusted', 'Usage-limit override', 'Membership freeze scheduled', 'Freeze removed', 'Refund raised with accounts', 'Waived late-cancellation fee', 'Follow-up call promised', 'Apology + next class free', 'Escalated to the desk owner'];

/** The class-level questions the desk answers in the room. Ids match the plan's enrichment
 *  fields so the answers land on the form as ordinary answers. */
export const CLASS_CAPTURE: {id: string; label: string; multi?: boolean}[] = [
  {id: 'class_host_situation', label: 'Who actually ran it'},
  {id: 'class_experience_effect', label: 'Effect on the experience'},
  {id: 'class_disruption', label: 'What happened to the class'},
  {id: 'class_attendance_match', label: 'Attendance vs. the roll'},
  {id: 'class_capacity_need', label: 'What the class needed', multi: true},
  {id: 'class_audience', label: 'Who was in the room', multi: true},
  {id: 'class_booking_friction', label: 'Booking friction reported', multi: true},
  {id: 'class_rebooking_intent', label: 'Will they come back'},
];

/** Sub-categories a class ticket is usually filed under; shown when the workspace files under them. */
export const CLASS_SUB_CANDIDATES: [string, string][] = [
  ['Scheduling', 'Class Capacity Issues'], ['Scheduling', 'Waitlist Concerns'], ['Scheduling', 'Class Substitutions'], ['Scheduling', 'Trainer Substitutions'],
  ['Scheduling', 'Last-minute Cancellations'], ['Scheduling', 'Booking Confirmation Issues'], ['Scheduling', 'Late Arrival Policy'],
  ['Class Experience', 'Overcrowding in Class'], ['Class Experience', 'Class Flow and Pacing'], ['Class Experience', 'Class Format Satisfaction'], ['Class Experience', 'Class Duration Suitability'],
  ['Class Experience', 'Studio Temperature Too Hot/Cold'], ['Class Experience', 'Audio Issues'],
  ['Trainer Feedback', 'Trainer Punctuality Issues'], ['Trainer Feedback', 'Class Intensity Too High/Low'], ['Trainer Feedback', 'Class Ending on Time'], ['Trainer Feedback', 'Trainer Behaviour'],
  ['Repair and Maintenance', 'Broken Equipment Not Repaired'], ['Repair and Maintenance', 'Studio System Malfunction'],
];

const personName = (p: unknown) => { const o = object(p); return String(o.name || [o.firstName, o.lastName].filter(Boolean).join(' ') || ''); };

export function rosterRows(detail: SessionDetail): RosterRow[] {
  const bookings: Record<string, unknown>[] = [...(detail.related.bookings || []), ...(detail.related.waitlist || []).map(b => ({...b, waitlist: true}))];
  return bookings.map(b => {
    const member = object(b.member);
    const name = personName(member) || String(b.guestName || 'Guest');
    const compat = object(b.compatibility);
    return {
      bookingId: String(b.id ?? name), memberId: member.id != null ? String(member.id) : undefined, name, email: member.email ? String(member.email) : undefined,
      checkedIn: Boolean(b.checkedIn), cancelled: Boolean(b.cancelledAt), waitlist: Boolean(b.waitlist), guest: !member.id,
      firstTimer: Boolean(b.firstTimer || b.isFirstVisit), paidWith: b.paidWith ? String(b.paidWith) : undefined,
      compatible: 'usable' in compat ? Boolean(compat.usable) : null, credits: typeof b.ticketsBought === 'number' ? b.ticketsBought : undefined,
    };
  });
}

export function sessionStats(detail: SessionDetail, rows = rosterRows(detail)) {
  const s = detail.item.raw;
  const startsAt = String(s.startsAt || '');
  const started = startsAt ? new Date(startsAt).getTime() < Date.now() : false;
  const booked = rows.filter(r => !r.cancelled && !r.waitlist);
  const attended = booked.filter(r => r.checkedIn).length;
  const capacity = typeof s.capacity === 'number' ? s.capacity : null;
  const waitlist = typeof s.waitlistBookingCount === 'number' ? s.waitlistBookingCount : rows.filter(r => r.waitlist).length;
  return {
    started, capacity, booked: booked.length || (typeof s.bookingCount === 'number' ? s.bookingCount : 0), attended,
    absent: started ? Math.max(0, booked.length - attended) : null,
    cancelled: rows.filter(r => r.cancelled).length, waitlist, guests: rows.filter(r => r.guest && !r.cancelled).length,
    firstTimers: booked.filter(r => r.firstTimer).length, incompatible: booked.filter(r => r.compatible === false).length,
    overbook: capacity ? Math.max(0, booked.length - capacity) : 0, fillPct: capacity ? Math.round(100 * booked.length / capacity) : null,
  };
}

export function sessionSnapshot(detail: SessionDetail, entries: Record<string, RosterEntry>, rows = rosterRows(detail)): ClassSnapshot {
  const s = detail.item.raw; const st = sessionStats(detail, rows);
  const flagged = rows.filter(r => flaggedEntry(entries[r.bookingId]));
  return {
    sessionId: detail.item.id, name: detail.item.name, startsAt: String(s.startsAt || '') || undefined,
    studio: personName(s.inPersonLocation) || undefined, trainer: personName(s.teacher) || undefined, source: detail.source,
    capacity: st.capacity, booked: st.booked, attended: st.attended, absent: st.absent, waitlist: st.waitlist, cancelled: st.cancelled,
    guests: st.guests, firstTimers: st.firstTimers, overbook: st.overbook, fillPct: st.fillPct,
    attendees: flagged.map(r => ({id: r.bookingId, memberId: r.memberId, name: r.name, status: entries[r.bookingId]?.status, actions: entries[r.bookingId]?.actions, note: entries[r.bookingId]?.note})),
  };
}

export const flaggedEntry = (e?: RosterEntry) => Boolean(e && (e.status || (e.actions || []).length || (e.note || '').trim()));

/** Maps a Momence location name onto the workspace's studio list, tolerating the short form. */
/** The facts a session record states outright — what the form may copy without inferring. */
export function sessionFacts(detail: SessionDetail) {
  const s = detail.item.raw;
  const startsAt = String(s.startsAt || '');
  const when = startsAt && Number.isFinite(new Date(startsAt).getTime()) ? new Date(startsAt) : null;
  return {name: detail.item.name, coach: personName(s.teacher), location: personName(s.inPersonLocation), startsAt, when};
}

export function matchStudio(location: string, studios: string[]) {
  const loc = location.toLowerCase();
  return studios.find(s => s.toLowerCase() === loc) || studios.find(s => loc && (s.toLowerCase().includes(loc) || loc.includes(s.split(',')[0].toLowerCase()))) || '';
}

/** The answers the class desk writes onto the form — the same field ids the plan uses, so
 *  review, routing and the handover need no special path. Only facts read from Momence or
 *  chosen by the desk go in; nothing is inferred. */
export function classDeskAnswers(detail: SessionDetail, captured: IntakeData, entries: Record<string, RosterEntry>, studios: string[], rows = rosterRows(detail)): IntakeData {
  const st = sessionStats(detail, rows);
  const flagged = rows.filter(r => flaggedEntry(entries[r.bookingId]));
  const {coach, location, startsAt, when} = sessionFacts(detail);
  const out: IntakeData = {
    class_date: encodeLookup({id: detail.item.id, label: detail.item.name, sublabel: detail.item.subtitle}),
    class_format: detail.item.name,
    trainer: coach || undefined,
    studio: matchStudio(location, studios) || undefined,
    occurred_at: when ? localDateTime(when) : undefined,
    occurred_relative: relativeFor(startsAt),
  };
  for (const c of CLASS_CAPTURE) if (captured[c.id] !== undefined && captured[c.id] !== '' && !(Array.isArray(captured[c.id]) && !(captured[c.id] as string[]).length)) out[c.id] = captured[c.id];
  for (const k of ['class_audience_notes', 'class_host_notes', 'class_compatibility_notes']) if (captured[k]) out[k] = captured[k];
  if (flagged.length) {
    out.attendee_flag_count = String(flagged.length);
    out.attendee_summary = flagged.map(r => { const e = entries[r.bookingId] || {}; return `${r.name}: ${e.status || '—'}${(e.actions || []).length ? ` → ${e.actions!.join(', ')}` : ''}${e.note ? ` · ${e.note}` : ''}`; }).join(' | ').slice(0, 1800);
    const offered = [...new Set(flagged.flatMap(r => entries[r.bookingId]?.actions || []))];
    if (offered.length) out.attendee_actions_taken = offered;
    const members = flagged.filter(r => r.memberId).map(r => ({id: r.memberId!, label: r.name, sublabel: entries[r.bookingId]?.status || ''}));
    if (members.length) out.attendees_affected = encodeLookups(members);
    if (members.length && !captured.member_name) out.member_name = encodeLookup({id: members[0].id, label: members[0].label, sublabel: rows.find(r => r.memberId === members[0].id)?.email || ''});
  }
  if (typeof captured.class_disruption === 'string' && captured.class_disruption && captured.class_disruption !== 'None') out.class_impacted = 'Yes — class was disrupted';
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== null && v !== '')) as IntakeData;
}

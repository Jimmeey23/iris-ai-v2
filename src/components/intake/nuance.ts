import {filled, type IntakeData, type IntakeField} from '@/lib/intake/plan';

/**
 * What changes about the form from one sub-category to the next, beyond its questions: the
 * one thing the desk should have to hand before starting, and the answers that should change
 * how the page looks (someone hurt, money charged twice, a member about to leave).
 */

export type Tip = {icon: 'shield' | 'rupee' | 'wrench' | 'monitor' | 'calendar' | 'user' | 'quote' | 'megaphone' | 'search' | 'clipboard' | 'camera' | 'clock'; text: string};

/** First match wins; sub-category patterns sit above the category defaults. */
const SUB_TIPS: {match: RegExp; tips: Tip[]}[] = [
  {match: /injury|medical|first aid|physical discomfort|emergency/i, tips: [
    {icon: 'shield', text: 'Make sure the person is safe and the studio manager knows before you finish this form.'},
    {icon: 'clock', text: 'Note the exact time. The welfare follow-up is due within 24 hours.'},
  ]},
  {match: /harassment|suspicious|trespass|personal safety|staff security/i, tips: [
    {icon: 'shield', text: 'Keep names to the people who need them. Mark the ticket restricted if the reporter asks.'},
    {icon: 'camera', text: 'Ask for CCTV to be held now. Footage is overwritten within days.'},
  ]},
  {match: /theft|stolen|taken from|valet theft/i, tips: [
    {icon: 'camera', text: 'Write down the time window it went missing so CCTV can be pulled.'},
    {icon: 'search', text: 'Check lost and found and the locker log before filing.'},
  ]},
  {match: /lost|misplaced|left behind|forgetting|missing towels/i, tips: [
    {icon: 'search', text: 'Describe the item well enough to recognise it: colour, brand, anything written on it.'},
  ]},
  {match: /refund|incorrect charges|auto-debit|payment processing|unauthorised refunds/i, tips: [
    {icon: 'rupee', text: 'Have the transaction or UPI reference and the amount charged ready.'},
    {icon: 'clipboard', text: 'Say what the member expected to pay. Accounts compares the two.'},
  ]},
  {match: /freeze|pause|upgrade|downgrade|expiry|renewal/i, tips: [
    {icon: 'user', text: 'Link the member so their current package and balance come across from Momence.'},
  ]},
  {match: /powercycle|bike/i, tips: [
    {icon: 'wrench', text: 'Note the bike number and whether it has been taken out of rotation.'},
  ]},
  {match: /ac and hvac|temperature|ventilation|air quality|cold air/i, tips: [
    {icon: 'wrench', text: 'A thermometer reading helps the engineer more than "too hot".'},
  ]},
  {match: /plumbing|leak|water dispenser|shower|steam/i, tips: [
    {icon: 'wrench', text: 'If water is running, isolate the supply first, then file.'},
  ]},
  {match: /time change|level change|additional classes|session length|timings|weekend vs|early morning/i, tips: [
    {icon: 'calendar', text: 'Name the current slot and the one being asked for. Demand evidence decides whether the grid changes.'},
  ]},
  {match: /substitution|no-show|late arrival|punctuality|ending on time/i, tips: [
    {icon: 'calendar', text: 'Link the class so the coach, start time and roster are attached.'},
  ]},
  {match: /login|password|app|website|booking system|notifications|glitch|bug|freezing/i, tips: [
    {icon: 'monitor', text: 'Copy the exact error message and the steps that led to it.'},
  ]},
  {match: /negative reviews|social media|testimonials/i, tips: [
    {icon: 'megaphone', text: 'Paste the link to the post or review. Do not reply publicly until the owner has seen it.'},
  ]},
  {match: /hosted class|partnership|collab|influencer/i, tips: [
    {icon: 'megaphone', text: 'Record what guests and the partner said in their own words, plus any sale on the day.'},
  ]},
];

const CATEGORY_TIPS: Record<string, Tip[]> = {
  'Scheduling': [{icon: 'calendar', text: 'Say which slot this is about and how many members are asking.'}],
  'Class Experience': [{icon: 'quote', text: "Use the member's own words wherever you can."}],
  'Trainer Feedback': [{icon: 'quote', text: 'Stick to what was seen or said in the room. The trainer will read this in review.'}],
  'Repair and Maintenance': [{icon: 'wrench', text: 'Say exactly where the fault is and whether the space is still usable.'}],
  'Studio Amenities and Facilities': [{icon: 'wrench', text: 'Note the area and when it was noticed. Housekeeping works from the time of day.'}],
  'Operating Systems': [{icon: 'monitor', text: 'Name the system, who is blocked and any workaround in use.'}],
  'Tech Issues': [{icon: 'monitor', text: 'Name the device and what was tried before filing.'}],
  'Pricing and Memberships': [{icon: 'rupee', text: 'Link the member so their package and payments come across from Momence.'}],
  'Customer Service and Communication': [{icon: 'clock', text: 'Note how long the member has waited and who they already spoke to.'}],
  'Brand Feedback': [{icon: 'megaphone', text: 'Add the link to the post, asset or campaign this is about.'}],
  'Safety and Security': [{icon: 'shield', text: 'If anyone is at risk right now, act first and file after.'}],
  'Theft and Lost Items': [{icon: 'search', text: 'Describe the item and the last time and place it was seen.'}],
  'Internal Operations & Admin': [{icon: 'clipboard', text: 'Say who needs to decide and by when.'}],
  'Miscellaneous': [{icon: 'clipboard', text: 'Describe what happened plainly. The desk will sort it.'}],
};

export function tipsFor(category: string, sub: string): Tip[] {
  return SUB_TIPS.find(t => t.match.test(sub))?.tips || CATEGORY_TIPS[category] || CATEGORY_TIPS.Miscellaneous;
}

export type Alert = {tone: 'red' | 'amber'; title: string; body: string};

/** Answers that should change the page, strongest first. */
export function alertFor(data: IntakeData): Alert | null {
  const danger = String(data.immediate_danger || '');
  if (/^yes/i.test(danger)) return {tone: 'red', title: danger.replace(/^yes\s*[—-]\s*/i, '').replace(/^./, c => c.toUpperCase()), body: 'Someone may be at risk. Make sure they are safe and the studio manager is told now. This ticket files as critical.'};
  const injury = String(data.injury_occurred || data.injury_risk || '');
  if (/^yes|treatment|escalated|fatality/i.test(injury)) return {tone: 'red', title: 'Injury recorded', body: 'A welfare follow-up is required within 24 hours. Note who gave first aid and whether family was told.'};
  if (/^high/i.test(String(data.churn_risk || ''))) return {tone: 'amber', title: 'Member may not renew', body: 'The owner will be asked to call them. Record anything they said about leaving.'};
  if (/^yes|not yet/i.test(String(data.class_impacted || ''))) return {tone: 'amber', title: 'A class is affected', body: 'Link the class so the coach and roster are attached to the ticket.'};
  return null;
}

/** What the form covers, in the desk's words: the topical groups this sub-category brings. */
export const TOPICAL = new Set(['Safety & incident', 'Lost & found', 'Payment & billing', 'Equipment & facility', 'Systems & data', 'Schedule & timetable', 'Trainer & method', 'Member experience', 'Brand & partnerships', 'Internal & policy']);
export function focusOf(fields: IntakeField[]): string[] {
  const seen: string[] = [];
  for (const f of fields) if (TOPICAL.has(f.section) && !seen.includes(f.section) && (f.required || !f.enrich)) seen.push(f.section);
  return seen;
}

export const answeredCount = (fields: IntakeField[], data: IntakeData) => fields.filter(f => filled(data[f.id])).length;

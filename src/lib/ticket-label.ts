/**
 * The line a ticket is known by.
 *
 * Titles used to be built from the taxonomy: subcategory, class format and studio joined
 * with separators, giving rows like "Waitlist Concerns · Studio Barre 57 · Kwality House".
 * That says which drawer the ticket was filed in. It does not say what happened, so a list
 * of twenty tickets in one subcategory read as twenty copies of the same line and the only
 * way to tell them apart was to open each one.
 *
 * A label here answers "what is this about?" in one glance, taken from what the reporter
 * actually said. Classification still exists — it is shown as chips beside the label — so
 * nothing is lost by no longer repeating it in the title.
 */

/** Openers that carry no information. Stripped before the first sentence is taken. */
const OPENERS = [
  // A salutation is the greeting plus at most a short address ("Hi team,", "Hey Shifa,").
  // Matching everything up to the first full stop instead swallowed the whole sentence.
  /^(hi|hiya|hello|hey|dear)\b(\s+(team|all|there|guys|folks|everyone|ops|support|[A-Z][a-z]+)){0,2}\s*[,!.:;—–-]*\s*/i,
  /^(good\s+(morning|afternoon|evening))\b(\s+(team|all|everyone))?\s*[,!.:;—–-]*\s*/i,
  // The subject is optional: once "Hi team," is removed, what remains is "just wanted to
  // report that ...", with no "I" left to anchor on.
  /^((i|we)\s+)?(just\s+)?(wanted|want|would like|need)\s+to\s+(report|raise|flag|log|mention|share|say|let\s+you\s+know)\b(\s+that)?[,:]?\s*/i,
  /^just\s+(reporting|flagging|logging|raising)\b[,:]?\s*/i,
  /^(this is|i am|i'm)\s+(reporting|raising|flagging|writing)\s+(about|regarding|to report)?\s*/i,
  /^(please\s+(be\s+advised|note)( that)?|kindly\s+note( that)?|fyi)\b[,:]?\s*/i,
  /^(there\s+(is|was|has been)\s+(an?\s+)?(issue|problem|complaint)\s+with)\s+/i,
  /^(reporting|raising|logging|flagging)\s*[:-]\s*/i,
  /^(issue|problem|complaint|request|feedback)\s*[:-]\s*/i,
  /^(the\s+)?(member|client|guest)\s+(has\s+)?(reported|said|mentioned|complained)\s+(that\s+)?/i,
  /^that\s+/i,
];

/** Punctuation left stranded once an opener in front of it is removed. */
const STRANDED_PUNCTUATION = /^\s*[,!.:;—–-]+\s*/;

/** Subcategory names are Title Case drawer labels. These read as English in a sentence. */
const SUBCATEGORY_PHRASES: Record<string, string> = {
  'Waitlist Concerns': 'waitlist did not clear',
  'Laptops Not Functioning': 'front-desk laptop not working',
  'Speakers Static Noise': 'speakers crackling',
  'Mic Not Working': 'microphone not working',
  'Phones Not Working': 'studio phone not working',
  'Studio Wi-Fi Not Working': 'studio Wi-Fi down',
  'Ventilation Poor': 'poor ventilation',
  'Air Quality Poor': 'poor air quality',
  'Cleanliness and Hygiene': 'cleanliness needs attention',
  'Shower Water Pressure': 'low shower water pressure',
  'Steam Room Not Working': 'steam room out of order',
  'Locker Availability': 'not enough lockers free',
  'Payment Processing Delays': 'payment did not go through',
  'Auto-Debit Incorrect Charges': 'auto-debit charged the wrong amount',
  'Incorrect Charges on Account': 'incorrect charge on the account',
  'Booking System Errors': 'booking system error',
  'Password and Login Issues': 'cannot sign in',
  'Wrong Class Bookings': 'booked into the wrong class',
  'Notifications Not Received': 'notifications not arriving',
};

const FILLER_TAIL = /\s*(please advise|please help|kindly help|thanks?( you)?|regards|asap)\s*[.!]*$/i;

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();

/** Trim to a word boundary rather than mid-word, and only add the ellipsis if we cut. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
}

/** Leaves acronyms and proper nouns alone — only the first character is touched. */
const sentenceCase = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

/** "Waitlist Concerns" → "waitlist concerns", but "Wi-Fi" and "SLA" keep their shape. */
function humanise(subcategory: string): string {
  if (SUBCATEGORY_PHRASES[subcategory]) return SUBCATEGORY_PHRASES[subcategory];
  return subcategory
    .split(' ')
    .map((word) => (/^[A-Z0-9][A-Z0-9-]+$/.test(word) || /-/.test(word) ? word : word.toLowerCase()))
    .join(' ');
}

/** A "Field name: value" line, as produced by every form and template submission. */
const FIELD_LINE = /^([A-Z][A-Za-z0-9 /&'()-]{2,44}):[ \t]*(.*)$/;

/** Values that answer a form field without describing anything. */
const EMPTY_ANSWER = /^(yes|no|n\/?a|none|nil|na|ok|okay|good|fine|-|—|\.)?$/i;

/** Field names that tend to hold the actual account of what happened, best first. */
const NARRATIVE_FIELDS = [
  /^(what happened|description|details?|issue|concern|complaint|problem|summary|comments?|notes?|feedback|observation)/i,
  /^(development areas?|areas? for improvement|key strengths?)/i,
];

/**
 * Splits a form-style description into its fields. Returns an empty array for free prose,
 * which is how the caller tells the two apart.
 */
function formFields(text: string): {name: string; value: string}[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields: {name: string; value: string}[] = [];
  for (const line of lines) {
    const match = line.match(FIELD_LINE);
    if (match) fields.push({name: match[1].trim(), value: clean(match[2])});
    else if (fields.length) fields[fields.length - 1].value = clean(`${fields[fields.length - 1].value} ${line}`);
  }
  // One field out of six lines is prose that happens to contain a colon, not a form.
  return fields.length >= 1 && fields.length * 2 >= lines.length ? fields : [];
}

/** The most informative thing a form submission actually says. */
function fromForm(fields: {name: string; value: string}[]): string {
  const substantive = fields.filter((f) => f.value.length >= 15 && !EMPTY_ANSWER.test(f.value));
  if (!substantive.length) return '';
  for (const pattern of NARRATIVE_FIELDS) {
    const hit = substantive.find((f) => pattern.test(f.name));
    if (hit) return hit.value;
  }
  return substantive[0].value;
}

/** The first sentence of what was written, with the throat-clearing removed. */
function firstStatement(description: string): string {
  let raw = (description || '').trim();
  if (!raw) return '';

  // Imported conversation threads open with the thread's own subject in brackets:
  // "[Client upset and wants to cancel membership] — Booking / Scheduling: ...".
  // That subject is the single most descriptive line in the record — far better than the
  // taxonomy that follows it — so it is preferred whenever it reads as a phrase rather
  // than an identifier.
  const tagged = raw.match(/^\[([^\]]{3,90})\]\s*[—–-]?\s*/);
  if (tagged) {
    const subject = clean(tagged[1]).replace(/[.\s]+$/, '');
    if (subject.length >= 15 && subject.split(/\s+/).length >= 3) return clip(subject, LABEL_MAX);
    const untagged = raw.slice(tagged[0].length).trim();
    if (untagged.length >= 20) raw = untagged;
  }

  // Imported threads summarise themselves under "Key statements:". The first bullet is the
  // substance; the rest are message counts and dates.
  const bullet = raw.match(/key statements?:\s*\n\s*[•*-]\s*(.+)/i);
  if (bullet) {
    const first = clean(bullet[1]);
    if (first.length >= 15 && !/^thread has \d+ message/i.test(first)) return clip(first, LABEL_MAX);
  }

  // Form submissions are not prose: taking their first sentence yields "Development areas: No".
  const fields = formFields(raw);
  if (fields.length) {
    const value = fromForm(fields);
    if (!value) return '';
    const stop = value.search(/[.!?](\s|$)/);
    return clean((stop > 0 ? value.slice(0, stop) : value).replace(FILLER_TAIL, ''));
  }

  let text = clean(raw);
  let changed = true;
  // Openers stack: "Hi, just wanted to report that the mic is dead."
  while (changed) {
    changed = false;
    for (const opener of OPENERS) {
      const next = text.replace(opener, '').replace(STRANDED_PUNCTUATION, '');
      if (next !== text) { text = next; changed = true; }
    }
  }
  const stop = text.search(/[.!?](\s|$)/);
  let sentence = stop > 0 ? text.slice(0, stop) : text;
  // A very short first sentence ("It broke.") is usually a lead-in; take the next one too.
  if (sentence.length < 25 && stop > 0) {
    const rest = text.slice(stop + 1);
    const nextStop = rest.search(/[.!?](\s|$)/);
    const second = nextStop > 0 ? rest.slice(0, nextStop) : rest;
    if (second.trim()) sentence = `${sentence}. ${second.trim()}`;
  }
  return clean(sentence.replace(FILLER_TAIL, ''));
}

export interface LabelInput {
  description?: string | null;
  memberName?: string | null;
  subcategory?: string | null;
  category?: string | null;
  kind?: string | null;
  studio?: string | null;
  classFormat?: string | null;
  trainer?: string | null;
  sentiment?: string | null;
}

export const LABEL_MAX = 76;

/**
 * A short, readable description of what the ticket is about.
 *
 * Prefers the reporter's own words. Falls back to a humanised subcategory with whatever
 * context distinguishes it — never to a bare taxonomy string, because that is the thing
 * this replaces.
 */
export function describeTicket(input: LabelInput, maxLength = LABEL_MAX): string {
  const studioShort = input.studio ? input.studio.split(',')[0].trim() : '';
  const format = input.classFormat ? input.classFormat.split('+')[0].trim() : '';
  const praise = input.kind === 'compliment' || input.sentiment === 'positive';

  // A trainer assessment is a scored form, not an account of an incident. Its free-text
  // fields are fragments ("Development areas: No"), so the readable label is who was
  // assessed and in what — which is also what somebody scanning the list is looking for.
  if (input.kind === 'assessment') {
    const who = input.trainer || input.memberName || '';
    const head = who ? `Trainer assessment — ${who}` : 'Trainer assessment';
    // The competency assessed is what differs between one trainer's assessments; the studio
    // is usually the same for all of them and so tells a reader nothing.
    const qualifier = input.subcategory ? sentenceCase(humanise(input.subcategory)) : format || studioShort;
    return clip(qualifier ? `${head} · ${qualifier}` : head, maxLength);
  }

  const statement = firstStatement(input.description || '');
  // Anything shorter than this is not a description, it is a fragment ("broken", "see above").
  if (statement.length >= 14) return clip(sentenceCase(statement), maxLength);

  const subject = input.subcategory ? humanise(input.subcategory) : input.category ? humanise(input.category) : 'Studio issue';
  if (praise) {
    const forWhom = input.trainer || format || studioShort;
    return clip(forWhom ? `Appreciation for ${forWhom}` : 'Member appreciation', maxLength);
  }
  // Only add context that actually distinguishes this from its neighbours.
  const context = [format ? `in ${format}` : '', studioShort ? `at ${studioShort}` : ''].filter(Boolean).join(' ');
  return clip(sentenceCase(context ? `${subject} ${context}` : subject), maxLength);
}

/** True when a stored title is one of the old taxonomy-joined strings, or is otherwise
 *  not telling a reader anything. Used to decide which historical rows to relabel. */
export function isGenericLabel(title: string, subcategory?: string | null, category?: string | null): boolean {
  const t = clean(title || '');
  if (!t) return true;
  // The old format: two or more segments joined by a middot.
  if (t.includes(' · ')) return true;
  if (subcategory && t.toLowerCase() === subcategory.toLowerCase()) return true;
  if (category && t.toLowerCase() === category.toLowerCase()) return true;
  if (t.toLowerCase() === 'member appreciation') return true;
  if (t.length < 14) return true;
  return false;
}

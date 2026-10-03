/**
 * Who the trainers are, and which city they belong to.
 *
 * A trainer is not a row in a table — `tickets.trainer` is free text, written by whoever
 * filed the ticket and by two external review forms. The same person therefore arrives under
 * several spellings, and the Trainers page, which groups by that string, drew one card per
 * spelling. On the live board that is:
 *
 *   Siddhartha / Siddhartha Kusuma · Simonelle / Simonelle De Vitre
 *   Richard / Richard D'Costa      · Bret / Bret Saldanha
 *   Karanvir / Karanvir Bhatia     · Chaitanya / Chaitanya Nahar / Chaitanya Padhye
 *
 * Most of those are one person written two ways and are folded together here. "Chaitanya" is
 * not: there are two Chaitanyas, so a bare first name cannot be resolved without being told
 * which, and it is left as its own card and reported as ambiguous so an administrator can
 * merge it deliberately. Guessing would silently attribute one trainer's reviews to another.
 *
 * Grouping is by **city**, not by studio: a trainer covers several studios in their city, so
 * a per-studio grouping listed the same person repeatedly and answered a question nobody
 * asked. Bengaluru is a named list; everybody else is Mumbai.
 */
import {TRAINERS} from './constants';

export type TrainerCity = 'Mumbai' | 'Bengaluru';

/**
 * Trainers present in the ticket history who are not in the `TRAINERS` roster. Kept separate
 * so the roster stays the authoritative list for intake pickers, while the Trainers page can
 * still show somebody who has reviews on file but no roster entry.
 *
 * Empty at present: the one candidate, "Chaitanya Padhye", turned out to be a misspelling
 * rather than a second trainer — see BUILT_IN_ALIASES.
 */
export const KNOWN_TRAINERS: {name: string; city: TrainerCity; active: boolean}[] = [];

/**
 * Spellings in the ticket history that are known to be somebody already on the roster.
 *
 * These are corrections to the data, not administrator preferences, so they ship with the app
 * and need nobody to click anything: a workspace that has never opened the Trainers page still
 * gets one card per trainer. An administrator can still override any of them from the page —
 * `overrides.aliases` is consulted first.
 *
 * "Chaitanya Padhye" carries 31 tickets and "Chaitanya Nahar" 8; they are one person, and the
 * correct name is Chaitanya Nahar, so the 39 land on one card. Folding it here also makes a
 * bare "Chaitanya" unambiguous again, since there is no longer a second Chaitanya to confuse
 * it with.
 */
const BUILT_IN_ALIASES: Record<string, string> = {
  'chaitanya padhye': 'Chaitanya Nahar',
};

/** Bengaluru, by first name as given: Kajol, Pushyank, Shruti, Siddhartha, Chaitanya.
 *  Everyone else is Mumbai. Matched on the first name because that is how the list was given
 *  and because both Chaitanyas and both Nahars sit on either side of it. */
const BENGALURU_FIRST_NAMES = new Set(['kajol', 'pushyank', 'shruti', 'siddhartha', 'chaitanya']);

export const DEFAULT_CITY: TrainerCity = 'Mumbai';

const firstName = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

/** The city a trainer belongs to before any administrator override. */
export function defaultCityFor(name: string): TrainerCity {
  return BENGALURU_FIRST_NAMES.has(firstName(name)) ? 'Bengaluru' : DEFAULT_CITY;
}

/** Every name this module knows, roster first. */
export function knownTrainerNames(): string[] {
  return [...new Set([...TRAINERS, ...KNOWN_TRAINERS.map(t => t.name)])];
}

export type TrainerOverrides = {
  /** Variant spelling (lowercased) → the canonical name it belongs to. Written by an
   *  administrator merging two cards; this is the only way an ambiguous name is ever folded. */
  aliases: Record<string, string>;
  /** Canonical name → the city an administrator put them in, overriding `defaultCityFor`. */
  cities: Record<string, TrainerCity>;
  /** Canonical names an administrator has removed from the page. The reviews stay on file —
   *  hiding a card is not deleting its history, and a hidden card can be restored. */
  hidden: string[];
  /** Canonical name → the display name an administrator prefers (a correction, not a merge). */
  displayNames: Record<string, string>;
};

export const EMPTY_OVERRIDES: TrainerOverrides = {aliases: {}, cities: {}, hidden: [], displayNames: {}};

export type Resolution =
  | {name: string; via: 'exact' | 'alias' | 'first-name'}
  /** A first name that matches more than one trainer. Kept as its own group. */
  | {name: string; via: 'ambiguous'; candidates: string[]};

/**
 * Resolves one written trainer string to the name its reviews should be grouped under.
 *
 * Order matters: an administrator's alias wins over everything, then an exact roster match,
 * then a unique first name. Anything else is returned unchanged, so an unknown trainer still
 * gets a card rather than being dropped from the page.
 */
export function resolveTrainer(raw: string, overrides: TrainerOverrides = EMPTY_OVERRIDES): Resolution {
  const written = raw.trim().replace(/\s+/g, ' ');
  if (!written) return {name: '', via: 'exact'};
  const lower = written.toLowerCase();

  // An administrator's merge first, then the corrections that ship with the app.
  const alias = overrides.aliases[lower] ?? BUILT_IN_ALIASES[lower];
  if (alias) return {name: alias, via: 'alias'};

  const known = knownTrainerNames();
  const exact = known.find(name => name.toLowerCase() === lower);
  if (exact) return {name: exact, via: 'exact'};

  // A single word that is somebody's first name: "Siddhartha" → "Siddhartha Kusuma".
  if (!written.includes(' ')) {
    const candidates = known.filter(name => firstName(name) === lower);
    if (candidates.length === 1) return {name: candidates[0], via: 'first-name'};
    if (candidates.length > 1) return {name: written, via: 'ambiguous', candidates};
  }
  return {name: written, via: 'exact'};
}

/** The name to print for a group, after any administrator correction. */
export function displayNameFor(canonical: string, overrides: TrainerOverrides = EMPTY_OVERRIDES): string {
  return overrides.displayNames[canonical] || canonical;
}

export function cityFor(canonical: string, overrides: TrainerOverrides = EMPTY_OVERRIDES): TrainerCity {
  return overrides.cities[canonical] || defaultCityFor(canonical);
}

/** City order on the page: Mumbai first (the larger group), then Bengaluru. */
export const CITY_ORDER: TrainerCity[] = ['Mumbai', 'Bengaluru'];

/**
 * The handle a teammate is tagged by.
 *
 * Tagging used to require the person's full display name — `@Mrigakshi Jaiswal` — which is a
 * poor thing to type into a note on a phone at the front desk, and worse to read back: a
 * mention was indistinguishable from an ordinary use of somebody's name, and a name with a
 * space in it has no obvious end, so "@Anita Rao said" and "@Anita" both had to be guessed at.
 *
 * A username is one token with no space: `@mrigakshi`. It is derived once and then stored,
 * because it appears inside the text of saved comments — re-deriving it later (after a
 * rename, or after somebody new joins and takes the shorter form) would silently break every
 * mention already written.
 *
 * Derivation, in order: the email local part, then the first name, then the full name; each
 * reduced to lowercase letters, digits and dots. A clash is resolved by appending the
 * surname, then a number, so `@anita` and `@anita.rao` can both exist and neither moves.
 */

/** Lowercase, ASCII-ish, no spaces: what can live inside `@…` and still end unambiguously. */
export function slugUsername(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 32);
}

/** Candidate handles for one person, best first. */
export function usernameCandidates(person: {name: string; email: string}): string[] {
  const local = slugUsername(person.email.split('@')[0] || '');
  const words = person.name.trim().split(/\s+/).filter(Boolean);
  const first = slugUsername(words[0] || '');
  const last = slugUsername(words[words.length - 1] || '');
  const full = first && last && first !== last ? `${first}.${last}` : '';
  // The email local part is first because it is what the person already answers to in every
  // other system; a name-derived handle is the fallback for an address like `ops@` or `info@`.
  return [...new Set([local, first, full, slugUsername(person.name)].filter(Boolean))];
}

/**
 * Picks a handle that is not in `taken`. Mutates nothing — the caller records the result.
 * Returns null only when the person has neither a usable name nor a usable address.
 */
export function pickUsername(person: {name: string; email: string}, taken: Set<string>): string | null {
  for (const candidate of usernameCandidates(person)) if (!taken.has(candidate)) return candidate;
  const base = usernameCandidates(person)[0];
  if (!base) return null;
  // Every readable form is taken: fall back to a numbered one rather than refusing a handle,
  // since a person with no username cannot be tagged at all.
  for (let n = 2; n < 100; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
  return null;
}

/** `@handle` as it is typed and as it is stored in a comment body. */
export const mentionToken = (username: string) => '@' + username;

/**
 * Every `@handle` in a piece of text.
 *
 * A trailing full stop or comma is not part of the handle ("thanks @anita."), but an internal
 * dot is (`@anita.rao`), so the trailing punctuation is trimmed rather than excluded from the
 * character class.
 */
export function mentionsIn(body: string): string[] {
  const out = new Set<string>();
  for (const match of body.matchAll(/(?:^|[^\w@])@([a-z0-9][a-z0-9.]{0,31})/gi))
    out.add(match[1].toLowerCase().replace(/\.+$/, ''));
  return [...out];
}

/**
 * Contact details in the Momence browser.
 *
 * Member emails and phone numbers are the most sensitive thing the workspace holds, and the
 * Momence tab is a browsing surface: it is open on a shared desk for long stretches, in view
 * of whoever walks past. So the browser masks them, and a passcode typed into that tab
 * reveals them for a while.
 *
 * Two deliberate boundaries:
 *
 *  - **Masking happens on the server.** A CSS blur still ships the address to the browser,
 *    where anyone can read it out of the network tab. What is masked here never leaves the
 *    server in full.
 *  - **Only the browsing surface is masked.** The same endpoint fills the contact fields on
 *    a ticket when staff pick a member during intake; masking that would quietly break
 *    ticket creation. Intake asks for one named record it already needs; the tab lists
 *    everybody. The difference is the point.
 *
 * The unlock is a shared convenience code, not authentication — it stops a passer-by
 * reading a screen, and nothing more. The cookie it sets is signed so it cannot simply be
 * typed into devtools, scoped to one person, and short-lived.
 */
import {createHmac, timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';

export const PII_COOKIE = 'momence_pii';
/** How long one unlock lasts. Long enough to work through a list, short enough that a desk
 *  left unattended re-masks itself. */
export const PII_TTL_SECONDS = 30 * 60;

const passcode = () => (process.env.MOMENCE_PII_PASSCODE || '9818').trim();
const secret = () => process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'iris-dev-only';

const sign = (userId: number, expiry: number) =>
  createHmac('sha256', secret()).update(`${userId}.${expiry}`).digest('hex').slice(0, 32);

export function unlockToken(userId: number) {
  const expiry = Date.now() + PII_TTL_SECONDS * 1000;
  return `${expiry}.${sign(userId, expiry)}`;
}

/** Constant-time comparison, so a wrong code cannot be narrowed down by timing. */
export function passcodeMatches(supplied: string) {
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(passcode());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function piiUnlocked(userId: number) {
  const raw = (await cookies()).get(PII_COOKIE)?.value;
  if (!raw) return false;
  const [expiryText, mac] = raw.split('.');
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry < Date.now() || !mac) return false;
  const expected = sign(userId, expiry);
  const a = Buffer.from(mac), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "priya@example.com" → "p•••@example.com". Enough to recognise a record you already know,
 *  not enough to contact anybody. */
export function maskEmail(value: string) {
  const [user, domain] = value.split('@');
  if (!domain) return '•'.repeat(Math.max(4, value.length));
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, user.length - 1))}@${domain}`;
}

/** Keeps the last two digits: the desk often confirms a member by them. */
export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '•'.repeat(6);
  return `${'•'.repeat(Math.max(4, digits.length - 2))}${digits.slice(-2)}`;
}

const EMAIL_KEYS = /^(email|emailaddress|e_mail)$/i;
const PHONE_KEYS = /^(phone|phonenumber|phone_number|mobile|contact|contactnumber)$/i;
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_IN_TEXT = /(?:\+?\d[\d\s-]{7,}\d)/g;

/** Masks a free-text line — the list subtitle is "priya@example.com · +91 98…". */
export function maskText(value: string) {
  return value
    .replace(EMAIL_IN_TEXT, m => maskEmail(m))
    .replace(PHONE_IN_TEXT, m => maskPhone(m));
}

/** Recursively masks anything that looks like a contact detail. Depth-limited: Momence
 *  payloads nest, and an unbounded walk over an unknown shape is how a list endpoint
 *  becomes slow. */
export function maskDeep(value: unknown, depth = 0): unknown {
  if (depth > 4) return value;
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map(v => maskDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => {
        if (typeof v === 'string' && EMAIL_KEYS.test(k)) return [k, maskEmail(v)];
        if (typeof v === 'string' && PHONE_KEYS.test(k)) return [k, maskPhone(v)];
        return [k, maskDeep(v, depth + 1)];
      }),
    );
  }
  return value;
}

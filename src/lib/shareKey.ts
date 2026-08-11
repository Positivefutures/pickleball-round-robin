import { APP_URL } from './appInfo';

/**
 * The name a shared session goes by, and the whole of its security.
 *
 * A published session is readable by anyone who can produce its key, and there
 * is no server tier here to notice somebody trying keys quickly. So the key's
 * own size is the only thing standing between a stranger and a session:
 * ten symbols out of thirty-two is 2^50, about a quadrillion. Nobody types it,
 * because it arrives as a QR code, so length costs nothing.
 *
 * Deliberately not generateId(). That returns a uuid when it can and falls back
 * to fourteen hex characters when it cannot, and that fallback is guessable
 * enough to matter here in a way it does not for a player id.
 */

/**
 * Crockford's base 32: the digits and the letters, less I, L, O and U. The
 * first three because they are twins of 1, 1 and 0 when a key is read aloud or
 * squinted at, and U because leaving it out keeps accidental words out of keys.
 *
 * Thirty-two divides 256 exactly, which is what makes `byte & 31` an unbiased
 * pick. An alphabet of any other size would need rejection sampling to avoid
 * quietly favouring its first few symbols.
 */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const SHARE_KEY_LENGTH = 10;

/** The query parameter a shared link travels in. */
export const SHARE_PARAM = 's';

/**
 * Thrown when the browser has no cryptographic random source.
 *
 * There is no fallback on purpose. Math.random() would produce a key of the
 * right shape and the wrong strength, and a share nobody can open beats one
 * anybody can guess. Every browser that runs this app has getRandomValues, so
 * this is a guard rather than a case.
 */
export class NoRandomSource extends Error {
  constructor() {
    super('This browser cannot create a secure link.');
    this.name = 'NoRandomSource';
  }
}

export function mintShareKey(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) throw new NoRandomSource();

  const bytes = crypto.getRandomValues(new Uint8Array(SHARE_KEY_LENGTH));
  let key = '';
  for (const byte of bytes) key += ALPHABET[byte & 31];
  return key;
}

export function isShareKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== SHARE_KEY_LENGTH) return false;
  for (const symbol of value) {
    if (!ALPHABET.includes(symbol)) return false;
  }
  return true;
}

/**
 * Built from APP_URL rather than a second copy of the host. index.html already
 * writes that address out again for the share-preview scrapers, and two is
 * enough.
 */
export function shareUrl(key: string): string {
  return `${APP_URL}?${SHARE_PARAM}=${key}`;
}

/**
 * The key this page was opened with, if it was opened with one.
 *
 * Validated rather than merely read. Whatever comes back from here decides
 * whether the app boots at all, so a stray or truncated `?s=` has to fall
 * through to the ordinary app rather than into a viewer with nothing to view.
 */
export function sharedKeyFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  return isShareKey(value) ? value : null;
}

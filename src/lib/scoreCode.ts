/**
 * The four digits, and what leaves the phone in their place.
 *
 * The host types a code and reads it out to the court. That code stays on the
 * host's own phone, in the clear, because they have to be able to read it back
 * — see the note on `scoreEditCode` in stores.ts. What gets published is this
 * file's business: a salt and a SHA-256 of the two joined, which is what
 * `share_code_ok()` in migration 0007 recomputes when a watcher offers a code.
 *
 * ## Why a salt at all
 *
 * Four digits is ten thousand possibilities, so a bare hash is a lookup table
 * somebody could build in a second and reverse the whole table with. The salt
 * makes that table worth building once per share instead of once ever, and it
 * means two hosts who both pick 1234 do not publish the same hash. It is not a
 * secret and is stored beside the hash.
 *
 * ## A new salt every publish
 *
 * Nothing here is remembered between publishes. Each one mints a fresh salt and
 * hashes again, and both columns are written in the same upsert, so the pair on
 * the row is always self-consistent. The alternative — keeping the salt in a
 * store — would be a third thing to hold in step with the code and the switch,
 * for no gain: rotating a value that is not secret costs one hash of twenty
 * bytes.
 */

/** Four boxes, four digits. The shape of the thing is the instruction. */
export const CODE_LENGTH = 4;

/**
 * 16 bytes, written as 32 hex characters. The migration's check constraint
 * wants between 16 and 64 characters, so this sits comfortably inside it.
 */
const SALT_BYTES = 16;

/** Built from the constant so the two cannot drift apart. */
const EXACTLY = new RegExp(`^[0-9]{${CODE_LENGTH}}$`);

/** A finished code, as opposed to one somebody is still typing. */
export function isCode(value: unknown): value is string {
  return typeof value === 'string' && EXACTLY.test(value);
}

export interface SealedCode {
  /** SHA-256 of salt and code joined, lower-case hex, 64 characters. */
  hash: string;
  salt: string;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export function mintSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * The same sum the database does, in the same order: salt first, then code,
 * UTF-8, SHA-256, hex. If either end of that ever changes, both ends change.
 */
export async function hashCode(salt: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + code));
  return toHex(new Uint8Array(digest));
}

/**
 * The two columns to publish, or null when there is nothing to publish.
 *
 * Null for a code that is not four digits, which covers both editing being off
 * and a host who is halfway through typing. The caller writes null into both
 * columns then, which is what switches editing off at the far end.
 *
 * Also null where the browser has no WebCrypto. That is a page served over
 * plain http from something other than localhost, which this app is not: it
 * needs a secure context for the service worker and the clipboard already. The
 * guard is here so that an odd browser ends with editing quietly off rather
 * than with publishing throwing, because a host who cannot share a code can
 * still share the session.
 */
export async function sealCode(code: string | null): Promise<SealedCode | null> {
  if (!isCode(code)) return null;
  if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) return null;

  const salt = mintSalt();
  return { salt, hash: await hashCode(salt, code) };
}

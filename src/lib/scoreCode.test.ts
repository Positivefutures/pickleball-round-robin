/**
 * @vitest-environment happy-dom
 *
 * The four digits, and what leaves the phone in their place.
 *
 * One test here matters more than the rest: the sum this file computes has to
 * be the sum `share_code_ok()` computes in migration 0007, byte for byte. If
 * the two ever drift, every code a host sets is refused and nothing on either
 * side looks broken. So it is checked against an independent implementation —
 * Node's own SHA-256 — rather than against itself.
 *
 * The others are about what must not be published: the code, and a hash that
 * two hosts could share.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { CODE_LENGTH, hashCode, isCode, mintSalt, sealCode } from './scoreCode';

/** What the database will do with the same two strings. */
const asPostgresWould = (salt: string, code: string) =>
  createHash('sha256').update(salt + code, 'utf8').digest('hex');

describe('what counts as a code', () => {
  it('takes exactly four digits', () => {
    expect(isCode('0000')).toBe(true);
    expect(isCode('9317')).toBe(true);
  });

  it('refuses anything else', () => {
    // Half typed, one too many, and the three ways a digit can be something
    // else: a space, a sign, and a letter that looks like one.
    for (const value of ['', '1', '123', '12345', '12 4', '-123', '12e4', '12O4']) {
      expect(isCode(value), value).toBe(false);
    }
    expect(isCode(null)).toBe(false);
    expect(isCode(1234)).toBe(false);
  });
});

describe('the salt', () => {
  it('is long enough for the constraint the migration puts on the column', () => {
    // 0007 wants between 16 and 64 characters. A salt outside that is a row
    // the database refuses, which would stop the whole session publishing.
    const salt = mintSalt();
    expect(salt.length).toBeGreaterThanOrEqual(16);
    expect(salt.length).toBeLessThanOrEqual(64);
    expect(salt).toMatch(/^[0-9a-f]+$/);
  });

  it('is different every time', () => {
    // The point of it. A salt that repeated would let one table of ten
    // thousand hashes open every share ever published.
    const minted = new Set(Array.from({ length: 50 }, () => mintSalt()));
    expect(minted.size).toBe(50);
  });
});

describe('the hash', () => {
  it('is the sum the database recomputes', async () => {
    const salt = mintSalt();
    expect(await hashCode(salt, '1234')).toBe(asPostgresWould(salt, '1234'));
  });

  it('puts the salt first, which is the order the migration joins them in', async () => {
    // Both halves are digits and hex, so a file that concatenated them the
    // other way round would still produce a hash of the right shape and refuse
    // every code. Only the order tells them apart.
    const salt = 'abcdef0123456789';
    expect(await hashCode(salt, '1234')).toBe(asPostgresWould(salt, '1234'));
    expect(await hashCode(salt, '1234')).not.toBe(asPostgresWould('1234', salt));
  });

  it('is 64 hex characters, which is what the column will hold', async () => {
    const hash = await hashCode(mintSalt(), '0000');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sealing a code for publication', () => {
  it('gives back a salt and a hash and never the code', async () => {
    const sealed = await sealCode('4719');
    expect(sealed).not.toBeNull();
    expect(sealed?.hash).toBe(asPostgresWould(sealed?.salt ?? '', '4719'));
    // The digits themselves must not be recoverable from what is published.
    expect(JSON.stringify(sealed)).not.toContain('4719');
  });

  it('salts each publish separately, so the same code is never the same hash', async () => {
    const first = await sealCode('4719');
    const second = await sealCode('4719');
    expect(first?.salt).not.toBe(second?.salt);
    expect(first?.hash).not.toBe(second?.hash);
  });

  it('gives nothing for a code still being typed', async () => {
    for (const half of ['', '4', '47', '471']) {
      expect(await sealCode(half), half).toBeNull();
    }
    expect(await sealCode(null)).toBeNull();
  });

  it('agrees with the boxes about how long a code is', () => {
    // CodeEntry draws CODE_LENGTH boxes and this file decides what it will
    // seal. Four boxes and a five digit code would be four boxes nobody could
    // fill in a way this accepted.
    expect(CODE_LENGTH).toBe(4);
    expect(isCode('1'.repeat(CODE_LENGTH))).toBe(true);
    expect(isCode('1'.repeat(CODE_LENGTH + 1))).toBe(false);
  });
});

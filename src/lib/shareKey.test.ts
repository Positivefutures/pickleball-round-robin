/**
 * @vitest-environment happy-dom
 *
 * The name a shared session goes by.
 *
 * This module is the security of the whole sharing feature, so the tests here
 * are about strength rather than shape. Two things in particular would look
 * fine on screen and be broken: a key drawn from a biased generator, which
 * quietly shrinks the space somebody has to search; and a `?s=` that is read
 * rather than checked, which sends anyone with a mistyped link into a viewer
 * with nothing to view.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  ALPHABET,
  SHARE_KEY_LENGTH,
  isShareKey,
  mintShareKey,
  sharedKeyFromUrl,
  shareUrl,
} from './shareKey';
import { APP_URL } from './appInfo';

function visit(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

afterEach(() => visit(''));

describe('minting a key', () => {
  it('is ten symbols, all of them from the alphabet', () => {
    const key = mintShareKey();
    expect(key).toHaveLength(SHARE_KEY_LENGTH);
    for (const symbol of key) expect(ALPHABET).toContain(symbol);
  });

  it('uses the whole alphabet, so the space is as big as it looks', () => {
    // A generator that never emits its last few symbols has a smaller space
    // than the arithmetic claims, and nothing on screen would show it. Ten
    // thousand keys is 100,000 symbols over 32 buckets: a symbol that cannot
    // come up is the only realistic way for one to be missing here.
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      for (const symbol of mintShareKey()) seen.add(symbol);
    }
    expect([...seen].sort().join('')).toBe(ALPHABET);
  });

  it('does not repeat itself', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i++) keys.add(mintShareKey());
    expect(keys.size).toBe(10_000);
  });

  it('leaves out the characters that read as each other', () => {
    // I and 1, L and 1, O and 0. Somebody reading a key down the phone should
    // not have to say "letter O".
    for (const twin of ['I', 'L', 'O', 'U']) {
      expect(ALPHABET).not.toContain(twin);
    }
  });
});

describe('recognising a key', () => {
  it('accepts one it just made', () => {
    expect(isShareKey(mintShareKey())).toBe(true);
  });

  it('refuses the wrong length', () => {
    expect(isShareKey('ABC')).toBe(false);
    expect(isShareKey('ABCDEFGHJKM')).toBe(false);
    expect(isShareKey('')).toBe(false);
  });

  it('refuses lower case, so a key is one string and not two', () => {
    expect(isShareKey('abcdefghjk')).toBe(false);
  });

  it('refuses the characters the alphabet leaves out', () => {
    expect(isShareKey('IIIIIIIIII')).toBe(false);
    expect(isShareKey('ABCDEFGHJO')).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    expect(isShareKey(null)).toBe(false);
    expect(isShareKey(undefined)).toBe(false);
    expect(isShareKey(1234567890)).toBe(false);
  });
});

describe('the link', () => {
  it('is built from the one address the app already knows', () => {
    // Not a second hardcoded host. index.html carries the address again for the
    // preview scrapers, and two copies is already one more than anybody checks.
    expect(shareUrl('ABCDEFGHJK')).toBe(`${APP_URL}?s=ABCDEFGHJK`);
  });

  it('round-trips: what shareUrl writes, sharedKeyFromUrl reads', () => {
    const key = mintShareKey();
    visit(new URL(shareUrl(key)).search);
    expect(sharedKeyFromUrl()).toBe(key);
  });
});

describe('reading the key off the page', () => {
  it('finds a good one', () => {
    visit('?s=ABCDEFGHJK');
    expect(sharedKeyFromUrl()).toBe('ABCDEFGHJK');
  });

  it('finds it beside other parameters', () => {
    visit('?utm_source=whatsapp&s=ABCDEFGHJK');
    expect(sharedKeyFromUrl()).toBe('ABCDEFGHJK');
  });

  it('is null when there is no key at all', () => {
    visit('');
    expect(sharedKeyFromUrl()).toBeNull();
  });

  it('is null for a key that is not one', () => {
    // The load-bearing case. A link truncated by a chat app has to land on the
    // ordinary app, because a viewer that boots with a key nothing answers to
    // is a blank screen where somebody expected their session.
    visit('?s=ABCDEF');
    expect(sharedKeyFromUrl()).toBeNull();
    visit('?s=');
    expect(sharedKeyFromUrl()).toBeNull();
    visit('?s=abcdefghjk');
    expect(sharedKeyFromUrl()).toBeNull();
  });

  it('does not collide with the parameters the app already uses', () => {
    // ?code and ?error_description belong to the sign-in return trip, and
    // ?crashtest to the error boundary. None of them should boot a viewer.
    visit('?code=abc123&crashtest');
    expect(sharedKeyFromUrl()).toBeNull();
  });
});

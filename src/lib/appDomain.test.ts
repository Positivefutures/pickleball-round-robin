/**
 * The app lives at app.roundrobinator.com, and it says so with one voice.
 *
 * Sibling of appName.test.ts, guarding the other half of the rebrand and
 * against the same failure: not a broken build, but one surface still handing
 * out the old address months later, rendering perfectly, seen by nobody who
 * would recognise it as wrong. A QR code is the worst of these, because it is
 * printed and carried to a court before anyone reads it.
 *
 * Three constants in appInfo.ts carry an address between them, and everything
 * in the app reads from those three. `index.html` is the exception it cannot
 * avoid: share-preview scrapers need absolute URLs and static HTML cannot
 * import, so it writes the host out again and is checked against APP_URL here.
 *
 * ## What this file does NOT say
 *
 * The old host is banned from the source. It is emphatically **not** retired
 * from the internet. `app.pbroundrobin.com` must keep serving this app, at that
 * exact address, for good:
 *
 *   - printed schedules and QR codes already carry it to courts, and
 *   - every home-screen install made before 2026-08-23 lives in that origin's
 *     storage. A browser keeps a site's data per address. Point that host
 *     anywhere else and those hosts open the app to an empty roster, with no
 *     way back to their groups.
 *
 * That is the one change in this rebrand that would destroy user data, so it is
 * written down here where somebody tidying up will read it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_URL, DONATE_URL, FEEDBACK_EMAIL } from './appInfo';

const root = resolve(__dirname, '../..');
const src = resolve(root, 'src');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const DOMAIN = 'roundrobinator.com';

/** Banned in the source. Still very much alive in DNS: see the note above. */
const OLD_DOMAIN = 'pbroundrobin';

/**
 * The two files allowed to say the old host out loud. `appInfo.ts` records the
 * move in the comment above APP_URL, together with the warning about never
 * retiring it, which is where somebody changing that line will read it. This
 * one has to hold the string in order to ban it.
 */
const HOME = 'src/lib/appInfo.ts';
const SELF = 'src/lib/appDomain.test.ts';

/**
 * The static files, which have no build step and so cannot import a constant.
 * `index.html` writes the host out for the scrapers; the two legal pages carry
 * the contact address, and are the copy a store listing links to.
 */
const STATIC_FILES = ['index.html', 'public/privacy.html', 'public/terms.html'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk(src)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => relative(root, f).split('\\').join('/'));

describe('the app has one address', () => {
  it('finds the source files to check, so a passing suite is not an empty one', () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources).toContain(SELF);
    expect(sources).toContain(HOME);
  });

  it('points the three constants at it', () => {
    expect(APP_URL).toBe(`https://app.${DOMAIN}/`);
    expect(FEEDBACK_EMAIL).toBe(`jeff@${DOMAIN}`);
    expect(DONATE_URL).toBe('https://ko-fi.com/roundrobinator');
  });

  it('ends APP_URL with a slash, because share links are built by appending', () => {
    // `${APP_URL}?s=CODE` is what a QR code encodes. Drop the slash and every
    // printed code carries a malformed URL that no test of the QR itself would
    // notice, because the encoding would still be perfect.
    expect(APP_URL.endsWith('/')).toBe(true);
    expect(() => new URL(APP_URL)).not.toThrow();
    expect(new URL(`${APP_URL}?s=ABCDEFGHJK`).host).toBe(`app.${DOMAIN}`);
  });

  it('has left nothing behind under the old one', () => {
    const stale = sources
      .filter((f) => f !== HOME && f !== SELF)
      .filter((f) => read(f).includes(OLD_DOMAIN));
    expect(stale).toEqual([]);
  });
});

describe('the files that cannot import it', () => {
  for (const file of STATIC_FILES) {
    it(`${file} carries the address, and only the current one`, () => {
      const text = read(file);
      expect(text).toContain(DOMAIN);
      expect(text).not.toContain(OLD_DOMAIN);
    });
  }

  it('gives the scrapers the same host the app hands out', () => {
    // A share preview pointing at one host while Share App sends another is the
    // sort of split nobody sees until a link previews as the wrong thing.
    const html = read('index.html');
    expect(html).toContain(`<meta property="og:url" content="${APP_URL}" />`);
    for (const tag of ['og:image', 'twitter:image']) {
      const found = html.match(new RegExp(`${tag}" content="([^"]+)"`))?.[1];
      expect(found).toBe(`${APP_URL}og-banner.png`);
    }
  });

  it('reaches the contact address from both legal pages', () => {
    for (const page of ['public/privacy.html', 'public/terms.html']) {
      expect(read(page)).toContain(`mailto:${FEEDBACK_EMAIL}`);
    }
  });
});

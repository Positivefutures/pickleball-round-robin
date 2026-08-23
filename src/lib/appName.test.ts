/**
 * The app is called RoundRobinator, and it is called that everywhere.
 *
 * The rename of 2026-08-22 touched twenty-odd files, and the failure it invites
 * is not a broken build. It is one surface — a PDF footer, a manifest, a legal
 * page — that nobody thought to open, still saying the old name months later,
 * still rendering perfectly. That is invisible to review and invisible to every
 * other test in this suite.
 *
 * So there are two guards here. Inside `src/`, nothing may write either half of
 * the name down: `appInfo.ts` holds them and everything else imports. Outside
 * `src/` there is nothing to import from, so the four static files that carry
 * their own copy are checked against the constants instead.
 *
 * The old name is banned outright in both places. It survives on purpose in
 * PRODUCT-CONTEXT.md and launch-checklist.md, where it is history and a list of
 * competitors, and neither is checked here.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_FULL_NAME, APP_NAME, APP_SUBTITLE } from './appInfo';

const root = resolve(__dirname, '../..');
const src = resolve(root, 'src');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const OLD_NAME = 'Pickleball Round Robin';

/** Where the name is allowed to be typed rather than imported. */
const HOME = 'src/lib/appInfo.ts';

/**
 * The two files that are allowed to say the old name out loud. `appInfo.ts`
 * records the rename in the comment above the constants, which is where somebody
 * reading that file will want it; this one has to hold the string in order to
 * ban it.
 */
const SELF = 'src/lib/appName.test.ts';

/**
 * The static files, which have no build step and so cannot import a constant.
 * Each one is somebody's first sight of the app: the tab, the home screen icon,
 * and the two pages a store listing has to link to.
 */
const STATIC_FILES = [
  'index.html',
  'public/site.webmanifest',
  'public/privacy.html',
  'public/terms.html',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk(src)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => relative(root, f).split('\\').join('/'));

describe('the app has one name, written down once', () => {
  it('finds the source files to check, so a passing suite is not an empty one', () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources).toContain(HOME);
  });

  it('is spelled the way the banner spells it', () => {
    expect(APP_NAME).toBe('RoundRobinator');
    expect(APP_SUBTITLE).toBe('Round Robin Generator');
    expect(APP_FULL_NAME).toBe('RoundRobinator: Round Robin Generator');
  });

  it('is never typed into a component or a library', () => {
    // The subtitle is two ordinary words and turns up in prose that is not the
    // name — "builds a round robin", a chapter heading. Only the name itself is
    // distinctive enough to ban outright, and it is the half that matters: the
    // subtitle without it is a description, the name without it is the brand.
    const offenders = sources.filter(
      (f) => f !== HOME && !f.endsWith('.test.ts') && read(f).includes(APP_NAME)
    );
    expect(offenders).toEqual([]);
  });

  it('has left nothing behind under the old one', () => {
    const stale = sources
      .filter((f) => f !== HOME && f !== SELF)
      .filter((f) => read(f).includes(OLD_NAME));
    expect(stale).toEqual([]);
  });
});

describe('the files that cannot import it', () => {
  for (const file of STATIC_FILES) {
    it(`${file} carries the name, and only the current one`, () => {
      const text = read(file);
      expect(text).toContain(APP_NAME);
      expect(text).not.toContain(OLD_NAME);
    });
  }

  it('names it in full where a stranger is reading, not just the coined word', () => {
    // The tab and the share preview are seen by somebody who has never heard of
    // this app, so the words that say what it is have to travel with the name.
    expect(read('index.html')).toContain(`<title>${APP_FULL_NAME}</title>`);
    expect(read('index.html')).toContain(`content="${APP_FULL_NAME}"`);
    expect(JSON.parse(read('public/site.webmanifest')).name).toBe(APP_FULL_NAME);
  });
});

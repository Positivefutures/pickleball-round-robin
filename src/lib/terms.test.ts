/**
 * The terms are a claim about the business, and the business can change.
 *
 * Sibling of privacy.test.ts, and the same failure is being guarded against: a
 * page that still renders, still reads well, and is quietly no longer true. The
 * privacy policy goes stale when a company is added. These go stale when money
 * changes hands.
 *
 * So the load-bearing test here is the one about payments. The page says, in as
 * many words, that nothing is charged for and that a donation buys nothing. The
 * day a payment library is installed, that sentence is wrong and the page has to
 * be rewritten before the first charge rather than after it. Nothing else in the
 * project would notice.
 *
 * The rest is drift: the button names it sends people to, the address it gives,
 * and whether the two pages and the app still point at one another.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DONATE_URL, FEEDBACK_EMAIL, PRIVACY_URL, TERMS_URL } from './appInfo';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/** TERMS_URL is a browser path; the file behind it lives in public/. */
const TERMS_FILE = `public${TERMS_URL}`;
const terms = read(TERMS_FILE);

/**
 * How a payment provider shows up in a dependency list. Taking money always
 * arrives as one of these, because nothing in this app can charge a card on its
 * own and no sane version of it ever would.
 */
const PAYMENT_MARKERS = ['stripe', 'paddle', 'lemonsqueez', 'braintree', 'paypal', 'square'];

describe('the terms of service page', () => {
  it('still describes a free app, or nothing is taking money yet', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const paid = Object.keys(pkg.dependencies).filter((name) =>
      PAYMENT_MARKERS.some((marker) => name.toLowerCase().includes(marker))
    );
    // If this fails, the fix is not to delete the test. It is to rewrite "If the
    // app ever charges for anything" into what is actually being charged, and to
    // do it before the first payment goes through.
    expect(paid).toEqual([]);
    expect(terms).toContain('There is no charge for any part of it today.');
  });

  it('names the donation site the Donate button actually opens', () => {
    // Blanking DONATE_URL hides Donate from the menu, and then the paragraph
    // about it is describing a button nobody can see.
    if (DONATE_URL === '') return;
    expect(DONATE_URL).toContain('ko-fi');
    expect(terms).toContain('Ko-fi');
  });

  it('sends people to the buttons that exist, by the names they carry', () => {
    expect(terms).toContain('Import / Export');
    expect(terms).toContain('My Account');
    expect(terms).toContain('Download My Data');
  });

  it('gives the contact address the rest of the app gives', () => {
    // Every mailto on the page, not just the printed text and not just the
    // first one. A link that reads as the right address and opens a different
    // one is the version of this that nobody notices.
    const mailtos = [...terms.matchAll(/href="mailto:([^"?]+)/g)].map((m) => m[1]);
    expect(mailtos.length).toBeGreaterThan(0);
    expect([...new Set(mailtos)]).toEqual([FEEDBACK_EMAIL]);
    expect(terms).toContain(FEEDBACK_EMAIL);
  });

  it('is dated, so a reader can tell how old the agreement is', () => {
    expect(terms).toMatch(/Last updated \d{1,2} [A-Z][a-z]+ \d{4}/);
  });

  it('loads nothing from another company, and fetches no script', () => {
    // There is one inline script, for the Close button. What has to stay true
    // is that nothing is fetched: an inline script cannot be swapped out from
    // under the page, and nothing here can be watched by anyone else.
    expect(terms).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(terms).not.toMatch(/(src|href)="https?:\/\//i);
  });

  it('closes with a link, so the button is not dead without JavaScript', () => {
    // The page's whole point is that it renders with nothing running. A
    // <button> would leave an X on screen that did nothing at all.
    const close = /<a href="\/" class="close-page" id="close-page" aria-label="Close"/;
    expect(terms).toMatch(close);
  });

  it('links only to files that exist', () => {
    const paths = [...terms.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      // "/" is the app itself, served from index.html rather than public/.
      if (path === '/') continue;
      expect(() => read(`public${path}`)).not.toThrow();
    }
  });
});

describe('the two legal pages', () => {
  it('point at each other, so landing on either one finds the other', () => {
    expect(terms).toContain(`href="${PRIVACY_URL}"`);
    expect(read(`public${PRIVACY_URL}`)).toContain(`href="${TERMS_URL}"`);
  });
});

describe('the app', () => {
  it('links to the terms from the footer and from the settings drawer', () => {
    for (const file of ['src/App.tsx', 'src/components/layout/SettingsPanel.tsx']) {
      const source = read(file);
      // The href itself, not just the import. A file that imports the constant
      // and links somewhere else would otherwise pass this happily.
      expect(source).toContain('href={TERMS_URL}');
      expect(source).toContain('Terms of Service');
    }
  });

  it('points TERMS_URL at a file that is really published', () => {
    // public/ is copied to the site root by Vite, so this path is the address.
    expect(TERMS_URL.startsWith('/')).toBe(true);
    expect(() => read(TERMS_FILE)).not.toThrow();
  });
});

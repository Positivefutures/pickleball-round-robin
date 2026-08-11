/**
 * The privacy policy is a promise, and a promise goes stale.
 *
 * Nothing else in this project can go quietly wrong in quite this way. A stale
 * policy still renders, still passes every other test, and still reads
 * convincingly. It is only wrong about the world, which no compiler is watching.
 *
 * So these tests are about the two claims on that page that the code can
 * actually contradict:
 *
 *   - "This is the whole list" of companies involved. Adding a service is one
 *     `npm install`, and the day that happens the page becomes untrue. The test
 *     reads the real dependencies and insists each one is named on the page.
 *   - The rights it points at. It tells people to press two buttons and to write
 *     to one address. All three are values in this repo, and all three would
 *     otherwise drift.
 *
 * It also checks the page still stands up alone: no other company's script, and
 * no link to an image that is not there.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_EMAIL, PRIVACY_URL } from './appInfo';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/** PRIVACY_URL is a browser path; the file behind it lives in public/. */
const POLICY_FILE = `public${PRIVACY_URL}`;
const policy = read(POLICY_FILE);

/**
 * Every company on the page, and how to spot the ones the code knows about.
 *
 * Resend has no marker in this repo at all: it is configured in Supabase's
 * dashboard as the mail sender, so nothing here can detect it and it is only
 * ever a literal. That is precisely why it is written down here, where a person
 * removing it would have to mean it.
 */
const PROCESSORS = [
  { name: 'Vercel', dependency: '@vercel/analytics' },
  { name: 'Supabase', dependency: '@supabase/supabase-js' },
  { name: 'Sentry', dependency: '@sentry/browser' },
  { name: 'Resend', dependency: null },
  { name: 'Ko-fi', dependency: null },
];

/**
 * Dependencies that ship in the bundle and reach nobody, so they belong to no
 * company on the page above.
 *
 * React is the app itself. qrcode-generator draws the square a player scans:
 * the link is encoded in the browser and never sent anywhere to be made into a
 * picture, which is the whole reason it is a dependency rather than an image
 * service. The test below reads their code and holds them to it.
 */
const LOCAL_ONLY = ['react', 'react-dom', 'qrcode-generator'];

describe('the privacy policy page', () => {
  it('names every company the app sends anything to', () => {
    for (const { name } of PROCESSORS) {
      expect(policy).toContain(name);
    }
  });

  it('has no processor beyond the five it says are the whole list', () => {
    const rows = policy.match(/<tbody>[\s\S]*?<\/tbody>/);
    expect(rows).not.toBeNull();
    const cells = [...rows![0].matchAll(/<tr>\s*<td[^>]*>([^<]+)<\/td>/g)].map((m) => m[1].trim());
    // Sorted, because the order they are listed in is a reading decision.
    expect(cells.sort()).toEqual(PROCESSORS.map((p) => p.name).sort());
  });

  it('names a company for every third party the app actually ships', () => {
    // The guard that catches the real failure: somebody adds an SDK and the
    // page, written today, does not know about it. Dependencies are the honest
    // signal, because a service that touches user data has to be installed.
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const known = new Set(
      PROCESSORS.map((p) => p.dependency).filter((d): d is string => d !== null)
    );

    const unaccounted = Object.keys(pkg.dependencies).filter(
      (name) => !known.has(name) && !LOCAL_ONLY.includes(name)
    );
    expect(unaccounted).toEqual([]);
  });

  it('is right that the local-only dependencies really are local', () => {
    // LOCAL_ONLY is the escape hatch on the test above, so it has to be one
    // that cannot be used carelessly. React is the app itself. qrcode-generator
    // turns a string into a grid of squares, which is arithmetic and nothing
    // else, and this reads its shipped code to say so rather than taking the
    // comment above on trust.
    //
    // Primitives, not addresses. A URL sitting in a source file reaches nobody
    // without something to call it with, and the QR encoder does contain the
    // SVG namespace and a couple of links in its licence header.
    for (const name of ['qrcode-generator']) {
      const entry = JSON.parse(read(`node_modules/${name}/package.json`)) as { module?: string; main: string };
      const source = read(`node_modules/${name}/${entry.module ?? entry.main}`);
      for (const primitive of [
        'fetch(',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'sendBeacon',
        'navigator.',
        'localStorage',
        'document.cookie'
      ]) {
        expect(`${name}: ${source.includes(primitive)}`).toBe(`${name}: false`);
      }
    }
  });

  it('points at the two buttons that carry out the rights', () => {
    // The wording on the buttons themselves, so renaming one breaks this.
    expect(policy).toContain('Download My Data');
    expect(policy).toContain('Delete Account');
    expect(policy).toContain('My Account');
    // And says the word people have to type, which is what makes it a warning
    // rather than a surprise.
    expect(policy).toContain('DELETE');
  });

  it('gives the contact address the rest of the app gives', () => {
    // Every mailto on the page, not just the printed text and not just the
    // first one. A link that reads as the right address and opens a different
    // one is the version of this that nobody notices.
    const mailtos = [...policy.matchAll(/href="mailto:([^"?]+)/g)].map((m) => m[1]);
    expect(mailtos.length).toBeGreaterThan(0);
    expect([...new Set(mailtos)]).toEqual([FEEDBACK_EMAIL]);
    expect(policy).toContain(FEEDBACK_EMAIL);
  });

  it('is dated, so a reader can tell how old the promise is', () => {
    expect(policy).toMatch(/Last updated \d{1,2} [A-Z][a-z]+ \d{4}/);
  });

  it('loads nothing from another company, and fetches no script', () => {
    // There is one inline script, for the Close button. What has to stay true
    // is that nothing is fetched: an inline script cannot be swapped out from
    // under the page, and nothing here can be watched by anyone else.
    expect(policy).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(policy).not.toMatch(/(src|href)="https?:\/\//i);
  });

  it('closes with a link, so the button is not dead without JavaScript', () => {
    // The page's whole point is that it renders with nothing running. A
    // <button> would leave an X on screen that did nothing at all.
    const close = /<a href="\/" class="close-page" id="close-page" aria-label="Close"/;
    expect(policy).toMatch(close);
  });

  it('links only to files that exist', () => {
    const paths = [...policy.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      // "/" is the app itself, served from index.html rather than public/.
      if (path === '/') continue;
      expect(() => read(`public${path}`)).not.toThrow();
    }
  });
});

describe('the app', () => {
  it('links to the policy from the footer and from the settings drawer', () => {
    for (const file of ['src/App.tsx', 'src/components/layout/SettingsPanel.tsx']) {
      const source = read(file);
      // The href itself, not just the import. A file that imports the constant
      // and links somewhere else would otherwise pass this happily.
      expect(source).toContain('href={PRIVACY_URL}');
      expect(source).toContain('Privacy Policy');
    }
  });

  it('points PRIVACY_URL at a file that is really published', () => {
    // public/ is copied to the site root by Vite, so this path is the address.
    expect(PRIVACY_URL.startsWith('/')).toBe(true);
    expect(() => read(POLICY_FILE)).not.toThrow();
  });
});

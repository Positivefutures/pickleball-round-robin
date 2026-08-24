/**
 * The dashboard's icon set, held to index.html.
 *
 * This exists because the first version of the favicon looked finished and was
 * not. The two <link> tags were right, the PNGs were committed, and all three
 * of the dashboard's hostnames served them — and the tab still came up blank,
 * because /favicon.ico 404'd and a browser that had seen the page before never
 * re-read the head. Nothing about that is visible from a build, a review or a
 * curl of the page. So the list in the head and the files on disk are asserted
 * against each other here, and the .ico is opened and checked to be one.
 *
 * The set is cut by admin/scripts/admin-icons.mjs. Run it after changing the
 * master rather than adding a file by hand.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const publicDir = join(root, 'public');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

/** Every href on an icon link in the head, in the order they are declared. */
const iconHrefs = [...head.matchAll(/<link\s+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
  (tag) => /href="([^"]+)"/.exec(tag[0])?.[1] ?? '',
);

describe('every icon the head names is actually there', () => {
  it('names some', () => {
    expect(iconHrefs.length).toBeGreaterThan(0);
  });

  it.each(['/favicon.ico', '/favicon-16x16.png', '/favicon-32x32.png', '/favicon-48x48.png', '/apple-touch-icon.png'])(
    'declares %s',
    (href) => {
      expect(iconHrefs).toContain(href);
    },
  );

  it('ships a file for each one, at the root of public/ where the href points', () => {
    for (const href of iconHrefs) {
      expect(href.startsWith('/')).toBe(true);
      expect(existsSync(join(publicDir, href.slice(1)))).toBe(true);
    }
  });
});

describe('favicon.ico', () => {
  const ico = existsSync(join(publicDir, 'favicon.ico'))
    ? readFileSync(join(publicDir, 'favicon.ico'))
    : Buffer.alloc(0);

  it('is declared first, because it is the URL a browser falls back to', () => {
    // A tab that has already recorded "no icon" for this origin retries
    // /favicon.ico. Leaving it out is exactly the bug this file was written
    // for, and declaring it last is how a merge would quietly reintroduce it.
    expect(iconHrefs[0]).toBe('/favicon.ico');
  });

  it('is a real ICO container, not a PNG under a misleading name', () => {
    expect(ico.length).toBeGreaterThan(6);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // 1 = icon, 2 would be a cursor
  });

  it('carries the 16, 32 and 48 a tab, a cramped tab and a shortcut ask for', () => {
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16));
    expect([...sizes].sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });

  it('points every entry at data that is inside the file', () => {
    // A hand-assembled container with an offset past the end is a file every
    // tool reports as valid and no browser can draw.
    const count = ico.readUInt16LE(4);
    for (let i = 0; i < count; i++) {
      const size = ico.readUInt32LE(6 + i * 16 + 8);
      const offset = ico.readUInt32LE(6 + i * 16 + 12);
      expect(size).toBeGreaterThan(0);
      expect(offset + size).toBeLessThanOrEqual(ico.length);
      // Each entry holds a PNG rather than a BMP, which is what the cutter writes.
      expect([...ico.subarray(offset, offset + 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

describe('the mark the app draws stays where the app draws it', () => {
  it('keeps robin-admin.png, which LOGO_SRC reads', () => {
    // src/lib/appInfo.ts points the header and the sign-in page at this file.
    // The cutter treats it as the master, so it must survive a re-cut.
    const appInfo = readFileSync(join(root, 'src', 'lib', 'appInfo.ts'), 'utf8');
    const logo = /LOGO_SRC\s*=\s*'([^']+)'/.exec(appInfo);
    expect(logo).not.toBeNull();
    expect(existsSync(join(publicDir, logo![1].slice(1)))).toBe(true);
  });
});

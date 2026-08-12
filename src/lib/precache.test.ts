/**
 * That every file in `public/` has been thought about.
 *
 * Vite copies that folder verbatim and tells no plugin what is in it, so unlike
 * the scripts, whose names the build knows, these have to be listed by hand.
 * A hand-written list drifts. The failure is quiet and one-sided: add an image,
 * forget the list, and the app still works everywhere it is tested, then shows
 * a broken picture to the one person who opened that panel at a court.
 *
 * So the guard is not "is this file cached" but "has somebody decided". Three
 * lists rather than one, and a file in none of them fails the suite.
 *
 * The size test is the other half. Everything precached is downloaded before
 * the app has ever been useful offline, on whatever connection is going at the
 * time, so the list has a budget rather than just a policy.
 */

import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEVER_CACHE } from '../sw';
import { PRECACHED_PUBLIC, RUNTIME_CACHED_PUBLIC, NEVER_CACHED_PUBLIC } from './precache';

const publicDir = resolve(__dirname, '../../public');
// One level of folders is real today (public/instructions). Anything deeper
// should fail this test until somebody makes it a decision here.
const onDisk = readdirSync(publicDir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory()
    ? readdirSync(resolve(publicDir, entry.name)).map((name) => `/${entry.name}/${name}`)
    : [`/${entry.name}`]
);
const listed = [...PRECACHED_PUBLIC, ...RUNTIME_CACHED_PUBLIC, ...NEVER_CACHED_PUBLIC];

describe('the public folder', () => {
  it('has every file accounted for by one of the three lists', () => {
    const unlisted = onDisk.filter((file) => !listed.includes(file));
    expect(unlisted).toEqual([]);
  });

  it('names nothing that is not really there', () => {
    const missing = listed.filter((file) => !onDisk.includes(file));
    expect(missing).toEqual([]);
  });

  it('puts each file in exactly one list', () => {
    const twice = listed.filter((file, i) => listed.indexOf(file) !== i);
    expect(twice).toEqual([]);
  });
});

describe('what gets downloaded before it is needed', () => {
  it('stays inside a budget a phone on one bar can afford', () => {
    const bytes = PRECACHED_PUBLIC.reduce(
      (total, file) => total + statSync(resolve(publicDir, file.slice(1))).size,
      0
    );
    // Roughly 125 KB today, against scripts that come to nearly ten times that.
    // The ceiling is here so a large image cannot be added to the precache
    // without somebody having to raise it on purpose.
    expect(bytes).toBeLessThan(200 * 1024);
  });

  it('leaves the largest file in the folder out of the cache entirely', () => {
    const banner = statSync(resolve(publicDir, 'og-banner.png')).size;
    const largestPrecached = Math.max(
      ...PRECACHED_PUBLIC.map((file) => statSync(resolve(publicDir, file.slice(1))).size)
    );
    expect(banner).toBeGreaterThan(largestPrecached);
    expect(NEVER_CACHED_PUBLIC).toContain('/og-banner.png');
  });
});

describe('the two copies of the never-cache list', () => {
  it('agree with each other', () => {
    // `sw.ts` holds the copy the worker enforces and has to stay free of
    // imports, because the build transpiles it without bundling. This file is
    // read by vite.config.ts under a tsconfig with no DOM library. Importing
    // either way round drags one into the wrong project, so they are written
    // out twice and reconciled here.
    expect([...NEVER_CACHE].sort()).toEqual([...NEVER_CACHED_PUBLIC].sort());
  });
});

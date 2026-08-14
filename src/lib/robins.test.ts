/**
 * @vitest-environment happy-dom
 *
 * The robin in fancy dress at the top of the settings drawer.
 *
 * A joke has to be rare to stay one, so most of what is checked here is when it
 * does *not* happen: the first three opens, and two out of every three after
 * them. The rest is that a costume open never repeats the last costume, which is
 * the one outcome that would read as the feature being broken.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAIN_OPENS,
  PLAIN_ROBIN,
  ROBIN_COSTUMES,
  isCostumeOpen,
  openedSettings,
  pickCostume,
  robinSrc,
} from './robins';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('which opens get a costume', () => {
  it('leaves the first three alone', () => {
    for (let n = 1; n <= PLAIN_OPENS; n++) expect(isCostumeOpen(n)).toBe(false);
  });

  it('then dresses up one open in three', () => {
    const dressed = [];
    for (let n = 1; n <= 20; n++) if (isCostumeOpen(n)) dressed.push(n);
    expect(dressed).toEqual([6, 9, 12, 15, 18]);
  });
});

describe('picking a costume', () => {
  it('never picks the one worn last', () => {
    for (let last = 0; last < ROBIN_COSTUMES.length; last++) {
      for (let i = 0; i < 200; i++) {
        expect(pickCostume(Math.random(), last)).not.toBe(last);
      }
    }
  });

  it('can still reach every other costume', () => {
    // Rolling over the eleven others rather than re-rolling has to leave all
    // eleven reachable, or one of them would never come up again after its
    // neighbour did.
    const reached = new Set<number>();
    for (let i = 0; i < 2000; i++) reached.add(pickCostume(Math.random(), 4));
    expect([...reached].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('reaches all twelve on a device that has never shown one', () => {
    const reached = new Set<number>();
    for (let i = 0; i < 2000; i++) reached.add(pickCostume(Math.random(), -1));
    expect(reached.size).toBe(ROBIN_COSTUMES.length);
  });

  it('stays inside the list at the very top of the range', () => {
    // Math.random() never returns 1, but a roll of 0.999... must not land one
    // past the end and hand back an undefined file name.
    expect(pickCostume(0.999999999, -1)).toBe(ROBIN_COSTUMES.length - 1);
    expect(pickCostume(0.999999999, ROBIN_COSTUMES.length - 1)).toBe(
      ROBIN_COSTUMES.length - 2
    );
    expect(pickCostume(1, 0)).toBeLessThan(ROBIN_COSTUMES.length);
  });

  it('treats a stored index that is no longer a costume as no costume at all', () => {
    // A device that saw a twelve-costume build and then a shorter one.
    expect(pickCostume(0, 99)).toBe(0);
  });
});

describe('the twelve costumes', () => {
  it('each have a file, and the folder holds nothing else', () => {
    const onDisk = readdirSync(resolve(__dirname, '../../public/robins')).sort();
    expect(onDisk).toEqual(ROBIN_COSTUMES.map((c) => `${c}.webp`).sort());
  });

  it('are all different', () => {
    expect(new Set(ROBIN_COSTUMES).size).toBe(ROBIN_COSTUMES.length);
  });
});

describe('opening the drawer', () => {
  it('shows the app icon five times and a costume on the sixth', () => {
    const seen = Array.from({ length: 6 }, () => openedSettings());
    expect(seen.slice(0, 5)).toEqual(Array(5).fill(PLAIN_ROBIN));
    expect(seen[5]).toMatch(/^\/robins\/[a-z]+\.webp$/);
  });

  it('counts opens across a restart, because the count is in storage', () => {
    for (let i = 0; i < 5; i++) openedSettings();
    expect(JSON.parse(window.localStorage.getItem('pb-settings-opens') ?? '0')).toBe(5);
    expect(openedSettings()).not.toBe(PLAIN_ROBIN);
  });

  it('never wears the same costume on two costume opens running', () => {
    // One fixed roll, so anything that did not remember the last costume would
    // hand back the same index every time.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const worn = Array.from({ length: 15 }, () => openedSettings()).filter(
      (src) => src !== PLAIN_ROBIN
    );
    expect(worn.length).toBe(4); // opens 6, 9, 12 and 15
    for (let i = 1; i < worn.length; i++) expect(worn[i]).not.toBe(worn[i - 1]);
  });

  it('only ever hands back a costume it has a name for', () => {
    const known = new Set(ROBIN_COSTUMES.map(robinSrc));
    for (let i = 0; i < 60; i++) {
      const src = openedSettings();
      if (src !== PLAIN_ROBIN) expect(known.has(src)).toBe(true);
    }
  });
});

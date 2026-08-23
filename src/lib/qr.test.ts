/**
 * A URL as a square somebody can point a camera at.
 *
 * There is no QR decoder in this repo, so nothing here can prove a code
 * scans — that is what a real phone is for, and it is in the verification
 * steps. What these tests can do is pin the structure a scanner looks for
 * first: three finder patterns in three corners, at the right size, the right
 * way round. A code with a broken finder pattern is not a code that scans
 * badly, it is one no camera will see at all.
 *
 * The rest is about qrPath, which is ours rather than the encoder's, and is the
 * part that could quietly draw the right squares in the wrong places.
 */
import { describe, it, expect } from 'vitest';
import { qrModules, qrPath, qrSize, QUIET_ZONE, type QrModules } from './qr';

const LINK = 'https://app.roundrobinator.com/?s=K7M2QXV9TB';

/**
 * The 7x7 block in a corner of every QR code: a solid ring, a light ring
 * inside it, and a 3x3 solid centre. A camera finds the code by looking for
 * three of these, so this is the one piece of the drawing that has to be right
 * before anything else matters.
 */
function isFinderPattern(modules: QrModules, top: number, left: number): boolean {
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const onOuterRing = row === 0 || row === 6 || col === 0 || col === 6;
      const inCentre = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      const expected = onOuterRing || inCentre;
      if (modules[top + row][left + col] !== expected) return false;
    }
  }
  return true;
}

describe('encoding a link', () => {
  it('is a square', async () => {
    const modules = await qrModules(LINK);
    expect(modules.length).toBeGreaterThan(20);
    for (const line of modules) expect(line).toHaveLength(modules.length);
  });

  it('puts a finder pattern in three corners and not the fourth', async () => {
    // Three, never four. The missing one is how a scanner works out which way
    // up the code is.
    const modules = await qrModules(LINK);
    const last = modules.length - 7;
    expect(isFinderPattern(modules, 0, 0)).toBe(true);
    expect(isFinderPattern(modules, 0, last)).toBe(true);
    expect(isFinderPattern(modules, last, 0)).toBe(true);
    expect(isFinderPattern(modules, last, last)).toBe(false);
  });

  it('gives the same square for the same link', async () => {
    // The QR standard picks a mask by scoring eight of them, so an encoder with
    // any wobble in it would show up here rather than at a court.
    const first = await qrModules(LINK);
    const second = await qrModules(LINK);
    expect(second).toEqual(first);
  });

  it('gives a different square for a different link', async () => {
    const one = await qrModules(LINK);
    const other = await qrModules('https://app.roundrobinator.com/?s=ZZZZZZZZZZ');
    expect(other).not.toEqual(one);
  });

  it('stays small enough to read across a table', async () => {
    // A share link is about forty characters. If this ever jumps past 45
    // modules the code has grown a version and the printed square needs to grow
    // with it, which is worth being told about.
    const modules = await qrModules(LINK);
    expect(modules.length).toBeLessThanOrEqual(45);
  });
});

describe('drawing it', () => {
  it('leaves the quiet zone a camera needs to find the edges', async () => {
    const modules = await qrModules(LINK);
    expect(qrSize(modules)).toBe(modules.length + 2 * QUIET_ZONE);
    expect(QUIET_ZONE).toBe(4);
  });

  it('draws a run of dark modules as one rectangle', () => {
    // Not one per module. Adjacent rects can leave a hairline where a renderer
    // rounds their edges apart, and a hairline through a finder pattern scans
    // on one phone and not the next.
    const modules = [
      [true, true, false],
      [false, true, false],
      [true, false, true]
    ];
    expect(qrPath(modules, 0)).toBe('M0 0h2v1h-2zM1 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1z');
  });

  it('offsets every module by the quiet zone', () => {
    expect(qrPath([[true]], 4)).toBe('M4 4h1v1h-1z');
  });

  it('draws nothing for a square with nothing dark in it', () => {
    expect(qrPath([[false, false], [false, false]], 0)).toBe('');
  });

  it('draws one rectangle per run, however long', () => {
    const wide = [[true, true, true, true, true]];
    expect(qrPath(wide, 0)).toBe('M0 0h5v1h-5z');
  });
});

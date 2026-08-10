/**
 * The logo in the PDF is a copy, and a copy can go stale.
 *
 * `src/lib/logoImage.ts` is generated from `public/logo.png`. The browser
 * prints the PNG straight from the page, so replacing the logo fixes the
 * desktop sheet immediately and leaves the shared PDF quietly printing the old
 * one. Nothing would fail, which is why this exists: it compares the hash the
 * generator recorded against the file on disk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { LOGO_IMAGE } from './logoImage';

const SOURCE = new URL('../../public/logo.png', import.meta.url);

describe('the logo baked into the PDF', () => {
  it('was generated from the logo that ships today', () => {
    const sha = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
    expect(
      sha === LOGO_IMAGE.sourceSha256
        ? 'up to date'
        : 'public/logo.png has changed: run node scripts/logo-pdf-asset.mjs'
    ).toBe('up to date');
  });

  it('decodes to as many samples as its size claims', () => {
    // A truncated paste would still be valid base64 and would still draw, just
    // with the bottom of the bird missing.
    const inflate = (base64: string) => Buffer.from(base64, 'base64');
    expect(inflate(LOGO_IMAGE.rgb).length).toBeGreaterThan(1000);
    expect(inflate(LOGO_IMAGE.alpha).length).toBeGreaterThan(100);

    expect(inflateSync(inflate(LOGO_IMAGE.rgb)).length).toBe(
      LOGO_IMAGE.width * LOGO_IMAGE.height * 3
    );
    expect(inflateSync(inflate(LOGO_IMAGE.alpha)).length).toBe(
      LOGO_IMAGE.width * LOGO_IMAGE.height
    );
  });

  it('is mostly opaque in the middle and clear at the corner', () => {
    // Proves the alpha channel is the logo's own and not a blank slab, which
    // would print the white square the logo was cut out of.
    const alpha = inflateSync(Buffer.from(LOGO_IMAGE.alpha, 'base64'));
    const at = (x: number, y: number) => alpha[y * LOGO_IMAGE.width + x];
    expect(at(LOGO_IMAGE.width >> 1, LOGO_IMAGE.height >> 1)).toBeGreaterThan(200);
    expect(at(0, 0)).toBeLessThan(40);
  });
});

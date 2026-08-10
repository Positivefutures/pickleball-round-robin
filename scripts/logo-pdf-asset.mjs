/**
 * Turns public/logo.png into the bytes the PDF writer can embed.
 *
 * The shared PDF is built in the browser, on the tap, with nothing awaited
 * before the share sheet is asked for. So the logo cannot be fetched and
 * decoded at print time: it has to already be in the bundle, in a shape a PDF
 * image object takes directly. That means raw samples, deflated, which is what
 * this writes into src/lib/logoImage.ts.
 *
 * Run it after changing the logo:
 *
 *   node scripts/logo-pdf-asset.mjs
 *
 * src/lib/logoImage.test.ts fails if the logo changes and this is not re-run,
 * so a stale copy cannot be printed for months without anyone noticing.
 *
 * Deliberately dependency free: Node can already inflate, and the file is a
 * plain non-interlaced 8-bit palette PNG, which is a short decoder.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public', 'logo.png');
const TARGET = join(ROOT, 'src', 'lib', 'logoImage.ts');

/**
 * 96 across is about 230dpi at the size it prints, and costs 9KB in the bundle.
 * 128 was 4KB more for detail nobody can see on a schedule sheet.
 */
const TARGET_WIDTH = 96;

function chunks(png) {
  const found = { IDAT: [] };
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IDAT') found.IDAT.push(body);
    else found[type] = body;
    at += 12 + length;
  }
  return found;
}

/** Undoes the per-scanline filter. One byte per pixel, so bpp is 1. */
function unfilter(raw, width, height) {
  const out = Buffer.alloc(width * height);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[at];
    at += 1;
    const line = out.subarray(y * width, (y + 1) * width);
    const prior = y > 0 ? out.subarray((y - 1) * width, y * width) : Buffer.alloc(width);
    for (let x = 0; x < width; x += 1) {
      const value = raw[at + x];
      const a = x > 0 ? line[x - 1] : 0;
      const b = prior[x];
      const c = x > 0 ? prior[x - 1] : 0;
      let recon;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + a; break;
        case 2: recon = value + b; break;
        case 3: recon = value + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          recon = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      line[x] = recon & 0xff;
    }
    at += width;
  }
  return out;
}

/**
 * Box average down to the target width.
 *
 * Colour is averaged weighted by alpha, or the transparent pixels outside the
 * ring would drag their own colour into the edge and leave a halo.
 */
function downscale(rgb, alpha, width, height, outWidth) {
  const outHeight = Math.max(1, Math.round((height * outWidth) / width));
  const outRgb = Buffer.alloc(outWidth * outHeight * 3);
  const outAlpha = Buffer.alloc(outWidth * outHeight);

  for (let oy = 0; oy < outHeight; oy += 1) {
    const y0 = Math.floor((oy * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * height) / outHeight));
    for (let ox = 0; ox < outWidth; ox += 1) {
      const x0 = Math.floor((ox * width) / outWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * width) / outWidth));

      let r = 0, g = 0, b = 0, a = 0, weight = 0, count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = y * width + x;
          const w = alpha[i] / 255;
          r += rgb[i * 3] * w;
          g += rgb[i * 3 + 1] * w;
          b += rgb[i * 3 + 2] * w;
          a += alpha[i];
          weight += w;
          count += 1;
        }
      }
      const o = oy * outWidth + ox;
      const divisor = weight > 0 ? weight : 1;
      outRgb[o * 3] = Math.round(r / divisor);
      outRgb[o * 3 + 1] = Math.round(g / divisor);
      outRgb[o * 3 + 2] = Math.round(b / divisor);
      outAlpha[o] = Math.round(a / count);
    }
  }
  return { rgb: outRgb, alpha: outAlpha, width: outWidth, height: outHeight };
}

const png = readFileSync(SOURCE);
const parts = chunks(png);
const width = parts.IHDR.readUInt32BE(0);
const height = parts.IHDR.readUInt32BE(4);
const depth = parts.IHDR[8];
const colorType = parts.IHDR[9];
const interlace = parts.IHDR[12];

if (depth !== 8 || colorType !== 3 || interlace !== 0) {
  throw new Error(
    `logo.png is ${depth}-bit colour type ${colorType} interlace ${interlace}; ` +
      'this script only reads 8-bit non-interlaced palette PNGs'
  );
}

const indexes = unfilter(inflateSync(Buffer.concat(parts.IDAT)), width, height);
const palette = parts.PLTE;
const trns = parts.tRNS ?? Buffer.alloc(0);

const rgb = Buffer.alloc(width * height * 3);
const alpha = Buffer.alloc(width * height, 255);
for (let i = 0; i < indexes.length; i += 1) {
  const p = indexes[i];
  rgb[i * 3] = palette[p * 3];
  rgb[i * 3 + 1] = palette[p * 3 + 1];
  rgb[i * 3 + 2] = palette[p * 3 + 2];
  if (p < trns.length) alpha[i] = trns[p];
}

// Plain deflate, no PDF /Predictor. PNG-style row filters were tried and lost
// by a fifth: averaging flat artwork down leaves neighbouring pixels nearly
// equal but not equal, and differencing turns that into noise.
const small = downscale(rgb, alpha, width, height, TARGET_WIDTH);
const rgbZ = deflateSync(small.rgb, { level: 9 });
const alphaZ = deflateSync(small.alpha, { level: 9 });
const sha = createHash('sha256').update(png).digest('hex');

/** Split across lines as concatenated literals, so the file is not one huge row. */
const wrap = (base64) =>
  (base64.match(/.{1,96}/g) ?? []).map((part) => `'${part}'`).join(' +\n    ');

writeFileSync(
  TARGET,
  `/**
 * The logo, ready to drop into a PDF. Generated — do not edit by hand.
 *
 * Run \`node scripts/logo-pdf-asset.mjs\` after changing public/logo.png, which
 * is what \`sourceSha256\` below is taken from. logoImage.test.ts compares that
 * hash against the file on disk, so the two cannot drift apart in silence.
 *
 * Two deflate streams, base64'd: the colour samples, and the alpha channel that
 * becomes the image's /SMask. Raw samples rather than the PNG itself because a
 * PDF reader cannot open a PNG, and decoding one in the browser would mean
 * awaiting before the share sheet is asked for, which iOS does not allow.
 */
export const LOGO_IMAGE = {
  width: ${small.width},
  height: ${small.height},
  /** Deflated ${small.width * small.height * 3} bytes of 8-bit RGB. */
  rgb:
    ${wrap(rgbZ.toString('base64'))},
  /** Deflated ${small.width * small.height} bytes of 8-bit grey, the alpha channel. */
  alpha:
    ${wrap(alphaZ.toString('base64'))},
  /** sha256 of public/logo.png when this was generated. */
  sourceSha256: '${sha}',
} as const;
`
);

console.log(`${width}x${height} -> ${small.width}x${small.height}`);
console.log(`  rgb   ${small.rgb.length} -> ${rgbZ.length} bytes deflated`);
console.log(`  alpha ${small.alpha.length} -> ${alphaZ.length} bytes deflated`);
console.log(`  module ${readFileSync(TARGET).length} bytes`);

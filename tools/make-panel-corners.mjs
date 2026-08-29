/**
 * The panel's corner artwork, cut from the app's own header images.
 *
 * The share panel needs the banner's orange wedge in a corner, and the banner
 * bakes the robin badge on top of that wedge — measured: the wedge runs to
 * y=128 at the left edge, the badge starts at y=76. They overlap, so no crop
 * keeps one and drops the other, and cropping anyway is what put a flat cream
 * rectangle across the artwork.
 *
 * So the badge is taken out instead. Its disc is filled with the cream the
 * image already sits on, then the wedge is repainted over the part of that disc
 * that was orange to begin with. Everywhere else the original pixels are
 * untouched, which is why the halftone dots survive.
 *
 * The result keeps its own cream margin, so the panel can simply put it in a
 * corner: the image's background and the panel's are the same colour and there
 * is no edge to see.
 */
import { writeFileSync } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/jeffbaker/Developer/pickleball-round-robin';
const { chromium } = await import(pathToFileURL(join(ROOT, 'node_modules/playwright-core/index.mjs')));

function findChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      for (const a of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium',
                       'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
                       'chrome-mac/headless_shell']) {
        const p = join(cache, d, a);
        if (existsSync(p)) return p;
      }
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(join(ROOT, 'public/header-left.png')).href);

const out = await page.evaluate(async () => {
  const img = document.querySelector('img');
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const CREAM = 'rgb(251, 250, 246)';
  const ORANGE = 'rgb(254, 77, 1)';

  // The badge, measured rather than eyeballed: dark ring bounding box was
  // 40..141 x 76..179, so centre (90.5, 127.5) and an outer radius of ~51.
  // 68 clears the white ring and the soft shadow under it.
  const CX = 90.5, CY = 127.5, R = 68;

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.restore();

  // The wedge back over it. Its hypotenuse runs from (157, 0) to (0, 128) —
  // fitted to the columns sampled off the source, ignoring x=100 where the
  // robin's own orange breast sits inside the badge and lies about the edge.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(157, 0);
  ctx.lineTo(0, 128);
  ctx.closePath();
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.restore();

  /**
   * Two pieces out of the repaired image, and both cut where it is already
   * cream so the panel never sees an edge.
   *
   * The wedge stops at y=180: below it the repair is plain cream, and the
   * banner's teal halftone starts at ~185 — which belongs in the opposite
   * corner, not running under the subtitle.
   *
   * The dots start at y=196, which is the first row clear of the badge. Cutting
   * at 180 caught the bottom of its white ring, and flipped into the far corner
   * that arrived as a white arc floating in the cream.
   */
  const cut = (sx, sy, sw, sh) => {
    const p = document.createElement('canvas');
    p.width = sw; p.height = sh;
    p.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    return p.toDataURL('image/png');
  };

  return { corner: cut(0, 0, W, 180), dots: cut(0, 196, 180, H - 196) };
});

writeFileSync(join(ROOT, 'public/panel-corner.png'),
  Buffer.from(out.corner.split(',')[1], 'base64'));
console.log('wrote public/panel-corner.png');
writeFileSync(join(ROOT, 'public/panel-dots.png'),
  Buffer.from(out.dots.split(',')[1], 'base64'));
console.log('wrote public/panel-dots.png');

/**
 * And the court, which has the same fault in miniature.
 *
 * It is cream across 81.8% of its top edge and 98% of its left, so those two
 * sides disappear into the panel — but the last 18.2% of the top edge is the
 * court's own far corner in solid teal, and against cream that is a straight
 * horizontal line sitting in the middle of the panel. The same cut-out-rectangle
 * look, just shorter.
 *
 * So the cream is carried over that corner, which trims the court along a line
 * that leaves through the right edge instead of the top. Every edge of this
 * image that falls inside the panel is now cream; the two that are not are the
 * two it is anchored to. The ball starts 54% down and is nowhere near it.
 */
await page.goto(pathToFileURL(join(ROOT, 'public/header-right.jpg')).href);

const court = await page.evaluate(async () => {
  const img = document.querySelector('img');
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Cream measured off this image's own top-left corner, not assumed.
  ctx.fillStyle = 'rgb(251, 250, 246)';
  ctx.beginPath();
  ctx.moveTo(288, 0);   // where the court's diagonal leaves the top edge
  ctx.lineTo(W, 0);
  ctx.lineTo(W, 34);    // and where it leaves the right edge instead
  ctx.closePath();
  ctx.fill();

  return c.toDataURL('image/png');
});

writeFileSync(join(ROOT, 'public/panel-court.png'),
  Buffer.from(court.split(',')[1], 'base64'));
console.log('wrote public/panel-court.png');

await browser.close();

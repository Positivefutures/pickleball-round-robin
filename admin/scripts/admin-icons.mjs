// Cuts the dashboard's whole icon set from one master, and writes it into
// admin/public/. Run it from anywhere:
//
//     node admin/scripts/admin-icons.mjs
//
// The master is `admin/public/robin-admin.png`, the 256 the header and the
// sign-in page already draw through `LOGO_SRC`. It is the robin in a collar
// and tie with a calculator, and its corners are transparent because the mark
// is a circle. Keep it the master: everything below is cut from it, so a new
// drawing only has to land in one place.
//
// `sharp` is a devDependency of the *main* app, not of `admin`. Node resolution
// walks up out of admin/ and finds it in the repo root's node_modules, which is
// why this works with nothing installed under admin/. That is fine for a script
// that is run by hand and never bundled — the rule admin/ must not break is
// importing from `src/`, and this imports nothing from there.
//
// Why an .ico when there are already PNGs: a browser that has previously
// recorded "this site has no icon" retries `/favicon.ico`, and so does every
// consumer that will not parse HTML to find a <link>. Yesterday's version
// declared PNGs only, so that URL 404'd on all three of the dashboard's
// hostnames. See admin/src/lib/favicon.test.ts, which holds index.html and this
// folder to each other.

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const master = join(publicDir, 'robin-admin.png');

/** The three sizes that go inside favicon.ico. 32 is what a tab draws; 16 is
 *  what a cramped one falls back to; 48 is what Windows uses on a shortcut. */
const ICO_SIZES = [16, 32, 48];

/** A cut made at the size it is drawn at beats one the browser makes on the
 *  way past, so every size ships as its own file as well. */
const PNG_SIZES = [16, 32, 48];

/** iOS ignores the alpha channel on a home-screen icon and composites what is
 *  left onto black, which would put a black ring around a circular mark. So
 *  this one is flattened onto white first. 180 is the size iOS asks for. */
const APPLE_SIZE = 180;

const png = (size, background) => {
  const pipeline = sharp(master).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  return (background ? pipeline.flatten({ background }) : pipeline)
    .png({ compressionLevel: 9 })
    .toBuffer();
};

/** Wraps PNG buffers in an ICO container. An .ico entry may hold a PNG rather
 *  than a bitmap, and every browser back to IE11 reads that, so there is no
 *  need to encode BMP by hand. Header is 6 bytes, then 16 per entry, then the
 *  image data end to end. A width byte of 0 would mean 256; none of these are. */
const ico = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt8(0, 2); // palette colours: 0, it is truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
};

await readFile(master); // fail loudly and early if the master has moved

const icoImages = [];
for (const size of ICO_SIZES) icoImages.push({ size, data: await png(size) });
await writeFile(join(publicDir, 'favicon.ico'), ico(icoImages));

for (const size of PNG_SIZES) {
  await writeFile(join(publicDir, `favicon-${size}x${size}.png`), await png(size));
}

await writeFile(
  join(publicDir, 'apple-touch-icon.png'),
  await png(APPLE_SIZE, { r: 255, g: 255, b: 255 }),
);

// `robin-admin-32.png` was the first attempt at this and `favicon-32x32.png`
// is the same cut under the name the rest of the set uses. Removing it here
// keeps a second copy from drifting away from the master.
await unlink(join(publicDir, 'robin-admin-32.png')).catch(() => {});

console.log(`Wrote favicon.ico (${ICO_SIZES.join(', ')}), favicon-NxN.png and apple-touch-icon.png`);

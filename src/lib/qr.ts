/**
 * A URL as a square somebody can point a camera at.
 *
 * The encoder is qrcode-generator: MIT, no dependencies of its own, and one
 * file. That is a different trade from the one vite.config.ts refuses for the
 * service worker, which was 267 packages. Reed-Solomon and mask selection could
 * be written here in the tradition of pdf.ts, but a QR code that looks right and
 * will not scan is a failure with nothing in this repo able to catch it, and a
 * camera at a court is not a good place to find out.
 *
 * It is imported dynamically, the way the Supabase client is, so it is a chunk
 * that only a host who taps Share ever downloads. Everybody watching a session
 * gets the link and never the encoder.
 */

/** Dark and light, row by row, as the encoder laid them out. */
export type QrModules = boolean[][];

/**
 * The white border a camera needs to find the edges. Four modules is what the
 * specification asks for. It is drawn here rather than left to the page's own
 * white space, so the square is still scannable when somebody screenshots it.
 */
export const QUIET_ZONE = 4;

/**
 * Level Q corrects a quarter of the code, against L's seven percent.
 *
 * The link is about forty characters, so even at this level the square is only
 * around thirty modules across, and the extra tolerance is what carries a phone
 * held at an angle across a table in a sports hall with one working light.
 */
const CORRECTION = 'Q';

export async function qrModules(text: string): Promise<QrModules> {
  const { default: qrcode } = await import('qrcode-generator');
  // 0 is "pick the smallest version this will fit in".
  const code = qrcode(0, CORRECTION);
  code.addData(text);
  code.make();

  const count = code.getModuleCount();
  const modules: QrModules = [];
  for (let row = 0; row < count; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < count; col++) line.push(code.isDark(row, col));
    modules.push(line);
  }
  return modules;
}

/** The side of the square in modules, quiet zone included. */
export function qrSize(modules: QrModules, margin = QUIET_ZONE): number {
  return modules.length + margin * 2;
}

/**
 * Every dark module as one path, so the square is a single element rather than
 * nine hundred rects.
 *
 * Runs of dark modules along a row are drawn as one wide rectangle. That is not
 * only smaller: adjacent rects in SVG can leave hairline gaps between them
 * where a renderer rounds their edges differently, and a hairline through a
 * finder pattern is the sort of thing that scans on one phone and not another.
 */
export function qrPath(modules: QrModules, margin = QUIET_ZONE): string {
  const parts: string[] = [];

  modules.forEach((line, row) => {
    let col = 0;
    while (col < line.length) {
      if (!line[col]) {
        col += 1;
        continue;
      }
      let run = 0;
      while (col + run < line.length && line[col + run]) run += 1;
      parts.push(`M${col + margin} ${row + margin}h${run}v1h-${run}z`);
      col += run;
    }
  });

  return parts.join('');
}

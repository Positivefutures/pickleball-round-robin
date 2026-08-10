/**
 * A very small PDF writer, enough for a schedule and nothing more.
 *
 * It exists because an installed iOS app cannot print. WebKit only ever hosted
 * the print dialog in Safari's own UI, so `window.print()` from a home-screen
 * app does nothing at all — no dialog, no error, no way for the app to tell.
 * The way out is the OS share sheet, which is not browser UI and so still
 * works, and which offers Print for a PDF. That means the app has to produce a
 * real PDF itself.
 *
 * Hand written rather than pulled from a library on purpose. The smallest
 * capable package on npm is around a third of a megabyte, which is a lot to
 * download at a court to print eight rounds, and this file needs about two
 * hundred lines. A schedule is text, ruled lines and one logo. Nothing here
 * supports embedded fonts or vector artwork, and nothing here should grow to.
 *
 * The one real constraint is the font. Every PDF reader is required to have the
 * fourteen standard fonts built in, so using Helvetica means shipping no font
 * data. The price is that the widths have to be known here instead, because
 * wrapping a line of names means measuring it before it is drawn.
 */

import { LOGO_IMAGE } from './logoImage';

export type PdfFont = 'regular' | 'bold';

export interface PdfText {
  kind: 'text';
  /** From the top left of the page, in points, like CSS rather than like PDF. */
  x: number;
  y: number;
  text: string;
  size: number;
  font: PdfFont;
  /** `#rrggbb`, so the round badges can reuse ROUND_TYPE_META.printColor. */
  color?: string;
}

export interface PdfLine {
  kind: 'line';
  x: number;
  y: number;
  length: number;
  width: number;
  color?: string;
}

/**
 * The logo, and only the logo. There is one image in the whole document, so it
 * needs no identity: saying `kind: 'image'` is saying which one.
 */
export interface PdfImage {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PdfOp = PdfText | PdfLine | PdfImage;

/** US Letter, in points. Chosen over A4 because the audience is American. */
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

// --------------------------------------------------------------- the font --

/**
 * Adobe's published widths for the two Helvetica faces, in 1/1000 em, read out
 * of the AFM metrics rather than typed from memory.
 *
 * Three runs each: the ASCII range, the band WinAnsi fills with punctuation
 * Latin-1 has no room for, and the top half, which is Latin-1 from 160 up. The
 * middle run is easy to forget and expensive to forget, because the curly
 * apostrophe lives there and a phone keyboard types it by default. Left out, a
 * name like O’Brien measures as narrower than it is and the column runs over.
 */
const ASCII_REGULAR =
  '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 ' +
  '556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 ' +
  '722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 ' +
  '556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 ' +
  '260 334 584';

const MID_REGULAR =
  '556 0 222 556 333 1000 556 556 333 1000 667 333 1000 0 611 0 0 222 222 333 333 350 556 1000 ' +
  '333 1000 500 333 944 0 500 667';

const MID_BOLD =
  '556 0 278 556 500 1000 556 556 333 1000 667 333 1000 0 611 0 0 278 278 500 500 350 556 1000 ' +
  '333 1000 556 333 944 0 500 667';

const HIGH_REGULAR =
  '278 333 556 556 556 556 260 556 333 737 370 556 584 333 737 333 400 584 333 333 333 556 537 ' +
  '278 333 333 365 556 834 834 834 611 667 667 667 667 667 667 1000 722 667 667 667 667 278 278 ' +
  '278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 ' +
  '556 889 500 556 556 556 556 278 278 278 278 556 556 556 556 556 556 556 584 611 556 556 556 ' +
  '556 500 556 500';

const ASCII_BOLD =
  '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 ' +
  '556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 ' +
  '722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 ' +
  '556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 ' +
  '280 389 584';

const HIGH_BOLD =
  '278 333 556 556 556 556 280 556 333 737 370 556 584 333 737 333 400 584 333 333 333 611 556 ' +
  '278 333 333 365 556 834 834 834 611 722 722 722 722 722 722 1000 722 667 667 667 667 278 278 ' +
  '278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 ' +
  '556 889 556 556 556 556 556 278 278 278 278 611 611 611 611 611 611 611 584 611 611 611 611 ' +
  '611 556 611 556';

function widthTable(ascii: string, mid: string, high: string): Uint16Array {
  const table = new Uint16Array(256);
  ascii.split(' ').forEach((w, i) => (table[32 + i] = Number(w)));
  mid.split(' ').forEach((w, i) => (table[128 + i] = Number(w)));
  high.split(' ').forEach((w, i) => (table[160 + i] = Number(w)));
  return table;
}

const WIDTHS: Record<PdfFont, Uint16Array> = {
  regular: widthTable(ASCII_REGULAR, MID_REGULAR, HIGH_REGULAR),
  bold: widthTable(ASCII_BOLD, MID_BOLD, HIGH_BOLD),
};

/**
 * The characters WinAnsi puts in 128-159, where it parts company with Latin-1.
 *
 * Only the ones a name or a round heading can realistically contain. The curly
 * apostrophe is the one that matters: phone keyboards produce it by default, so
 * "O’Brien" arrives with it far more often than not.
 */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133,
  0x2020: 134, 0x2021: 135, 0x02c6: 136, 0x2030: 137, 0x0160: 138,
  0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146,
  0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151,
  0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155, 0x0153: 156,
  0x017e: 158, 0x0178: 159,
};

/** Stands in for anything Helvetica cannot spell, so a name is never dropped. */
const SUBSTITUTE = 0x3f; // '?'

/**
 * One character as the byte WinAnsi encodes it with.
 *
 * Deliberately lossy at the edges. A name in a script Helvetica has no glyphs
 * for cannot be printed by this file whatever it does, and a row of question
 * marks at least keeps the court and the partner readable.
 */
export function winAnsiByte(codePoint: number): number {
  if (codePoint >= 32 && codePoint <= 126) return codePoint;
  if (codePoint >= 160 && codePoint <= 255) return codePoint;
  return WIN_ANSI_HIGH[codePoint] ?? SUBSTITUTE;
}

/** How wide a string is when set in `font` at `size`, in points. */
export function widthOf(text: string, size: number, font: PdfFont): number {
  const table = WIDTHS[font];
  let total = 0;
  for (const ch of text) total += table[winAnsiByte(ch.codePointAt(0) ?? SUBSTITUTE)];
  return (total * size) / 1000;
}

/**
 * Breaks `text` into lines that each fit `maxWidth`.
 *
 * Splits on spaces, and only on spaces. A team reads "Ava & Ben", so the break
 * lands either side of the ampersand and never inside a name. A single word too
 * long for the column is left over-long rather than cut, because a truncated
 * name on a court sheet is worse than an untidy one.
 */
export function wrapText(text: string, maxWidth: number, size: number, font: PdfFont): string[] {
  const words = text.split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (widthOf(candidate, size, font) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

// ------------------------------------------------------------- the writer --

/** The resource name the logo is drawn by. Only ever one, so only ever this. */
const IMAGE_NAME = 'Im0';

/**
 * Decodes one of the base64 streams in `logoImage.ts` to the latin-1 string the
 * file is assembled as. `atob` gives back exactly that: one character per byte.
 */
function imageBytes(base64: string): string {
  return atob(base64);
}

/** Trims the float noise that would otherwise triple the size of the file. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function color(hex: string | undefined): [number, number, number] {
  if (!hex) return [0, 0, 0];
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * A PDF string literal. The three escapes are required by the format; control
 * characters are dropped because there is no way to draw one.
 */
function literal(text: string): string {
  let out = '';
  for (const ch of text) {
    const byte = winAnsiByte(ch.codePointAt(0) ?? SUBSTITUTE);
    if (byte < 32) continue;
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += '\\';
    out += String.fromCharCode(byte);
  }
  return `(${out})`;
}

/** One page's drawing operations as a content stream. */
function contentStream(ops: PdfOp[]): string {
  const parts: string[] = [];
  for (const op of ops) {
    if (op.kind === 'image') {
      // An image is drawn into the unit square, so the matrix that places it is
      // also the one that sizes it. q and Q keep that scaling off everything
      // drawn afterwards.
      const y = PAGE_HEIGHT - op.y - op.height;
      parts.push(
        'q',
        `${num(op.width)} 0 0 ${num(op.height)} ${num(op.x)} ${num(y)} cm`,
        `/${IMAGE_NAME} Do`,
        'Q'
      );
      continue;
    }
    const [r, g, b] = color(op.color);
    if (op.kind === 'text') {
      // PDF measures up from the bottom left, the page is described from the
      // top left, and text sits on its baseline. Both are corrected here so
      // that no caller has to think about either.
      const y = PAGE_HEIGHT - op.y - op.size;
      parts.push(
        `${num(r)} ${num(g)} ${num(b)} rg`,
        'BT',
        `/${op.font === 'bold' ? 'F2' : 'F1'} ${num(op.size)} Tf`,
        `1 0 0 1 ${num(op.x)} ${num(y)} Tm`,
        `${literal(op.text)} Tj`,
        'ET'
      );
    } else {
      const y = PAGE_HEIGHT - op.y;
      parts.push(
        `${num(r)} ${num(g)} ${num(b)} RG`,
        `${num(op.width)} w`,
        `${num(op.x)} ${num(y)} m`,
        `${num(op.x + op.length)} ${num(y)} l`,
        'S'
      );
    }
  }
  return parts.join('\n');
}

/**
 * Assembles the finished file.
 *
 * Every byte offset in the cross-reference table has to be exact or the reader
 * rejects the file, which is why this is built as a latin-1 string and only
 * turned into bytes at the very end: in latin-1 one character is one byte, so
 * `length` is the offset and there is nothing to keep in step.
 */
export function buildPdf(pages: PdfOp[][], title: string): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  /** Object numbers are 1-based, and `n` is fixed the moment it is handed out. */
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // Reserved first so the page objects can name their parent before it exists.
  const catalogNo = add('');
  const pagesNo = add('');

  const fontRegular = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  );
  const fontBold = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  );

  // Written only when something draws it, so a document with no logo carries no
  // six kilobytes of it. The alpha channel goes in as a separate greyscale
  // image named by /SMask, which is how PDF spells transparency.
  let imageNo = 0;
  if (pages.some((ops) => ops.some((op) => op.kind === 'image'))) {
    const { width, height } = LOGO_IMAGE;
    const alpha = imageBytes(LOGO_IMAGE.alpha);
    const alphaNo = add(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${alpha.length} >>\nstream\n${alpha}\nendstream`
    );
    const rgb = imageBytes(LOGO_IMAGE.rgb);
    imageNo = add(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/SMask ${alphaNo} 0 R /Length ${rgb.length} >>\nstream\n${rgb}\nendstream`
    );
  }
  const xobjects = imageNo
    ? ` /XObject << /${IMAGE_NAME} ${imageNo} 0 R >>`
    : '';

  const pageNos: number[] = [];
  for (const ops of pages) {
    const stream = contentStream(ops);
    const streamNo = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageNos.push(
      add(
        `<< /Type /Page /Parent ${pagesNo} 0 R ` +
          `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >>${xobjects} >> ` +
          `/Contents ${streamNo} 0 R >>`
      )
    );
  }

  objects[catalogNo - 1] = `<< /Type /Catalog /Pages ${pagesNo} 0 R >>`;
  objects[pagesNo - 1] =
    `<< /Type /Pages /Kids [${pageNos.map((n) => `${n} 0 R`).join(' ')}] ` +
    `/Count ${pageNos.length} >>`;

  // The title shows as the document name in a viewer, and as the suggested
  // file name when the share sheet saves it.
  const infoNo = add(`<< /Title ${literal(title)} /Producer ${literal(title)} >>`);

  let file = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`;
  file +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i += 1) {
    const code = file.charCodeAt(i);
    // Would mean a character escaped `literal`, and would put every offset
    // after it out by one. Better to fail here than to emit a broken file.
    if (code > 255) throw new Error(`non-latin1 byte at ${i}`);
    bytes[i] = code;
  }
  return bytes;
}

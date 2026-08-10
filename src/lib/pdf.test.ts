/**
 * The PDF writer.
 *
 * Two things here are worth more than the rest. The widths, because every line
 * break in the document is decided by them and a wrong number is invisible
 * until a name runs off the edge of a column. And the cross-reference table,
 * because a byte offset that is out by one makes the whole file unopenable, and
 * the reader that rejects it will be on somebody's phone rather than here.
 */
import { describe, it, expect } from 'vitest';
import { buildPdf, widthOf, wrapText, winAnsiByte, PAGE_WIDTH, type PdfOp } from './pdf';

/** The file as text. Latin-1 because that is what it was assembled as. */
function asText(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

function text(x: number, y: number, body: string): PdfOp {
  return { kind: 'text', x, y, text: body, size: 12, font: 'regular' };
}

describe('measuring Helvetica', () => {
  // Adobe's published widths, in 1/1000 em. At 1000pt one em is one point per
  // unit, so the number below is the table entry itself.
  it('agrees with the published width of a letter', () => {
    expect(widthOf('M', 1000, 'regular')).toBe(833);
    expect(widthOf('i', 1000, 'regular')).toBe(222);
    expect(widthOf('W', 1000, 'regular')).toBe(944);
    expect(widthOf(' ', 1000, 'regular')).toBe(278);
  });

  it('knows the bold face is a different face', () => {
    expect(widthOf('i', 1000, 'bold')).toBe(278);
    expect(widthOf('f', 1000, 'bold')).toBe(333);
    // A shared value, which is why the two above are checked as well: an
    // implementation that returned the regular table would still pass on 'M'.
    expect(widthOf('M', 1000, 'bold')).toBe(833);
  });

  it('scales with the point size', () => {
    expect(widthOf('MM', 10, 'regular')).toBeCloseTo(16.66, 5);
  });

  it('measures the apostrophe a phone actually types', () => {
    // Not the ASCII one. A keyboard produces U+2019 by default, so this is the
    // character "O’Brien" really contains.
    expect(widthOf('’', 1000, 'regular')).toBe(222);
    expect(widthOf("'", 1000, 'regular')).toBe(191);
  });

  it('gives an unspellable character the width of what will be drawn', () => {
    // Helvetica has no glyph, so a question mark is substituted. The measure
    // has to agree with that or the line would be wrapped against a width the
    // page never uses.
    expect(winAnsiByte('漢'.codePointAt(0)!)).toBe(0x3f);
    expect(widthOf('漢', 1000, 'regular')).toBe(widthOf('?', 1000, 'regular'));
  });

  it('has a width for every character it is willing to draw', () => {
    // The table is written as three runs of numbers, and a run left out is
    // silently a row of zeroes: names still print, but they are measured as
    // narrower than they are and wrapping quietly stops working.
    //
    // Measured through the character rather than through the byte, which is
    // the whole point. Asking for the width of String.fromCharCode(146) walks
    // the substitution path and answers about a question mark, so it would
    // report a healthy width for a table entry that is missing.
    const zero: string[] = [];
    for (let cp = 32; cp < 0x2200; cp += 1) {
      const char = String.fromCodePoint(cp);
      if (widthOf(char, 1000, 'regular') === 0 || widthOf(char, 1000, 'bold') === 0) {
        zero.push(`U+${cp.toString(16)}`);
      }
    }
    expect(zero).toEqual([]);
  });

  it('handles an accented name, which Latin-1 can spell', () => {
    expect(winAnsiByte('é'.codePointAt(0)!)).toBe(0xe9);
    expect(widthOf('José', 1000, 'regular')).toBe(
      widthOf('J', 1000, 'regular') +
        widthOf('o', 1000, 'regular') +
        widthOf('s', 1000, 'regular') +
        556
    );
  });
});

describe('breaking a line of names', () => {
  it('leaves something that fits alone', () => {
    expect(wrapText('Ava & Ben', 200, 12, 'regular')).toEqual(['Ava & Ben']);
  });

  it('breaks between words rather than inside a name', () => {
    const lines = wrapText('Bartholomew & Maximilian', 90, 12.5, 'regular');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line).not.toMatch(/^Bartholome$|^ximilian$/);
    }
    expect(lines.join(' ')).toBe('Bartholomew & Maximilian');
  });

  it('keeps every line inside the column it was given', () => {
    const width = 120;
    for (const line of wrapText('Alexandra & Christopher', width, 12.5, 'regular')) {
      // A single word wider than the column is the documented exception, and
      // this string has none.
      expect(widthOf(line, 12.5, 'regular')).toBeLessThanOrEqual(width);
    }
  });

  it('would rather overrun than cut a name in half', () => {
    // Nothing sensible can be done with this, and half a name on a court sheet
    // is worse than an untidy one.
    expect(wrapText('Bartholomew', 10, 12, 'regular')).toEqual(['Bartholomew']);
  });

  it('gives back one empty line for nothing, so a caller never has zero', () => {
    expect(wrapText('', 100, 12, 'regular')).toEqual(['']);
    expect(wrapText('   ', 100, 12, 'regular')).toEqual(['']);
  });
});

describe('the file it writes', () => {
  it('is a PDF from the first byte to the last', () => {
    const file = asText(buildPdf([[text(50, 50, 'Hello')]], 'Test'));
    expect(file.startsWith('%PDF-1.4')).toBe(true);
    expect(file.endsWith('%%EOF\n')).toBe(true);
  });

  it('points the cross-reference table at the objects it claims', () => {
    const file = asText(buildPdf([[text(50, 50, 'One')]], 'Test'));

    const start = /startxref\n(\d+)\n/.exec(file);
    expect(start).not.toBeNull();
    const xrefAt = Number(start![1]);
    expect(file.slice(xrefAt, xrefAt + 4)).toBe('xref');

    const header = /xref\n0 (\d+)\n/.exec(file.slice(xrefAt))!;
    const count = Number(header[1]);
    const table = file.slice(xrefAt + header[0].length);
    // Every entry is exactly twenty bytes, and the first of them is the free
    // list head rather than an object, so object N sits at N.
    for (let obj = 1; obj < count; obj += 1) {
      const entry = table.slice(obj * 20, (obj + 1) * 20);
      const offset = Number(entry.slice(0, 10));
      expect(file.slice(offset, offset + `${obj} 0 obj`.length)).toBe(`${obj} 0 obj`);
    }
    expect(count).toBeGreaterThan(4);
  });

  it('counts its pages, and gives each one a body', () => {
    const file = asText(
      buildPdf([[text(50, 50, 'One')], [text(50, 50, 'Two')], [text(50, 50, 'Three')]], 'Test')
    );
    expect(file).toContain('/Count 3');
    expect(file.match(/\/Type \/Page[^s]/g)).toHaveLength(3);
    expect(file).toContain('(One) Tj');
    expect(file).toContain('(Three) Tj');
  });

  it('escapes the three characters that would otherwise end a string early', () => {
    const file = asText(buildPdf([[text(50, 50, 'a(b)c\\d')]], 'Test'));
    expect(file).toContain('(a\\(b\\)c\\\\d) Tj');
  });

  it('declares the encoding it actually writes bytes in', () => {
    const file = asText(buildPdf([[text(50, 50, 'José')]], 'Test'));
    // Without this the reader would draw the wrong glyph for every byte above
    // 127, so an accented name would come out as something else entirely.
    expect(file.match(/\/WinAnsiEncoding/g)).toHaveLength(2);
    expect(file).toContain(`(José) Tj`);
  });

  it('says how long each stream is, in bytes', () => {
    const bytes = buildPdf([[text(50, 50, 'José')]], 'Test');
    const file = asText(bytes);
    const declared = Number(/\/Length (\d+) >>\nstream\n/.exec(file)![1]);
    const body = file.slice(file.indexOf('stream\n') + 7, file.indexOf('\nendstream'));
    expect(body.length).toBe(declared);
  });

  it('turns the page upside down so callers can measure from the top', () => {
    // PDF counts up from the bottom left. A caller asking for y=0 means the top
    // edge, and text hangs below its baseline, so the baseline lands a full
    // size below the page top.
    const file = asText(buildPdf([[{ ...text(10, 0, 'Top'), size: 12 }]], 'Test'));
    expect(file).toContain('1 0 0 1 10 780 Tm');
  });

  it('draws a rule as a line of the length asked for', () => {
    const file = asText(
      buildPdf([[{ kind: 'line', x: 54, y: 100, length: 504, width: 0.5, color: '#cccccc' }]], 'T')
    );
    expect(file).toContain('54 692 m');
    expect(file).toContain('558 692 l');
    expect(file).toContain('0.8 0.8 0.8 RG');
  });

  it('writes a colour as the fraction of full that PDF expects', () => {
    const file = asText(
      buildPdf([[{ ...text(10, 10, 'Badge'), color: '#7e22ce' }]], 'Test')
    );
    // 0x7e is 126, and 126/255 rounds to 0.49.
    expect(file).toContain('0.49 0.13 0.81 rg');
  });

  it('keeps the page the size it says it is', () => {
    const file = asText(buildPdf([[text(1, 1, 'x')]], 'Test'));
    expect(file).toContain(`/MediaBox [0 0 ${PAGE_WIDTH} 792]`);
  });

  it('is all single bytes, which is what makes the offsets above trustworthy', () => {
    const bytes = buildPdf([[text(50, 50, 'José ’ 漢')]], 'Tëst');
    for (const b of bytes) expect(b).toBeLessThanOrEqual(255);
  });
});

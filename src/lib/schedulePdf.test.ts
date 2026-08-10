/**
 * Laying the schedule onto pages.
 *
 * The failure this is mostly about is a quiet one. A court that falls off the
 * bottom of a page is not an error anywhere: the file opens, the pages look
 * finished, and the only sign is a match nobody turns up for. So the counting
 * tests here matter more than the pretty ones.
 */
import { describe, it, expect } from 'vitest';
import type { Player, Round, Schedule } from '../types';
import { layoutSchedule, scheduleToPdf, PDF_TITLE, PDF_FOOTER } from './schedulePdf';
import { widthOf, type PdfOp } from './pdf';
import { APP_URL } from './appInfo';

function player(name: string, i: number): Player {
  return {
    id: `p-${name}`,
    name,
    rating: 3.5,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  };
}

/**
 * Every name in this schedule says which round and court it belongs to, so a
 * test can ask which page a particular court landed on.
 */
function schedule(rounds: number, courts: number, sitOuts = 0): Schedule {
  return {
    rounds: Array.from({ length: rounds }, (_, r) => ({
      roundNumber: r + 1,
      courts: Array.from({ length: courts }, (_, c) => ({
        courtNumber: c + 1,
        team1: [player(`R${r + 1}C${c + 1}a`, 0), player(`R${r + 1}C${c + 1}b`, 1)],
        team2: [player(`R${r + 1}C${c + 1}c`, 0), player(`R${r + 1}C${c + 1}d`, 1)],
        ratingDiff: 0,
      })),
      sitOuts: Array.from({ length: sitOuts }, (_, s) => player(`R${r + 1}out${s + 1}`, 0)),
    })),
  };
}

function texts(page: PdfOp[]): string[] {
  return page.flatMap((op) => (op.kind === 'text' ? [op.text] : []));
}

function allTexts(pages: PdfOp[][]): string[] {
  return pages.flatMap(texts);
}

/** Which page a string was drawn on, or -1. Wrapping is undone first. */
function pageOf(pages: PdfOp[][], needle: string): number {
  return pages.findIndex((page) => texts(page).join(' ').includes(needle));
}

describe('what the page says', () => {
  const pages = layoutSchedule(schedule(2, 2, 1), []);

  it('opens with the title, once', () => {
    expect(allTexts(pages).filter((t) => t === PDF_TITLE)).toHaveLength(1);
    expect(texts(pages[0])[0]).toBe(PDF_TITLE);
  });

  it('does not reprint the title at the top of every later page', () => {
    // Needs a schedule long enough to turn a page. Asked of a one-page
    // document the question above cannot tell the two behaviours apart.
    const many = layoutSchedule(schedule(9, 3, 4), []);
    expect(many.length).toBeGreaterThan(1);
    expect(allTexts(many).filter((t) => t === PDF_TITLE)).toHaveLength(1);
  });

  it('names every round', () => {
    expect(allTexts(pages)).toContain('ROUND 1');
    expect(allTexts(pages)).toContain('ROUND 2');
  });

  it('puts both teams of every court on the page', () => {
    const joined = allTexts(pages).join(' ');
    for (const round of [1, 2]) {
      for (const court of [1, 2]) {
        expect(joined).toContain(`R${round}C${court}a & R${round}C${court}b`);
        expect(joined).toContain(`R${round}C${court}c & R${round}C${court}d`);
      }
    }
  });

  it('sets the player names in bold, which is what they are read at', () => {
    // Not something the parity test can see. It compares the words on the two
    // sheets, and a weight is not a word.
    const names = pages
      .flat()
      .filter((op) => op.kind === 'text' && op.text.includes(' & '));
    expect(names.length).toBeGreaterThan(0);
    for (const op of names) expect(op.font).toBe('bold');
  });

  it('sets the sit-out line at the size of the names', () => {
    // It is a list of names, read off a bench at arm's length, so it is not
    // footnote-sized.
    const sitOut = pages.flat().find((op) => op.kind === 'text' && op.text.startsWith('Sitting out'))!;
    const name = pages.flat().find((op) => op.kind === 'text' && op.text.includes(' & '))!;
    expect(sitOut.size).toBe(name.size);
  });

  it('heads the two team columns, per round rather than per page', () => {
    expect(allTexts(pages).filter((t) => t === 'SERVING')).toHaveLength(2);
    expect(allTexts(pages).filter((t) => t === 'RECEIVING')).toHaveLength(2);
  });

  it('says who is sitting out, and does not invent the line when nobody is', () => {
    expect(allTexts(pages).join(' ')).toContain('Sitting out: R1out1');
    expect(allTexts(layoutSchedule(schedule(1, 2, 0), [])).join(' ')).not.toContain('Sitting out');
  });
});

describe('the rounds that are not ordinary', () => {
  /**
   * Court 1 is played in the round's format and court 2 is not, which is the
   * ordinary case: a roster rarely divides evenly, so the leftovers play a
   * normal game and the sheet has to say so.
   */
  function typed(roundType: Round['roundType']): Schedule {
    const base = schedule(1, 2);
    base.rounds[0].roundType = roundType;
    base.rounds[0].courts[0].team1 = [player('Ann', 1), player('Bob', 0)];
    base.rounds[0].courts[0].team2 = [player('Cal', 0), player('Di', 1)];
    base.rounds[0].courts[1].team1 = [player('Eli', 0), player('Fred', 2)];
    base.rounds[0].courts[1].team2 = [player('Gil', 4), player('Hal', 6)];
    return base;
  }

  it('badges the round with its format', () => {
    expect(allTexts(layoutSchedule(typed('mixed'), []))).toContain('(Mixed Round)');
    expect(allTexts(layoutSchedule(typed('gendered'), []))).toContain('(Gendered Round)');
  });

  it('marks the court that could not be played in that format', () => {
    // Court 1 has a man and a woman a side. Court 2 is four men, so in a mixed
    // round it is the odd one out and takes the note on its own.
    const drawn = allTexts(layoutSchedule(typed('mixed'), []));
    expect(drawn.filter((t) => t === '(normal game)')).toHaveLength(1);
    expect(drawn).toContain('Eli & Fred');
  });

  it('leaves an ordinary round unbadged and unmarked', () => {
    const drawn = allTexts(layoutSchedule(schedule(1, 2), []));
    expect(drawn.join(' ')).not.toContain('Round)');
    expect(drawn).not.toContain('(normal game)');
  });
});

describe('deciding where a page ends', () => {
  it('keeps a short schedule on one page', () => {
    expect(layoutSchedule(schedule(3, 2, 1), [])).toHaveLength(1);
  });

  it('starts a new page rather than letting a round straddle the fold', () => {
    const pages = layoutSchedule(schedule(9, 3, 4), []);
    expect(pages.length).toBeGreaterThan(1);

    for (let round = 1; round <= 9; round += 1) {
      const heading = pageOf(pages, `ROUND ${round}`);
      expect(heading).toBeGreaterThanOrEqual(0);
      // Everything belonging to this round is on the page its heading is on.
      for (let court = 1; court <= 3; court += 1) {
        expect(pageOf(pages, `R${round}C${court}a & R${round}C${court}b`)).toBe(heading);
      }
      expect(pageOf(pages, `Sitting out: R${round}out1`)).toBe(heading);
    }
  });

  it('never loses a court, even when one round cannot fit on a page', () => {
    // Thirty courts is past anything real, and is exactly the case where the
    // keep-it-whole rule has to give way to something rather than overflow.
    const pages = layoutSchedule(schedule(1, 30), []);
    expect(pages.length).toBeGreaterThan(1);
    const joined = allTexts(pages).join(' ');
    for (let court = 1; court <= 30; court += 1) {
      expect(joined).toContain(`R1C${court}a & R1C${court}b`);
    }
  });

  it('repeats the heading when it had to split one, so page two says what it is', () => {
    const drawn = allTexts(layoutSchedule(schedule(1, 30), []));
    expect(drawn).toContain('ROUND 1 CONTINUED');
    expect(drawn.filter((t) => t.startsWith('ROUND 1'))).toHaveLength(2);
  });

  it('does not say continued when it did not split anything', () => {
    expect(allTexts(layoutSchedule(schedule(9, 3, 4), [])).join(' ')).not.toContain('CONTINUED');
  });

  it('emits no blank pages', () => {
    for (const pages of [schedule(1, 1), schedule(9, 3, 4), schedule(1, 30)].map((s) =>
      layoutSchedule(s, [])
    )) {
      for (const page of pages) expect(page.length).toBeGreaterThan(0);
    }
  });

  it('draws nothing below the bottom margin', () => {
    const pages = layoutSchedule(schedule(9, 3, 4), []);
    for (const page of pages) {
      for (const op of page) {
        // 792 tall, three quarters of an inch of margin. A rule sits exactly on
        // the last row's edge, so the bottom itself is allowed.
        expect(op.y).toBeLessThanOrEqual(792 - 54);
      }
    }
  });
});

describe('the title and the address', () => {
  it('draws the logo beside the title, once, on the first page', () => {
    const pages = layoutSchedule(schedule(9, 3, 4), []);
    const images = pages.map((page) => page.filter((op) => op.kind === 'image').length);
    expect(images[0]).toBe(1);
    expect(images.slice(1)).toEqual(images.slice(1).map(() => 0));
  });

  it('keeps the logo and the title on the same line, in that order', () => {
    const page = layoutSchedule(schedule(1, 1), [])[0];
    const logo = page.find((op) => op.kind === 'image')!;
    const title = page.find((op) => op.kind === 'text' && op.text === PDF_TITLE)!;
    expect(logo.x).toBeLessThan(title.x);
    // Overlapping vertically is what "beside" means; stacked would not.
    expect(title.y).toBeGreaterThanOrEqual(logo.y);
    expect(title.y).toBeLessThan(logo.y + logo.height);
  });

  it('centres the pair on the page', () => {
    const page = layoutSchedule(schedule(1, 1), [])[0];
    const logo = page.find((op) => op.kind === 'image')!;
    const title = page.find((op) => op.kind === 'text' && op.text === PDF_TITLE)!;
    const left = logo.x;
    const right = title.x + widthOf(PDF_TITLE, title.size, title.font);
    expect((left + right) / 2).toBeCloseTo(612 / 2, 1);
  });

  it('is the address the app is served at, not one typed in twice', () => {
    expect(PDF_FOOTER).toBe(new URL(APP_URL).host);
  });

  it('puts the address on every page of the finished file', () => {
    // Not part of layoutSchedule: the parity test compares that against a DOM
    // which has one footer element for all the pages, so it is added after.
    const s = schedule(9, 3, 4);
    const pageCount = layoutSchedule(s, []).length;
    expect(pageCount).toBeGreaterThan(1);
    const file = Array.from(scheduleToPdf(s, []), (b) => String.fromCharCode(b)).join('');
    expect(file.split(`(${PDF_FOOTER}) Tj`)).toHaveLength(pageCount + 1);
    expect(allTexts(layoutSchedule(s, []))).not.toContain(PDF_FOOTER);
  });
});

describe('the finished document', () => {
  it('is a PDF with as many pages as were laid out', () => {
    const s = schedule(9, 3, 4);
    const bytes = scheduleToPdf(s, []);
    const file = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    expect(file.startsWith('%PDF')).toBe(true);
    expect(file).toContain(`/Count ${layoutSchedule(s, []).length}`);
  });

  it('is small enough to hand to a share sheet without thinking about it', () => {
    // A full session, well under the size where a phone would hesitate.
    expect(scheduleToPdf(schedule(12, 6, 4), []).length).toBeLessThan(200_000);
  });
});

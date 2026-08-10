/**
 * Lays the schedule out as PDF pages.
 *
 * A deliberate copy of what `PrintSchedule` puts on paper, down to the point
 * sizes: same title, same round headings and badges, same three columns, same
 * "(normal game)" note, same sit-out line. Someone who prints from a laptop and
 * someone who shares a PDF from a phone should be able to put the two sheets
 * side by side and see one schedule. `schedulePdf.parity.test.ts` is what keeps
 * that true, by rendering both and comparing what they say.
 *
 * The layout knows nothing about the DOM, which is what lets it be tested
 * without a browser and measured without one.
 */
import type { Schedule, Player, Round } from '../types';
import { getDisplayName } from '../utils/helpers';
import { ROUND_TYPE_META, courtMatchesType, roundTypeOf } from './roundTypes';
import { PAGE_HEIGHT, PAGE_WIDTH, buildPdf, widthOf, wrapText, type PdfOp } from './pdf';

/** Three quarters of an inch, which every printer can reach. */
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2;

const TITLE_SIZE = 18;
const HEADING_SIZE = 15.4;
const BADGE_SIZE = 9;
const LABEL_SIZE = 10;
const NAME_SIZE = 12.5;
const NOTE_SIZE = 9;

const CELL_PAD_X = 8;
const CELL_PAD_Y = 4;

const RULE_HEADING = '#cccccc';
const RULE_HEADER = '#999999';
const RULE_ROW = '#eeeeee';
const INK_MUTED = '#666666';

/** Matches the 1.2 the browser gives an unstyled line of text. */
function lineHeight(size: number): number {
  return size * 1.2;
}

const COL_COURT = Math.round(CONTENT_WIDTH * 0.26 * 100) / 100;
const COL_TEAM = Math.round(((CONTENT_WIDTH - COL_COURT) / 2) * 100) / 100;
const COLUMNS = [
  { x: MARGIN, width: COL_COURT },
  { x: MARGIN + COL_COURT, width: COL_TEAM },
  { x: MARGIN + COL_COURT + COL_TEAM, width: COL_TEAM },
];

/**
 * A piece of the document that is never split: it knows how tall it is before
 * it knows where it goes, so pagination can ask both questions in that order.
 */
interface Part {
  height: number;
  draw(top: number): PdfOp[];
}

function textLines(
  lines: string[],
  x: number,
  top: number,
  size: number,
  font: 'regular' | 'bold',
  color?: string
): PdfOp[] {
  return lines.map((text, i) => ({
    kind: 'text' as const,
    x,
    y: top + i * lineHeight(size),
    text,
    size,
    font,
    color,
  }));
}

function rule(top: number, color: string): PdfOp {
  return { kind: 'line', x: MARGIN, y: top, length: CONTENT_WIDTH, width: 0.5, color };
}

function titlePart(): Part {
  const text = 'Pickleball Round Robin';
  const height = lineHeight(TITLE_SIZE) + 12;
  return {
    height,
    draw: (top) => [
      {
        kind: 'text',
        x: MARGIN + (CONTENT_WIDTH - widthOf(text, TITLE_SIZE, 'bold')) / 2,
        y: top,
        text,
        size: TITLE_SIZE,
        font: 'bold',
      },
    ],
  };
}

/** "Round 3", with the format badge beside it, over a hairline. */
function headingPart(round: Round, continued: boolean): Part {
  const type = roundTypeOf(round);
  const label = `Round ${round.roundNumber}${continued ? ' continued' : ''}`;
  const height = lineHeight(HEADING_SIZE) + 4 + 8;
  return {
    height,
    draw: (top) => {
      const ops: PdfOp[] = [
        { kind: 'text', x: MARGIN, y: top, text: label, size: HEADING_SIZE, font: 'bold' },
      ];
      if (type) {
        ops.push({
          kind: 'text',
          x: MARGIN + widthOf(label, HEADING_SIZE, 'bold') + 8,
          // Sits on the heading's baseline rather than its top, or a smaller
          // size would float above the words it belongs to.
          y: top + HEADING_SIZE - BADGE_SIZE,
          text: `(${ROUND_TYPE_META[type].badge})`,
          size: BADGE_SIZE,
          font: 'regular',
          color: ROUND_TYPE_META[type].printColor,
        });
      }
      ops.push(rule(top + lineHeight(HEADING_SIZE) + 4, RULE_HEADING));
      return ops;
    },
  };
}

function columnHeaderPart(): Part {
  const height = CELL_PAD_Y * 2 + lineHeight(LABEL_SIZE);
  return {
    height,
    draw: (top) => [
      {
        kind: 'text',
        x: COLUMNS[1].x + CELL_PAD_X,
        y: top + CELL_PAD_Y,
        text: 'SERVING',
        size: LABEL_SIZE,
        font: 'regular',
      },
      {
        kind: 'text',
        x: COLUMNS[2].x + CELL_PAD_X,
        y: top + CELL_PAD_Y,
        text: 'RECEIVING',
        size: LABEL_SIZE,
        font: 'regular',
      },
      rule(top + height, RULE_HEADER),
    ],
  };
}

function courtRowPart(
  court: Round['courts'][number],
  round: Round,
  players: Player[]
): Part {
  const type = roundTypeOf(round);
  const offFormat = Boolean(type) && !courtMatchesType(court, type!);
  const courtLabel = `Court ${court.courtNumber}`;
  const serving = court.team1.map((p) => getDisplayName(p, players)).join(' & ');
  const receiving = court.team2.map((p) => getDisplayName(p, players)).join(' & ');

  const courtLines = wrapText(courtLabel, COLUMNS[0].width - CELL_PAD_X * 2, LABEL_SIZE, 'bold');
  const noteLines = offFormat
    ? wrapText('(normal game)', COLUMNS[0].width - CELL_PAD_X * 2, LABEL_SIZE, 'regular')
    : [];
  const servingLines = wrapText(serving, COLUMNS[1].width - CELL_PAD_X * 2, NAME_SIZE, 'regular');
  const receivingLines = wrapText(receiving, COLUMNS[2].width - CELL_PAD_X * 2, NAME_SIZE, 'regular');

  const courtHeight = (courtLines.length + noteLines.length) * lineHeight(LABEL_SIZE);
  const namesHeight =
    Math.max(servingLines.length, receivingLines.length) * lineHeight(NAME_SIZE);
  const height = CELL_PAD_Y * 2 + Math.max(courtHeight, namesHeight);

  return {
    height,
    draw: (top) => [
      ...textLines(courtLines, COLUMNS[0].x + CELL_PAD_X, top + CELL_PAD_Y, LABEL_SIZE, 'bold'),
      ...textLines(
        noteLines,
        COLUMNS[0].x + CELL_PAD_X,
        top + CELL_PAD_Y + courtLines.length * lineHeight(LABEL_SIZE),
        LABEL_SIZE,
        'regular',
        INK_MUTED
      ),
      ...textLines(servingLines, COLUMNS[1].x + CELL_PAD_X, top + CELL_PAD_Y, NAME_SIZE, 'regular'),
      ...textLines(
        receivingLines,
        COLUMNS[2].x + CELL_PAD_X,
        top + CELL_PAD_Y,
        NAME_SIZE,
        'regular'
      ),
      rule(top + height, RULE_ROW),
    ],
  };
}

function sitOutPart(round: Round, players: Player[]): Part | null {
  if (round.sitOuts.length === 0) return null;
  const text = `Sitting out: ${round.sitOuts.map((p) => getDisplayName(p, players)).join(', ')}`;
  const lines = wrapText(text, CONTENT_WIDTH, NOTE_SIZE, 'regular');
  return {
    height: 6 + 2 + lines.length * lineHeight(NOTE_SIZE),
    draw: (top) => textLines(lines, MARGIN, top + 6 + 2, NOTE_SIZE, 'regular', INK_MUTED),
  };
}

/**
 * Turns the schedule into pages.
 *
 * A round is kept whole wherever it will fit, the same promise `break-inside:
 * avoid` makes on screen. Where it will not fit even on a page of its own the
 * rows are flowed instead and the heading is repeated with "continued", which
 * only a very wide session can reach. The alternative to flowing is dropping a
 * court off the bottom of the page, and a court missing from a printed sheet is
 * the one failure this must not have.
 */
export function layoutSchedule(schedule: Schedule, players: Player[]): PdfOp[][] {
  const pages: PdfOp[][] = [];
  let page: PdfOp[] = [];
  let y = MARGIN;

  const newPage = () => {
    pages.push(page);
    page = [];
    y = MARGIN;
  };
  const place = (part: Part) => {
    page.push(...part.draw(y));
    y += part.height;
  };
  const remaining = () => PAGE_HEIGHT - MARGIN - y;

  place(titlePart());

  for (const round of schedule.rounds) {
    const heading = headingPart(round, false);
    const header = columnHeaderPart();
    const rows = round.courts.map((court) => courtRowPart(court, round, players));
    const sitOuts = sitOutPart(round, players);

    const whole =
      heading.height +
      header.height +
      rows.reduce((sum, r) => sum + r.height, 0) +
      (sitOuts?.height ?? 0);

    if (whole <= USABLE_HEIGHT) {
      // Fits somewhere whole, so the only question is whether it fits here.
      if (whole > remaining() && y > MARGIN) newPage();
      place(heading);
      place(header);
      rows.forEach(place);
      if (sitOuts) place(sitOuts);
    } else {
      let first = true;
      let index = 0;
      while (index < rows.length) {
        if (!first || heading.height + header.height + rows[index].height > remaining()) {
          if (y > MARGIN) newPage();
        }
        place(headingPart(round, !first));
        place(header);
        // At least one row per page, or a row taller than a page would spin here.
        let placed = 0;
        while (index < rows.length && (placed === 0 || rows[index].height <= remaining())) {
          place(rows[index]);
          index += 1;
          placed += 1;
        }
        first = false;
      }
      if (sitOuts) {
        if (sitOuts.height > remaining()) newPage();
        place(sitOuts);
      }
    }

    y += 16;
  }

  pages.push(page);
  return pages;
}

/** What the shared file is called, and what the reader shows as its title. */
export const PDF_TITLE = 'Pickleball Round Robin';
export const PDF_FILE_NAME = 'round-robin-schedule.pdf';

export function scheduleToPdf(schedule: Schedule, players: Player[]): Uint8Array<ArrayBuffer> {
  return buildPdf(layoutSchedule(schedule, players), PDF_TITLE);
}

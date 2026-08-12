import type { CourtScore } from '../../types';
import { PANEL_TONE, toneFor, type Tone } from './scoreTone';

/**
 * The board on a court, drawn from INBOX/scoreboard.svg.
 *
 * The source is line art on a uniform 30-unit stroke: a hollow frame, two hollow
 * panels rounded more than the frame is, and a colon of two stadium pills one
 * stroke wide. Those three things are the character, and they are what this
 * keeps. It is built in markup rather than inlined as an icon because the panels
 * have to hold two digits.
 *
 * Two things from the source did not survive, both on purpose. The drawn aperture
 * is 54 by 113, portrait, which is a panel for a single digit; two digits want it
 * the other way up, so the panels are landscape. And the frame around them is
 * gone: on a card that is already a bordered box, inside a round that is another,
 * a third border was one too many. What carries the drawing now is the panels
 * themselves and the colon between them.
 *
 * Two sizes. `sm` rides on the court's own header line beside COURT 3, where it
 * is a readout. `lg` is the box that fills it in, where it is the thing being
 * typed into.
 *
 * The two used to be one ratio apart, 1.6 in every measurement. `sm` has since
 * been taken up a fifth on its own: it is read from wherever the phone is
 * sitting, and it was drawn for a board rather than for that. `lg` is held at
 * arm's length with a keypad under it and needed nothing.
 */

/** What an empty panel shows. An en dash, wide enough to read as waiting. */
const BLANK = '–';

export type ScoreSize = 'sm' | 'lg';

/**
 * Sized in absolute `rem` rather than `text-xs`, which large-text mode scales.
 * These panels are a fixed height, so a scaled number would climb out of one.
 *
 * The stroke is the one thing on `sm` that did not go up with the rest: the
 * source draws every line at one weight, and 2.4px is a line the screen has to
 * round off anyway.
 */
const PANEL_SIZE: Record<ScoreSize, string> = {
  sm: 'h-[30px] min-w-[2.4rem] rounded-[6px] border-2 px-0.5 text-[1.125rem]',
  lg: 'h-10 min-w-[3.25rem] rounded-[8px] border-4 px-1 text-2xl',
};

const COLON_SIZE: Record<ScoreSize, { stack: string; pill: string }> = {
  sm: { stack: 'gap-[4px]', pill: 'h-[6px] w-[5px]' },
  lg: { stack: 'gap-[4px]', pill: 'h-[8px] w-[5px]' },
};

/** Panel to colon, the 60.6-unit gap of the source. */
const INNER_GAP: Record<ScoreSize, string> = {
  sm: 'gap-[6px]',
  lg: 'gap-[8px]',
};

interface PanelProps {
  value: string | number | undefined;
  tone: Tone;
  size?: ScoreSize;
  /** Set on the side the dialog is typing into. Absent on a court. */
  active?: boolean;
}

/**
 * One number panel, shared with the dialog so the two can never disagree about
 * what a winner looks like.
 *
 * `tabular-nums` is load-bearing. Without it "11" is narrower than "21" and the
 * whole board shifts sideways as the host nudges a score. `min-w` rather than a
 * fixed width so anything that got past validation grows the panel instead of
 * being clipped inside it.
 */
export function ScorePanel({ value, tone, size = 'lg', active = false }: PanelProps) {
  const empty = value === undefined || value === '';
  return (
    <span
      className={`flex items-center justify-center font-extrabold leading-none tabular-nums ${PANEL_SIZE[size]} ${PANEL_TONE[tone]} ${
        active ? 'ring-2 ring-blue-500 ring-offset-1' : ''
      }`}
    >
      {/* The faint colour is on the dash rather than in the blank tone, because
          the court number box wears that tone with a number in it. */}
      {empty ? <span className="text-gray-300">{BLANK}</span> : value}
    </span>
  );
}

/** The two pills between the panels. One stroke wide, as they are in the source. */
export function ScoreColon({ size = 'lg' }: { size?: ScoreSize }) {
  const { stack, pill } = COLON_SIZE[size];
  return (
    <span aria-hidden="true" className={`flex shrink-0 flex-col ${stack}`}>
      <span className={`rounded-full bg-gray-800 ${pill}`} />
      <span className={`rounded-full bg-gray-800 ${pill}`} />
    </span>
  );
}

interface Props {
  score?: CourtScore;
  courtNumber: number;
  onTap?: () => void;
}

export function Scoreboard({ score, courtNumber, onTap }: Props) {
  const label = score
    ? `Court ${courtNumber} score, ${score.team1} to ${score.team2}. Tap to change it.`
    : `Enter the score for court ${courtNumber}`;

  return (
    // Small board, full-size tap target. The panels stand 25px; the padding takes
    // the button past 44 and the negative margin takes that back out of the
    // header row's height, so the reach is a thumb's and the board is not.
    <button
      type="button"
      onClick={onTap}
      aria-haspopup="dialog"
      aria-label={label}
      title={label}
      className="group -my-2.5 shrink-0 cursor-pointer px-1 py-2.5"
    >
      {/* Press feedback on the whole board rather than a colour, because with
          the frame gone every surface here already means something. */}
      <span
        className={`flex items-center transition-transform group-active:scale-95 ${INNER_GAP.sm}`}
      >
        <ScorePanel value={score?.team1} tone={toneFor(score, 'team1')} size="sm" />
        <ScoreColon size="sm" />
        <ScorePanel value={score?.team2} tone={toneFor(score, 'team2')} size="sm" />
      </span>
    </button>
  );
}

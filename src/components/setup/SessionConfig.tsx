import type { SpecialGameTypes } from '../../types';
import { ROUND_TYPE_META, specialSummary } from '../../lib/roundTypes';
import { BallIcon, ChevronLeftIcon, StepPlayersIcon } from '../icons';
import { Toggle } from '../Toggle';
import { STEPPER_INK, STEPPER_KEY, STEPPER_VALUE } from '../stepperLook';

/**
 * The Setup Round Robin panel, drawn from `INBOX/Setup-Round-Robin.png`.
 *
 * Every colour below was sampled out of that file rather than picked by eye. The
 * mockup is a compressed render, so each one is the mean of the darkest few per
 * cent of its region, which lands on the ink and skips the fuzz around it.
 */

/** The primary teal, read from the one place it is written down. */
const TEAL = 'var(--color-brand-teal)';

/**
 * Headings and labels. The steppers' own ink and edge are the same two colours,
 * and live in `stepperLook` now that the rating stepper wears them too.
 */
const NAVY = STEPPER_INK;

/** The rule under the steppers. Mockup: #E0E2E8. */
const RULE = '#E0E2E8';

/**
 * A stepper: a key, a box holding the number, and another key.
 *
 * Three separate rounded boxes rather than one control divided up, which is what
 * the mockup does and is worth copying — the number reads as a value being shown
 * rather than as a third button. The keys take about a quarter of the width each,
 * so they are wide enough to hit with a thumb without the number losing its box.
 *
 * `h-11` rather than the mockup's height, which works out at about 32px. That is
 * under every thumb-target guideline going, and this is a control used at a court
 * with a phone in one hand.
 */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  downLabel,
  upLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  downLabel: string;
  upLabel: string;
}) {
  // A bare minus sign says nothing to a screen reader, which is why each key
  // carries a label of its own. The look comes from `stepperLook`, which the
  // rating stepper on the Players tab is painted out of too.
  const key = `relative z-10 w-[26%] shrink-0 text-xl ${STEPPER_KEY}`;

  return (
    <div className="min-w-0 flex-1">
      <label className="mb-1.5 block text-sm font-bold" style={{ color: NAVY }}>
        {label}
      </label>
      <div className="flex h-11 items-stretch">
        <button
          type="button"
          aria-label={downLabel}
          onClick={() => onChange(Math.max(min, value - 1))}
          className={key}
        >
          &minus;
        </button>
        {/* Square, with only a top and a bottom rule, and tucked a little way
            under the key on each side. The keys are opaque and sit above it, so
            what you see is one bar running behind them rather than three boxes
            in a row.

            Light teal rather than the mockup's white: the number is the thing
            on this panel that is being set, and the same tint carries a rating
            on the players list. */}
        <span className={`-mx-2 flex-1 text-[1.4rem] ${STEPPER_VALUE}`}>
          {value}
        </span>
        <button
          type="button"
          aria-label={upLabel}
          onClick={() => onChange(Math.min(max, value + 1))}
          className={key}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface Props {
  numCourts: number;
  numRounds: number;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  numPlayers: number;
  specialTypes: SpecialGameTypes;
  onOpenSpecialTypes: () => void;
  scoringEnabled: boolean;
  onScoringChange: (on: boolean) => void;
}

export function SessionConfig({
  numCourts,
  numRounds,
  onCourtsChange,
  onRoundsChange,
  numPlayers,
  specialTypes,
  onOpenSpecialTypes,
  scoringEnabled,
  onScoringChange,
}: Props) {
  const spotsNeeded = numCourts * 4;
  const sitOutsPerRound = Math.max(0, numPlayers - spotsNeeded);
  const specials = specialSummary(specialTypes, numRounds);

  return (
    <div className="space-y-4">
      {/* Bottom-aligned, so the two rows of keys stay level with each other when
          one label wraps and the other does not. In large text on a phone,
          "Number of Rounds" takes two lines and "Number of Courts" takes one. */}
      {/* The tour boxes this row with the heading above it. It holds the two
          steppers and nothing else, which is what makes the box land on the
          courts and rounds rather than on half the panel. */}
      <div data-tutorial="setup-steppers" className="flex items-end gap-4">
        <Stepper
          label="Number of Courts"
          value={numCourts}
          min={1}
          max={16}
          onChange={onCourtsChange}
          downLabel="Fewer courts"
          upLabel="More courts"
        />
        <Stepper
          label="Number of Rounds"
          value={numRounds}
          min={1}
          max={16}
          onChange={onRoundsChange}
          downLabel="Fewer rounds"
          upLabel="More rounds"
        />
      </div>

      {/* Closes off the two numbers being set from everything they decide. */}
      <hr className="border-0 border-t" style={{ borderColor: RULE }} />

      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: TEAL }}
        >
          <StepPlayersIcon className="h-6 w-6 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-[1.2rem] font-bold" style={{ color: NAVY }}>
            {numPlayers} of {spotsNeeded} Spots Filled
          </p>
          {/* Red, not amber. Straight off the mockup, where it is the one warm
              thing on the panel and the only line that is a consequence rather
              than a setting. */}
          {sitOutsPerRound > 0 && (
            <p className="text-sm text-[#FD1F04]">
              {sitOutsPerRound} player{sitOutsPerRound > 1 ? 's' : ''} will sit out each round
            </p>
          )}
        </div>
      </div>

      <div>
        {/* Full width with the chevron at its right end, so it reads as a way
            through to another panel rather than as something that happens here.
            The old blue pill said neither. */}
        {/* As wide as its own words, at the left. Full width it read as the
            main thing on the panel, which the two numbers above it are. */}
        <button
          type="button"
          onClick={onOpenSpecialTypes}
          className="flex items-center gap-3 rounded-xl border bg-[#FAFCFC] px-4 py-3 text-left transition-colors hover:bg-[#F1F8F9]"
          style={{ borderColor: TEAL, color: TEAL }}
        >
          <BallIcon className="h-6 w-6" />
          <span className="min-w-0 font-bold">Special Game Types</span>
          <ChevronLeftIcon className="h-5 w-5 rotate-180" />
        </button>

        {/* The chosen formats, in the same chips the round cards use for them,
            so the same thing is the same colour in both places. No heading over
            them: the button they sit under has already said what they are. The
            rounds each one lands on are not listed here — that belongs to the
            schedule, which is one tap away and says it per round. */}
        {specials.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {specials.map((s) => (
              <span
                key={s.type}
                className={`rounded px-2 py-0.5 text-xs font-medium ${ROUND_TYPE_META[s.type].badgeClass}`}
              >
                {s.headline}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-800">Keep Score?</h3>
        <Toggle checked={scoringEnabled} onChange={onScoringChange} label="Keep Score?" />
      </div>
    </div>
  );
}

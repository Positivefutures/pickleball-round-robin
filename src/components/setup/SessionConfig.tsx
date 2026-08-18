import { useMemo, useState } from 'react';
import type { RoundPlan } from '../../types';
import { clearPlan, planHasTypes, planTypesUsed } from '../../lib/roundPlan';
import { pillMeta } from '../../lib/roundTypes';
import { BallIcon, ChevronDownIcon, InfoIcon } from '../icons';
import { Toggle } from '../Toggle';
import { STEPPER_INK, STEPPER_KEY, STEPPER_VALUE } from '../stepperLook';
import { RoundTypePlanner } from './RoundTypePlanner';
import { TypeGlyphs } from './typeGlyphs';

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
  roundPlan: RoundPlan;
  /** Rounds already played. Locked in the list, and never rebuilt. */
  lockedRounds: number[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenInfo: () => void;
  onPlanCommit: (next: RoundPlan) => void;
  /**
   * The open list's draft, or null when the list is shut.
   *
   * The list keeps its choices back until it closes, so that the Schedule tab
   * does not blink while the host is still choosing. Two other things need to
   * see it in the meantime, which is why it is held above this panel rather
   * than inside it: Reset All, on the title line, which would otherwise be
   * reading the committed plan and sit greyed out over a list full of rounds
   * the host had just set; and Generate, further down the page, which has to
   * build the schedule the host is looking at.
   */
  planDraft: RoundPlan | null;
  onPlanDraft: (next: RoundPlan | null) => void;
  scoringEnabled: boolean;
  onScoringChange: (on: boolean) => void;
}

export function SessionConfig({
  numCourts,
  numRounds,
  onCourtsChange,
  onRoundsChange,
  roundPlan,
  lockedRounds,
  expanded,
  onToggleExpanded,
  onOpenInfo,
  onPlanCommit,
  planDraft,
  onPlanDraft,
  scoringEnabled,
  onScoringChange,
}: Props) {
  const locked = useMemo(() => new Set(lockedRounds), [lockedRounds]);

  const canReset = planHasTypes(planDraft ?? roundPlan, numRounds, locked);

  /**
   * The formats in play, for the pills under a shut list. Read off the
   * committed plan rather than the draft: with the list open there are no pills
   * to draw, and the draft is only ever set while it is.
   */
  const used = useMemo(() => planTypesUsed(roundPlan, numRounds), [roundPlan, numRounds]);

  /**
   * Bumped by Reset All to remount the list, which is what a key is for. The
   * draft is seeded when the list opens, so clearing the plan underneath it
   * would otherwise leave the rows saying what they said before.
   */
  const [resetNonce, setResetNonce] = useState(0);

  function handleReset() {
    onPlanCommit(clearPlan(roundPlan, locked));
    onPlanDraft(null);
    setResetNonce((n) => n + 1);
  }

  /**
   * Shutting the list keeps what was set, exactly as Done does.
   *
   * The draft was never a decision waiting to be confirmed. It exists so the
   * Schedule tab does not blink on every pill tap, and throwing it away on the
   * way out made the title button a way to lose work by tapping the same thing
   * twice. Done and this now differ only in which one is obvious.
   */
  function handleToggle() {
    if (expanded && planDraft) onPlanCommit(planDraft);
    onPlanDraft(null);
    onToggleExpanded();
  }

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

      {/* Above the round types now. It is one switch with one answer, and it was
          sitting under a list that can be sixteen rounds long. */}
      <div className="flex items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-800">Keep Score?</h3>
        <Toggle checked={scoringEnabled} onChange={onScoringChange} label="Keep Score?" />
      </div>

      <div>
        {/* Wraps rather than clips. The three fit on one line on a 390px phone,
            which is the one this was drawn for; on anything narrower Reset All
            drops to a line of its own, still at the right, rather than being
            cut off by the panel's edge. */}
        <div className="flex flex-wrap items-center gap-1">
          {/* As wide as its own words, at the left. Full width it read as the
              main thing on the panel, which the two numbers above it are. The
              chevron turns rather than pointing on: what it opens is right
              here, not another panel. */}
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={expanded}
            className="flex shrink-0 items-center gap-2 rounded-xl border bg-[#FAFCFC] px-3 py-3 text-left transition-colors hover:bg-[#F1F8F9]"
            style={{ borderColor: TEAL, color: TEAL }}
          >
            <BallIcon className="h-6 w-6 shrink-0" />
            {/* One line. Reset All arrived at the other end of this row and
                took just enough width to break the title in half. */}
            <span className="whitespace-nowrap font-bold">Set Round Types</span>
            {/* Down when there is something to open, up when it is open.
                Not the chevron that points on to another panel: what this
                opens is right underneath it. */}
            <ChevronDownIcon
              className={`h-5 w-5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Its own button, not part of the title: it explains the formats and
              changes nothing, so pressing it must never be a way to open the
              list by accident. 44px of target around a 25px glyph. */}
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="About round types"
            className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#F1F8F9]"
            style={{ color: TEAL }}
          >
            <InfoIcon className="h-[25px] w-[25px]" />
          </button>

          {/* Only while the list is open, and only when there is something in
              it to clear. It belongs to the list rather than to the title: with
              the list shut there is nothing on screen for it to act on, and a
              button that throws work away should not be sitting on a panel
              beside the thing it would throw away.

              Held at the right end of the line, away from the two controls that
              open something.

              A round already played keeps what it was played as. Nothing is
              going to rebuild it, and clearing it would only make the list lie
              about what happened on court. */}
          {canReset && (
            /* A button, in the border Set Round Types wears, rather than a word
               with an underline's worth of target on it. No glyph: the two
               controls beside it are recognised by their shapes, and a third
               shape here would say this is a third thing to open. */
            <button
              type="button"
              onClick={handleReset}
              className="ml-auto shrink-0 rounded-xl border bg-[#FAFCFC] px-3 py-3 font-bold transition-colors hover:bg-[#F1F8F9]"
              style={{ borderColor: TEAL, color: TEAL }}
            >
              Reset All
            </button>
          )}
        </div>

        {/* What this afternoon is set to play, with the list shut.
            One pill per format used, however many rounds use it: the question
            somebody is asking at a glance is whether there is a gendered round
            today, and a count is a number to check against a list they can open
            in one tap. Nothing for an ordinary round, which is not a format.

            Hidden while the list is open, where every round says this for
            itself a few pixels below and the pills would be the same answer
            twice. */}
        {!expanded && used.length > 0 && (
          /* A list, and labelled as one. Read aloud, a row of pills with
             nothing in front of it is three words with no subject. */
          /* Tighter than the pills inside the list: all three have to sit on one
             line on a 390px phone, and at the list's own padding "Equal Skill"
             dropped to a second row. flex-wrap stays as the floor rather than
             the plan — in large-text mode they will wrap, and wrapping is a
             better answer there than three pills running off the panel. */
          <ul
            aria-label="Round types in this session"
            className="mt-2 flex flex-wrap items-center gap-1"
          >
            {used.map((type) => {
              const meta = pillMeta(type);
              return (
                <li
                  key={type}
                  className={`flex items-center gap-1 rounded-full border-2 px-1.5 py-1 text-xs font-bold ${meta.badgeClass} ${meta.badgeEdgeClass}`}
                >
                  <TypeGlyphs type={type} size="badge" />
                  {meta.shortName}
                </li>
              );
            })}
          </ul>
        )}

        {expanded && (
          <RoundTypePlanner
            key={resetNonce}
            numRounds={numRounds}
            plan={roundPlan}
            lockedRounds={lockedRounds}
            onDraftChange={onPlanDraft}
            onCommit={(next) => {
              onPlanCommit(next);
              onPlanDraft(null);
              onToggleExpanded();
            }}
          />
        )}
      </div>
    </div>
  );
}

import { useSyncExternalStore } from 'react';
import * as stores from '../../lib/stores';
import { formatMMSS, liveRemainingMs } from '../../lib/roundTimer';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { ROUND_HEADING_TEXT, ROUND_TIMER_CHIP } from './roundLook';
import { RoundClockIcon } from './timerIcons';

/**
 * The clock at the top of a round, and the time left beside it once that
 * round's timer is going.
 *
 * It reads the store itself rather than being handed the time from above, and
 * that is the whole reason it exists as its own component. A countdown has to
 * redraw four times a second; the page holding it is a hundred player boxes
 * deep, and redrawing all of them on every tick to move four digits would be
 * paid for in dropped frames on the phone this is used on. Only this button
 * subscribes, so only this button redraws.
 *
 * The digits are also what says a timer is live, which the clock used to say by
 * pulsing. A number that is visibly counting says it better, and a pulse beside
 * changing digits reads as something being wrong.
 */
export function RoundTimerChip({
  roundNumber,
  onOpen,
}: {
  roundNumber: number;
  onOpen: () => void;
}) {
  const state = useSyncExternalStore(
    stores.roundTimer.subscribe, stores.roundTimer.get, stores.roundTimer.get
  );

  // Every round shows a clock — the host is the one who picks which to time —
  // but only the round actually holding the timer shows a time.
  const mine = state.roundNumber === roundNumber && state.phase !== 'idle';
  useCountdownTick(mine && state.phase === 'running');

  return (
    // Always white: the host's chip is gone by the time a round is finished, so
    // this one never meets the pale card. See RoundCard.
    <button
      type="button"
      onClick={onOpen}
      aria-label="Round timer"
      className={`${ROUND_TIMER_CHIP} text-white`}
    >
      {/* 20% up on the 24px it used to be, and nudged back the 5px the
          artwork sits in from the left of its own 512 grid. `relative`, so
          the nudge is optical only: a negative margin would shrink the chip
          and pull the digits along with it. */}
      <RoundClockIcon className="relative -left-[5px] h-[1.8rem] w-[1.8rem]" />
      {mine && (
        <span className={`${ROUND_HEADING_TEXT} font-bold tabular-nums`}>
          {formatMMSS(liveRemainingMs(state))}
        </span>
      )}
    </button>
  );
}

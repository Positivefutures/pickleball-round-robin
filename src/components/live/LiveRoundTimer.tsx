import { sharedAlarming, sharedRemainingMs, type SharedRoundTimer } from '../../lib/sessionSnapshot';
import { formatMMSS } from '../../lib/roundTimer';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { ROUND_HEADING_TEXT, ROUND_TIMER_CHIP } from '../schedule/roundLook';
import { TimerIcon } from '../schedule/timerIcons';
import { TimerSheet } from '../schedule/TimerSheet';
import { LiveAlertControls } from './LiveAlertControls';
import type { Alerts } from '../../lib/watchAlerts';

/**
 * The host's round timer on somebody else's phone.
 *
 * The same sheet the host sees, with nothing to press. Whoever is running the
 * session decides how long a round is, when it starts and when it stops; a
 * watcher only wants to know how much of it is left, which is the one question
 * this answers and the reason it is worth its own full screen.
 *
 * It counts down on its own rather than waiting to be told. The published
 * `endsAt` is an absolute deadline, so this phone subtracts it from its own
 * clock every quarter second and is right regardless of when the document
 * behind it last arrived — a page polling every twenty seconds still shows a
 * countdown that moves once a second, and reaches zero on time rather than up
 * to twenty seconds late.
 */
export function LiveRoundTimer({
  timer,
  alerts,
  onChangeAlerts,
  onClose
}: {
  timer: SharedRoundTimer;
  /** The host's choices, with this watcher's own over the top. */
  alerts: Alerts;
  onChangeAlerts: (patch: Partial<Alerts>) => void;
  onClose: () => void;
}) {
  useCountdownTick(timer.phase === 'running');

  const remaining = sharedRemainingMs(timer);
  const alarming = sharedAlarming(timer, remaining);

  return (
    <TimerSheet
      roundNumber={timer.roundNumber}
      alarming={alarming}
      remainingMs={remaining}
      // Never the white sheet. On the host's panel that is the phase with the
      // minutes still to set, and a watcher's timer is always counting.
      light={false}
      flashOn={alerts.flashOn}
      onClose={onClose}
      // Three switches rather than none. What the host chose reaches every
      // phone, which is right, and then the phone gets a say: nine alarms
      // going off around one court is nine times what anybody asked for.
      config={<LiveAlertControls alerts={alerts} onChange={onChangeAlerts} />}
    />
  );
}

/**
 * The clock at the top of a round on a watcher's page, with the time left
 * beside it.
 *
 * The host's chip in the same place reads a live store; this one reads a
 * document that may be a few seconds old. Both come out at the same number,
 * because both subtract an absolute deadline from the clock of the phone
 * drawing them — and both are written from one class string in roundLook, so
 * two people standing next to each other see the same thing.
 *
 * Only ever mounted on the round being timed, so unlike the host's there is no
 * clock-with-no-time state to draw.
 */
export function LiveTimerChip({
  timer,
  onOpen,
}: {
  timer: SharedRoundTimer;
  onOpen: () => void;
}) {
  useCountdownTick(timer.phase === 'running');

  return (
    <button type="button" onClick={onOpen} aria-label="Round timer" className={ROUND_TIMER_CHIP}>
      <TimerIcon className="h-6 w-6" />
      <span className={`${ROUND_HEADING_TEXT} font-bold tabular-nums`}>
        {formatMMSS(sharedRemainingMs(timer))}
      </span>
    </button>
  );
}

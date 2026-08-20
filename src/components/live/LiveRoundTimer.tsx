import { sharedAlarming, sharedRemainingMs, type SharedRoundTimer } from '../../lib/sessionSnapshot';
import { formatMMSS } from '../../lib/roundTimer';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { ROUND_HEADING_TEXT, ROUND_TIMER_CHIP } from '../schedule/roundLook';
import { TimerIcon } from '../schedule/timerIcons';
import { TimerSheet } from '../schedule/TimerSheet';
import { LiveAlertControls } from './LiveAlertControls';
import type { Alerts } from '../../lib/watchAlerts';
import { CloseIcon } from '../icons';
import { TileButton, TILE_ALONE } from '../TileButton';

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
 *
 * It opens whether or not there is a timer. `timer` is null until the host
 * starts one, and this says so in as many words rather than showing nothing:
 * "has it started?" is the question a group standing on a court actually has,
 * and an empty screen answers it no better than an empty pocket. When the host
 * does start, the field arrives on the next poll and the screen becomes a
 * countdown where it stands. Nobody has to close it and open it again.
 *
 * `heldAlarm` is the one thing on this screen the host cannot reach. Once this
 * phone's own clock has run a round out, TIME'S UP stands here until the person
 * holding it presses Close — the host putting their timer away does not take it
 * down. See the latch in LiveSessionPage for why.
 */
export function LiveRoundTimer({
  timer,
  heldAlarm,
  alerts,
  onChangeAlerts,
  onClose
}: {
  timer: SharedRoundTimer | null;
  /**
   * The round this phone has run out and not yet been told about, or null.
   * Outlives the host's own timer on purpose.
   */
  heldAlarm: number | null;
  /** The host's choices, with this watcher's own over the top. */
  alerts: Alerts;
  onChangeAlerts: (patch: Partial<Alerts>) => void;
  onClose: () => void;
}) {
  useCountdownTick(timer?.phase === 'running');

  const remaining = timer ? sharedRemainingMs(timer) : 0;
  const alarming = heldAlarm !== null || (!!timer && sharedAlarming(timer, remaining));

  return (
    <TimerSheet
      // The held round when the host's timer has gone out from under it, so a
      // screen still saying TIME'S UP still says which round's.
      roundNumber={timer?.roundNumber ?? heldAlarm}
      alarming={alarming}
      remainingMs={alarming ? 0 : remaining}
      // Never the white sheet. On the host's panel that is the phase with the
      // minutes still to set, and a watcher's timer is always counting.
      light={false}
      flashOn={alerts.flashOn}
      onClose={onClose}
      // Close is the tile below, as it is on the host's panel. A key in the
      // corner as well would be two ways out of one sheet to read past.
      closeKey={false}
      waiting={
        timer || alarming
          ? undefined
          : 'The host hasn’t started the timer yet. The time will appear here when they do.'
      }
      // Three switches rather than none. What the host chose reaches every
      // phone, which is right, and then the phone gets a say: nine alarms
      // going off around one court is nine times what anybody asked for.
      //
      // Offered while waiting too, so the answer can be given before the alarm
      // rather than after it.
      config={<LiveAlertControls alerts={alerts} onChange={onChangeAlerts} />}
      // One tile, in the shape the host's row of them already has. It is the
      // only thing on this screen there has ever been to press, and on a
      // ringing timer it is also the thing that stops the noise — which is
      // exactly why it had to stop being an eight-pixel key in the corner.
      actions={
        <div className={TILE_ALONE}>
          <TileButton tone="quiet" Icon={CloseIcon} label="Close" onClick={onClose} />
        </div>
      }
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
 * On every round, and only the round actually being timed shows a time — the
 * same rule the host's chip follows, for the same reason it reads the way it
 * does: digits mean it has started. A clock that only appeared once the host
 * pressed something left a watcher with nothing to look at and no way to tell
 * "not started" from "not working".
 */
export function LiveTimerChip({
  timer,
  heldAlarm,
  roundNumber,
  onOpen,
  ink,
}: {
  timer: SharedRoundTimer | null;
  /**
   * The round this phone has run out and not yet been told about. It reads
   * 0:00 here for as long as that stands, including after the host's timer has
   * gone: a phone making a noise has to say somewhere on the page what about.
   */
  heldAlarm: number | null;
  /** Which round this chip sits on. */
  roundNumber: number;
  onOpen: () => void;
  /**
   * What colour to draw in, since this page puts a clock on finished rounds as
   * well as live ones and those two cards are no longer the same colour.
   */
  ink: string;
}) {
  // Truthiness, not `!== null`: a document published before the timer field
  // existed has no key at all, and `undefined !== null` is true.
  const counting = !!timer && timer.roundNumber === roundNumber;
  const rang = heldAlarm === roundNumber;
  const mine = counting || rang;
  useCountdownTick(counting && timer.phase === 'running');

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Round timer"
      className={`${ROUND_TIMER_CHIP} ${ink}`}
    >
      <TimerIcon className="h-6 w-6" />
      {mine && (
        <span className={`${ROUND_HEADING_TEXT} font-bold tabular-nums`}>
          {formatMMSS(rang || !timer ? 0 : sharedRemainingMs(timer))}
        </span>
      )}
    </button>
  );
}

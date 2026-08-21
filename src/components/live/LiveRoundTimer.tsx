import { sharedRemainingMs, type SharedRoundTimer } from '../../lib/sessionSnapshot';
import { formatMMSS } from '../../lib/roundTimer';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { ROUND_HEADING_TEXT, ROUND_TIMER_CHIP } from '../schedule/roundLook';
import { TimerSheet } from '../schedule/TimerSheet';
import { LiveAlertControls } from './LiveAlertControls';
import type { Alerts } from '../../lib/watchAlerts';
import { TimerIcon, StopSquareIcon, ExitIcon } from '../schedule/timerIcons';
import { TileButton, TILE_ALONE, TILE_ROW } from '../TileButton';

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
 * `alarm` is the one thing on this screen the host cannot reach, in either
 * direction: their putting a timer away does not take TIME'S UP down here, and
 * their own still ringing does not overrule somebody here who has answered it.
 * See the latch in LiveSessionPage for why.
 */

/**
 * An alarm standing on this phone: which round ran out, and whether whoever is
 * holding it has said they have heard it.
 *
 * Answered is not the same as gone. The round is still over, so the screen
 * still says 0:00 and so does the chip on the round; what stops is the noise
 * and the strobe.
 */
export interface WatchAlarm {
  round: number;
  answered: boolean;
}
export function LiveRoundTimer({
  timer,
  alarm,
  alerts,
  onChangeAlerts,
  onClose,
  onStop
}: {
  timer: SharedRoundTimer | null;
  /** The round this phone has run out, or null. Outlives the host's own timer. */
  alarm: WatchAlarm | null;
  /** The host's choices, with this watcher's own over the top. */
  alerts: Alerts;
  onChangeAlerts: (patch: Partial<Alerts>) => void;
  onClose: () => void;
  /** Answers the alarm and leaves the screen up. Only offered while it sounds. */
  onStop: () => void;
}) {
  useCountdownTick(timer?.phase === 'running');

  const remaining = timer ? sharedRemainingMs(timer) : 0;
  // Only an unanswered one draws TIME'S UP and strobes. An answered alarm is a
  // round that is over, which the clock says by reading 0:00.
  const sounding = alarm !== null && !alarm.answered;

  return (
    <TimerSheet
      // The held round when the host's timer has gone out from under it, so a
      // screen still saying TIME'S UP still says which round's.
      roundNumber={timer?.roundNumber ?? alarm?.round ?? null}
      alarming={sounding}
      remainingMs={alarm ? 0 : remaining}
      // Never the white sheet. On the host's panel that is the phase with the
      // minutes still to set, and a watcher's timer is always counting.
      light={false}
      flashOn={alerts.flashOn}
      onClose={onClose}
      // Close is the tile below, as it is on the host's panel. A key in the
      // corner as well would be two ways out of one sheet to read past.
      closeKey={false}
      waiting={
        timer || alarm
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
      // One tile most of the time, two while the alarm sounds, in the shape
      // the host's row of them already has.
      //
      // Both of the two stop the noise, so a thumb startled by an alarm cannot
      // press the wrong one. What they differ on is the screen: Close puts it
      // away, and Stop leaves it standing, which is for somebody who wants the
      // next round's countdown to appear where they are already looking. It
      // will: this sheet is held open across a timer arriving and a timer
      // going.
      //
      // Stop is only ever drawn on a sounding alarm. On a running countdown it
      // would read as a way to stop the host's timer, which is the one thing
      // this page must never look like.
      actions={
        <div className={sounding ? TILE_ROW : TILE_ALONE}>
          {/* The same door the host's Close wears, pointing the same way. Two
              tiles in this app say Close and they are these two; everywhere
              else the X means Cancel. */}
          <TileButton tone="quiet" Icon={ExitIcon} label="Close" onClick={onClose} />
          {sounding && (
            <TileButton tone="quiet" Icon={StopSquareIcon} label="Stop" onClick={onStop} />
          )}
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

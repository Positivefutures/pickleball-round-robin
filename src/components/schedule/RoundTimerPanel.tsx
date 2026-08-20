import { useSyncExternalStore, type ReactNode } from 'react';
import * as stores from '../../lib/stores';
import {
  timerPanelOpen, dismissRoundTimer, startTimer, stopTimer, resetTimer,
  setMinutes, setSoundOn, setFlashOn, setAlarmTone, liveRemainingMs,
  MINUTES_MIN, MINUTES_MAX, type RoundTimerState,
} from '../../lib/roundTimer';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { Toggle } from '../Toggle';
import { CloseIcon } from '../icons';
import { TileButton, TILE_ROW } from '../TileButton';
import { STEPPER_INK, STEPPER_KEY, STEPPER_VALUE } from '../stepperLook';
import { AlarmTonePicker } from './AlarmTonePicker';
import { TimerSheet } from './TimerSheet';
import {
  VolumeUpIcon, SilenceIcon, FlashIcon, IphoneOutlineIcon, PlayTriangleIcon, PauseIcon,
  ReplayIcon,
} from './timerIcons';

/**
 * The round timer itself: a countdown big enough to read from the baseline,
 * with a stepper and two alerts to configure before it starts.
 *
 * Mounted once, unconditionally, from App.tsx — not owned by SchedulePage,
 * which is the one deliberate break from how every other schedule dialog is
 * wired. SchedulePage unmounts on every tab switch (`step === 'schedule'`
 * gates it), so nothing living there could bring itself back to the front
 * after the host left for another tab. This reads the shared store directly
 * instead, the same way LiveShareView reads liveStatusStore, so an alarm that
 * started on the Schedule tab can still force itself open over Setup or
 * Roster.
 *
 * `visible` is `manuallyOpen || phase === 'alarming'` — an active alarm always
 * wins, so lowering that flag on its own cannot dismiss a ringing sheet. Every
 * way out of it therefore goes through `dismissRoundTimer`, which leaves the
 * alarming phase first. See the note on that function for why closing a ringing
 * timer resets it.
 */
export function RoundTimerPanel() {
  const state = useSyncExternalStore(
    stores.roundTimer.subscribe, stores.roundTimer.get, stores.roundTimer.get
  );
  const manuallyOpen = useSyncExternalStore(
    timerPanelOpen.subscribe, timerPanelOpen.get, timerPanelOpen.get
  );
  const visible = manuallyOpen || state.phase === 'alarming';

  // Held while the sheet is up *and* for as long as a countdown is running,
  // even with the sheet closed. A phone that sleeps mid-round is a phone whose
  // alarm never sounds: the screen going off is what suspends the audio, and a
  // host who set a timer and put the phone down at the net has asked for
  // exactly the case this covers.
  useWakeLock(visible || state.phase === 'running');

  // Smooth on-screen digits while running. Purely cosmetic — see the hook.
  useCountdownTick(state.phase === 'running');

  if (!visible || state.roundNumber === null) return null;

  // Idle is the only phase with anything left to set, and so the only one that
  // stays on a white sheet.
  const idle = state.phase === 'idle';
  const running = state.phase === 'running';

  /**
   * Nothing left to pause, and nothing left to start.
   *
   * `alarming` is always here — its remaining time is zero by definition. The
   * only other way in is a Pause that lands on the very last tick, which freezes
   * `paused` at zero; Start Timer there would begin a countdown of no length and
   * ring again immediately.
   *
   * Both used to offer the pair anyway. A host on a live court had a Pause
   * button on a clock reading 0:00, and pressing it produced a Start Timer
   * button on a clock reading 0:00. Jeff's report on 2026-08-20, and the answer
   * is that neither belongs: at zero the only two things worth doing are
   * putting it away and setting it up again.
   */
  const spent = state.phase === 'alarming' || (state.phase === 'paused' && state.remainingMs <= 0);

  /**
   * Whether a countdown is under way, paused or not.
   *
   * This is what the two alert switches follow. Not `running` on its own: the
   * switches blinking out of existence on Pause and back on Start would read as
   * a fault, and a paused round is exactly when somebody has a moment to notice
   * the sound is off. Not the alarm either — see AlertSwitches.
   */
  const underway = !idle && !spent;

  return (
    <TimerSheet
      roundNumber={state.roundNumber}
      alarming={state.phase === 'alarming'}
      remainingMs={liveRemainingMs(state)}
      light={idle}
      flashOn={state.flashOn}
      onClose={dismissRoundTimer}
      // Close is the first tile in the row below. Two ways out of one sheet is
      // one to read past.
      closeKey={false}
      // Dark whenever the sheet is (`light` is `idle` just above), because the
      // box is drawn on the sheet itself and a white-on-white one would be a
      // rectangle of nothing. The two flags have to agree; they are computed
      // from the same `idle`.
      config={
        idle ? (
          <TimerConfig state={state} />
        ) : underway ? (
          <AlertSwitches state={state} dark />
        ) : undefined
      }
      actions={
        <>
          {/* The tiles every other panel in the app answers with, so the way
              out of the timer is the shape a host already knows. Close is
              always the left one — it stands in for the key that used to sit
              in the corner of the sheet — and what it sits beside grows from
              one button to two once the clock is running.

              Pause turns back into Start Timer in place rather than
              collapsing the row, so Close and Reset stay where the thumb last
              found them.

              At zero the middle tile goes altogether and the row does collapse
              to two, which is the one exception to that. There is no honest
              third thing to put there: a clock with nothing left on it can be
              put away or set up again, and offering either half of the
              play/pause pair would be offering a button that does nothing worth
              doing. Reset moving left is the cost, and it is cheap — the tile it
              moves into was Pause, and on a ringing timer Pause and Reset both
              silence it. */}
          <div className={TILE_ROW}>
            <TileButton
              tone="quiet"
              Icon={CloseIcon}
              label="Close"
              onClick={dismissRoundTimer}
            />
            {!spent &&
              (running ? (
                /* Quiet, not red. Pausing takes nothing away: the clock holds
                   where it is and Start Timer carries on from there. Red is for
                   the tiles that end something. */
                <TileButton tone="quiet" Icon={PauseIcon} label="Pause" onClick={stopTimer} />
              ) : (
                <TileButton
                  tone="teal"
                  Icon={PlayTriangleIcon}
                  label="Start Timer"
                  onClick={startTimer}
                />
              ))}
            {!idle && (
              <TileButton tone="quiet" Icon={ReplayIcon} label="Reset" onClick={resetTimer} />
            )}
          </div>
          {/* Only while something is actually counting. It hung on through the
              alarm as well, under a screen reading TIME'S UP, where "the timer
              keeps running" is simply not true — and it was least visible there
              precisely because that screen used to be crowded with a Pause
              button that did not belong either. */}
          {underway && (
            <p className="mt-3 text-center text-sm text-gray-400">
              You can leave this screen. The timer keeps running.
            </p>
          )}
        </>
      }
    />
  );
}

/**
 * Everything that is only worth setting before the countdown starts: how long,
 * and which tone. The two switches under them are worth setting later too, and
 * live in their own component for it.
 *
 * What is not here is hidden rather than disabled once the timer is running —
 * a greyed-out minutes stepper would be a thing to read past to see the digits,
 * and the length a round was started at is not a thing that can be changed
 * halfway through anyway.
 */
function TimerConfig({ state }: { state: RoundTimerState }) {
  // The Setup tab's own courts stepper, scaled up. Keys stay live at the ends
  // of their range and clamp, exactly as they do over there: a key that greys
  // out at one minute reads as something being wrong rather than as the floor
  // being reached.
  const key = `relative z-10 w-[26%] shrink-0 text-4xl ${STEPPER_KEY}`;

  return (
    <>
      <div className="w-full max-w-xs">
        <label className="mb-1.5 block text-center text-sm font-bold" style={{ color: STEPPER_INK }}>
          Minutes
        </label>
        <div className="flex h-20 items-stretch">
          <button
            type="button"
            aria-label="Fewer minutes"
            onClick={() => setMinutes(Math.max(MINUTES_MIN, state.minutes - 1))}
            className={key}
          >
            &minus;
          </button>
          <span className={`-mx-2 flex-1 text-5xl ${STEPPER_VALUE}`}>{state.minutes}</span>
          <button
            type="button"
            aria-label="More minutes"
            onClick={() => setMinutes(Math.min(MINUTES_MAX, state.minutes + 1))}
            className={key}
          >
            +
          </button>
        </div>
      </div>

      <AlertSwitches
        state={state}
        dark={false}
        tone={<AlarmTonePicker value={state.alarmTone} onChange={setAlarmTone} />}
      />
    </>
  );
}

/**
 * Play Sound and Flash Screen, on the sheet before the countdown starts and
 * again while it is running.
 *
 * They used to go away the moment Start Timer was pressed, along with the
 * minutes and the tone, on the reasoning that nothing on that panel means
 * anything mid-round. That is true of the other two and false of these: a host
 * who starts a thirteen-minute round and then notices the sound is off has
 * twelve minutes in which the switch is the only thing they want, and no way to
 * reach it short of resetting the timer they have just started. Jeff's report
 * on 2026-08-20.
 *
 * The tone picker does not come with them. Choosing a tone plays it, which on a
 * court mid-round is a false alarm, and the switch is what the report was about.
 *
 * Nor do they stay for the alarm itself. `setSoundOn` writes a preference and
 * the watchdog reads it when the countdown reaches zero; it does not reach into
 * a loop that is already playing, so a switch offered at that moment would look
 * like a way to silence the ringing and not be one. Reset is that, and Reset is
 * on the row below.
 */
function AlertSwitches({
  state,
  dark,
  tone,
}: {
  state: RoundTimerState;
  /**
   * Whether the sheet under this is black. It is exactly `!idle` in the panel
   * above, which is also what decides the sheet, so the two cannot disagree.
   */
  dark: boolean;
  /** The tone picker, ruled off inside the same box. Only before the start. */
  tone?: ReactNode;
}) {
  // The off-state icons are already a mid grey and the switch already carries
  // its own two colours, so only the box, the rules and the writing move.
  const ink = dark ? '#FFFFFF' : STEPPER_INK;
  const edge = dark ? 'border-white/25' : 'border-gray-200';
  const rule = dark ? 'border-white/15' : 'border-gray-100';

  return (
    <div className={`w-full max-w-sm rounded-xl border p-4 ${edge}`}>
      <p className="mb-1 text-sm font-bold" style={{ color: ink }}>
        When time is up
      </p>

      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          {state.soundOn ? (
            <VolumeUpIcon className="h-6 w-6 text-brand-teal" />
          ) : (
            <SilenceIcon className="h-6 w-6 text-gray-400" />
          )}
          <span className="font-bold" style={{ color: ink }}>
            Play Sound
          </span>
        </div>
        <Toggle checked={state.soundOn} onChange={setSoundOn} label="Play Sound" />
      </div>

      <div className={`flex items-center justify-between border-t py-2 ${rule}`}>
        <div className="flex items-center gap-3">
          {state.flashOn ? (
            <FlashIcon className="h-6 w-6 text-brand-teal" />
          ) : (
            <IphoneOutlineIcon className="h-6 w-6 text-gray-400" />
          )}
          <span className="font-bold" style={{ color: ink }}>
            Flash Screen
          </span>
        </div>
        <Toggle checked={state.flashOn} onChange={setFlashOn} label="Flash Screen" />
      </div>

      {tone && <div className={`border-t ${rule}`}>{tone}</div>}
    </div>
  );
}

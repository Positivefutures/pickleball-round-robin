import { useSyncExternalStore } from 'react';
import * as stores from '../../lib/stores';
import {
  timerPanelOpen, closeRoundTimerPanel, startTimer, stopTimer, resetTimer,
  setMinutes, setSoundOn, setFlashOn, setAlarmTone, liveRemainingMs,
  MINUTES_MIN, MINUTES_MAX, type RoundTimerState,
} from '../../lib/roundTimer';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { Toggle } from '../Toggle';
import { STEPPER_INK, STEPPER_KEY, STEPPER_VALUE } from '../stepperLook';
import { AlarmTonePicker } from './AlarmTonePicker';
import { TimerSheet } from './TimerSheet';
import {
  VolumeUpIcon, SilenceIcon, FlashIcon, IphoneOutlineIcon, PlayTriangleIcon, StopSquareIcon,
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
 * wins, so a stray tap on the X while it's ringing snaps the sheet right back
 * open on the next render. Only STOP TIMER, which actually leaves the
 * alarming phase, dismisses it for real.
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
  const counting = state.phase === 'running' || state.phase === 'alarming';

  return (
    <TimerSheet
      roundNumber={state.roundNumber}
      alarming={state.phase === 'alarming'}
      remainingMs={liveRemainingMs(state)}
      light={idle}
      flashOn={state.flashOn}
      onClose={closeRoundTimerPanel}
      config={idle ? <TimerConfig state={state} /> : undefined}
      actions={
        <>
          {/* One button until it has been started, two ever afterwards. STOP
              turns back into START in place rather than collapsing the row,
              so RESET stays where the thumb last found it. */}
          {idle ? (
            <StartButton />
          ) : (
            <div className="flex gap-3">
              {counting ? (
                <button
                  type="button"
                  onClick={stopTimer}
                  className={`${PAIRED} bg-red-600 hover:bg-red-700`}
                >
                  <StopSquareIcon className="h-5 w-5" />
                  STOP TIMER
                </button>
              ) : (
                <StartButton paired />
              )}
              <button
                type="button"
                onClick={resetTimer}
                className={`${PAIRED} bg-slate-600 hover:bg-slate-700`}
              >
                <ReplayIcon className="h-5 w-5" />
                RESET TIMER
              </button>
            </div>
          )}
          {!idle && (
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
 * One of two buttons sharing the width. `whitespace-nowrap` is the point of
 * having this in one place: on a narrow phone START TIMER is a hair wider than
 * STOP TIMER, and left to wrap it takes two lines while RESET beside it takes
 * one, so the row changes height the moment the timer is stopped.
 */
const PAIRED =
  'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-4 ' +
  'text-lg font-bold text-white transition-colors';

function StartButton({ paired = false }: { paired?: boolean }) {
  return (
    <button
      type="button"
      onClick={startTimer}
      className={
        paired
          ? `${PAIRED} bg-[#018D31] hover:bg-[#017129]`
          : 'flex w-full items-center justify-center gap-2 rounded-lg bg-[#018D31] px-6 py-4 text-xl font-bold text-white transition-colors hover:bg-[#017129]'
      }
    >
      <PlayTriangleIcon className={paired ? 'h-5 w-5' : 'h-6 w-6'} />
      START TIMER
    </button>
  );
}

/**
 * Everything that is only worth setting before the countdown starts: how long,
 * and what happens at the end of it. All of it is hidden rather than disabled
 * once the timer is running — none of it means anything mid-round, and a row of
 * greyed-out controls would be four things to read past to see the digits.
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

      <div className="w-full max-w-sm rounded-xl border border-gray-200 p-4">
        <p className="mb-1 text-sm font-bold" style={{ color: STEPPER_INK }}>
          When time is up
        </p>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            {state.soundOn ? (
              <VolumeUpIcon className="h-6 w-6 text-brand-teal" />
            ) : (
              <SilenceIcon className="h-6 w-6 text-gray-400" />
            )}
            <span className="font-bold" style={{ color: STEPPER_INK }}>
              Play Sound
            </span>
          </div>
          <Toggle checked={state.soundOn} onChange={setSoundOn} label="Play Sound" />
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 py-2">
          <div className="flex items-center gap-3">
            {state.flashOn ? (
              <FlashIcon className="h-6 w-6 text-brand-teal" />
            ) : (
              <IphoneOutlineIcon className="h-6 w-6 text-gray-400" />
            )}
            <span className="font-bold" style={{ color: STEPPER_INK }}>
              Flash Screen
            </span>
          </div>
          <Toggle checked={state.flashOn} onChange={setFlashOn} label="Flash Screen" />
        </div>

        <div className="border-t border-gray-100">
          <AlarmTonePicker value={state.alarmTone} onChange={setAlarmTone} />
        </div>
      </div>
    </>
  );
}

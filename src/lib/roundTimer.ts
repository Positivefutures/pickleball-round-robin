import * as stores from './stores';
import {
  startAlarmLoop, stopAlarmLoop, isAlarmLoopActive, warmUpAudio, type AlarmToneId,
} from './alarmSounds';
import {
  DEFAULT_ROUND_TIMER_STATE, MINUTES_MAX, MINUTES_MIN, type RoundTimerState,
} from './roundTimerState';

export type { AlarmToneId };

/**
 * One round timer for the whole app, because two hosts' phones aside, there is
 * only ever one round being timed at a court. Every read and write of the
 * stored state goes through this file.
 *
 * The shape and the defaults are next door in roundTimerState.ts, and re-exported
 * here so callers still have one timer module to import from. See that file for
 * why they cannot live here.
 */
export {
  DEFAULT_MINUTES,
  DEFAULT_ROUND_TIMER_STATE,
  MINUTES_MAX,
  MINUTES_MIN,
  type RoundTimerState,
  type TimerPhase,
} from './roundTimerState';

// ------------------------------------------------------ the panel's own flag --
// Whether the sheet is manually open. Deliberately not persisted alongside the
// rest of the state: a reload should land the host on whatever tab they
// reloaded to, not back inside the sheet. The panel's actual visibility is
// `manuallyOpen || phase === 'alarming'`, so an active alarm always wins
// regardless of this flag — see RoundTimerPanel.
let panelOpen = false;
const panelListeners = new Set<() => void>();

function setPanelOpen(next: boolean): void {
  if (next === panelOpen) return;
  panelOpen = next;
  for (const listener of panelListeners) listener();
}

/** Shaped for useSyncExternalStore, like liveStatusStore. */
export const timerPanelOpen = {
  get: (): boolean => panelOpen,
  subscribe(listener: () => void) {
    panelListeners.add(listener);
    return () => {
      panelListeners.delete(listener);
    };
  },
};

// ------------------------------------------------------------------ actions --

/**
 * Tapping a round's timer icon. Reopening the round already holding the timer
 * just shows it, whatever state it's in. Claiming an idle or never-opened slot
 * resets the countdown to that round's configured minutes. Reaching for a
 * *different* round while one is running, paused or alarming is refused —
 * only one timer runs across the whole app — and the caller is told which
 * round is holding it, to show the "stop that one first" message.
 */
export function openRoundTimer(roundNumber: number): {
  blocked: boolean;
  blockedByRound?: number;
} {
  const s = stores.roundTimer.get();

  if (s.roundNumber !== null && s.roundNumber !== roundNumber && s.phase !== 'idle') {
    return { blocked: true, blockedByRound: s.roundNumber };
  }

  if (s.roundNumber !== roundNumber) {
    stores.roundTimer.set({
      ...s,
      roundNumber,
      phase: 'idle',
      endsAt: null,
      remainingMs: s.minutes * 60_000,
    });
  }

  setPanelOpen(true);
  return { blocked: false };
}

/**
 * Closing the sheet, not stopping the timer — it keeps counting down (or
 * alarming) in the background. If it's alarming, the panel snaps itself back
 * open on the very next render (see RoundTimerPanel), so this is only a real
 * dismissal for an idle, running, or paused timer.
 */
export function closeRoundTimerPanel(): void {
  setPanelOpen(false);
}

/** Starting fresh (idle) begins at the full configured length; resuming from
 *  a pause continues from wherever it was frozen, not from the top. */
export function startTimer(): void {
  const s = stores.roundTimer.get();
  if (s.roundNumber === null || (s.phase !== 'idle' && s.phase !== 'paused')) return;

  // The user gesture that unlocks audio for the alarm the watchdog fires
  // later, with no gesture of its own. It also pulls the chosen tone down now,
  // minutes before the countdown could want it.
  warmUpAudio(s.alarmTone);

  const remaining = s.phase === 'paused' ? s.remainingMs : s.minutes * 60_000;
  stores.roundTimer.set({ ...s, phase: 'running', endsAt: Date.now() + remaining, remainingMs: remaining });
}

/** Pauses where it stands (or silences an active alarm) and freezes the time left. */
export function stopTimer(): void {
  const s = stores.roundTimer.get();
  if (s.phase !== 'running' && s.phase !== 'alarming') return;
  stopAlarmLoop();
  const remaining = s.phase === 'alarming' ? 0 : Math.max(0, (s.endsAt ?? Date.now()) - Date.now());
  stores.roundTimer.set({ ...s, phase: 'paused', endsAt: null, remainingMs: remaining });
}

/** Snaps back to the full configured length and stops — resetting while still
 *  counting down doesn't keep counting, it returns to a single START TIMER. */
export function resetTimer(): void {
  const s = stores.roundTimer.get();
  if (s.roundNumber === null) return;
  stopAlarmLoop();
  stores.roundTimer.set({ ...s, phase: 'idle', endsAt: null, remainingMs: s.minutes * 60_000 });
}

export function setMinutes(minutes: number): void {
  const clamped = Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(minutes)));
  const s = stores.roundTimer.get();
  stores.roundTimer.set({
    ...s,
    minutes: clamped,
    // Only while idle — a running or paused timer keeps the length it was
    // actually started with.
    remainingMs: s.phase === 'idle' ? clamped * 60_000 : s.remainingMs,
  });
}

export function setSoundOn(on: boolean): void {
  stores.roundTimer.set((s) => ({ ...s, soundOn: on }));
}

export function setFlashOn(on: boolean): void {
  stores.roundTimer.set((s) => ({ ...s, flashOn: on }));
}

export function setAlarmTone(tone: AlarmToneId): void {
  stores.roundTimer.set((s) => ({ ...s, alarmTone: tone }));
}

/**
 * Fully releases the global timer slot: silences any alarm, closes the panel,
 * and lets go of the round it was pinned to — but keeps the settings (minutes,
 * sound, flash, tone) standing as the defaults the next round timer opens
 * with, since those are a preference about how the host runs a court, not
 * about the one round that just finished.
 */
function release(): void {
  const s = stores.roundTimer.get();
  stopAlarmLoop();
  stores.roundTimer.set({
    ...DEFAULT_ROUND_TIMER_STATE,
    minutes: s.minutes,
    remainingMs: s.minutes * 60_000,
    soundOn: s.soundOn,
    flashOn: s.flashOn,
    alarmTone: s.alarmTone,
  });
  setPanelOpen(false);
}

/** The DONE-checkbox hook: a round marked complete has no more use for a
 *  countdown, so ticking it silently takes the timer away rather than
 *  leaving it running with no icon left to reach it by. */
export function stopAndResetIfRound(roundNumber: number): void {
  const s = stores.roundTimer.get();
  if (s.roundNumber === roundNumber && s.phase !== 'idle') release();
}

/** A new schedule replacing the old one leaves nothing for a pinned round
 *  number to point at — see the two call sites in App.tsx and groupSessions.ts. */
export function clearRoundTimerForNewSchedule(): void {
  const s = stores.roundTimer.get();
  if (s.roundNumber !== null) release();
}

/** How much time is left right now, computed fresh rather than trusted from a
 *  stale render — the one thing both the panel's digits and the watchdog agree on. */
export function liveRemainingMs(state: RoundTimerState, now = Date.now()): number {
  if (state.phase === 'running') return Math.max(0, (state.endsAt ?? now) - now);
  if (state.phase === 'alarming') return 0;
  return state.remainingMs;
}

/**
 * A time left, as the four places that show one write it: 12:00, 0:07.
 *
 * Rounded up rather than down, so a timer started at twelve minutes reads 12:00
 * and not 11:59, and the last second on screen is a whole second long instead of
 * a flicker.
 */
export function formatMMSS(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ------------------------------------------------------------- the watchdog --

/**
 * Runs every second, for as long as the app is open, regardless of which tab
 * is mounted — this is what lets the alarm fire after the host has left the
 * Schedule tab, and what makes a reload land on the correct remaining time
 * instead of whatever was last written to storage.
 */
function recompute(): void {
  const s = stores.roundTimer.get();

  if (s.phase === 'running' && s.endsAt !== null && Date.now() >= s.endsAt) {
    stores.roundTimer.set({ ...s, phase: 'alarming', endsAt: null, remainingMs: 0 });
    if (s.soundOn) startAlarmLoop(s.alarmTone);
    return;
  }

  // A reload landing mid-alarm keeps the persisted phase but loses the actual
  // JS-side sound loop — start it back up if it's still wanted.
  if (s.phase === 'alarming' && s.soundOn && !isAlarmLoopActive()) {
    startAlarmLoop(s.alarmTone);
  }

  // Backstop for a round that no longer exists under a claimed timer — a
  // removal or reshuffle can renumber the rounds behind the two explicit
  // clear points (Generate, New Round Robin), and this is what catches
  // whatever they don't.
  if (s.roundNumber !== null) {
    const schedule = stores.schedule.get();
    const stillExists = schedule?.rounds.some((r) => r.roundNumber === s.roundNumber) ?? false;
    if (!stillExists) clearRoundTimerForNewSchedule();
  }
}

let watchdogStarted = false;
let onVisible: (() => void) | null = null;

/** Started once from App.tsx, however many times it's asked — a second start
 *  would leave two visibility listeners and double-fire every check. */
export function startRoundTimerWatchdog(): void {
  if (watchdogStarted) return;
  watchdogStarted = true;
  recompute();
  setInterval(recompute, 1000);
  onVisible = () => {
    if (document.visibilityState === 'visible') recompute();
  };
  document.addEventListener('visibilitychange', onVisible);
}

/** Test seam, matching the one in appUpdate.ts and sync.ts. */
export const __testing = {
  recompute,
  reset(): void {
    watchdogStarted = false;
    panelOpen = false;
    panelListeners.clear();
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
  },
};

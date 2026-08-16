import type { AlarmToneId } from './alarmSounds';

/**
 * The shape of the round timer, and what it starts life as.
 *
 * Its own file purely to keep a cycle out of the graph. The store for it lives
 * in stores.ts and everything that reads or writes it lives in roundTimer.ts,
 * which needs the store — so roundTimer imports stores, and stores must not
 * import roundTimer back for the default it seeds the key with.
 *
 * It did once, and it worked for as long as something happened to load stores
 * first. The day a file reached roundTimer before it reached stores, the store
 * was created with `undefined` for its initial value and every page carrying a
 * round timer went down. Nothing enforces an import order, so nothing may
 * depend on one.
 *
 * roundTimer.ts re-exports both of these, so callers still have one place to
 * import the timer from.
 */

/**
 * `idle` is configured but not running, `running` is counting down, `paused` is
 * a running timer that was stopped mid-count (holding its frozen remaining
 * time), `alarming` is one that reached zero and has not been silenced yet.
 */
export type TimerPhase = 'idle' | 'running' | 'paused' | 'alarming';

export interface RoundTimerState {
  /** Which round this belongs to. null means nobody has opened the panel yet. */
  roundNumber: number | null;
  phase: TimerPhase;
  /** The configured length, 1-60. */
  minutes: number;
  /**
   * The absolute deadline, in ms since epoch. Set only while `running` — this
   * is what the countdown is actually measured against, never a number ticking
   * down on its own, so a background tab, a reload, or a phone that fell asleep
   * for ten minutes all land on the right answer the instant they're checked.
   */
  endsAt: number | null;
  /** The frozen time left, in ms. Authoritative while idle or paused; 0 while alarming. */
  remainingMs: number;
  soundOn: boolean;
  flashOn: boolean;
  alarmTone: AlarmToneId;
}

export const MINUTES_MIN = 1;
export const MINUTES_MAX = 60;
export const DEFAULT_MINUTES = 12;

export const DEFAULT_ROUND_TIMER_STATE: RoundTimerState = {
  roundNumber: null,
  phase: 'idle',
  minutes: DEFAULT_MINUTES,
  endsAt: null,
  remainingMs: DEFAULT_MINUTES * 60_000,
  soundOn: true,
  flashOn: true,
  alarmTone: 'bell',
};

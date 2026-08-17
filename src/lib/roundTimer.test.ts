/**
 * @vitest-environment happy-dom
 *
 * The controller: one timer for the whole app, an absolute deadline rather
 * than a decrementing counter, and the watchdog that notices the deadline has
 * passed whether or not anything is watching it live.
 *
 * alarmSounds is mocked throughout — happy-dom has no Web Audio, and this
 * file is only answering questions about the state machine, not the sound.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as stores from './stores';
import * as alarmSounds from './alarmSounds';
import type { Schedule } from '../types';
import {
  openRoundTimer, closeRoundTimerPanel, startTimer, stopTimer, resetTimer,
  stopAndResetIfRound, clearRoundTimerForNewSchedule, setMinutes,
  timerPanelOpen, liveRemainingMs, DEFAULT_ROUND_TIMER_STATE, __testing,
} from './roundTimer';

vi.mock('./alarmSounds', () => ({
  warmUpAudio: vi.fn(),
  startAlarmLoop: vi.fn(),
  stopAlarmLoop: vi.fn(),
  isAlarmLoopActive: vi.fn(() => false),
  // Not a function, but roundTimerState reads it for the default timer state,
  // which stores.ts seeds its key with before any of this runs.
  DEFAULT_ALARM_TONE: 'clear-announce',
}));

function scheduleWithRounds(...roundNumbers: number[]): Schedule {
  return {
    rounds: roundNumbers.map((n) => ({
      roundNumber: n, type: 'standard', courts: [], sitOuts: [],
    })),
  } as unknown as Schedule;
}

beforeEach(() => {
  window.localStorage.clear();
  __testing.reset();
  vi.clearAllMocks();
});

describe('openRoundTimer', () => {
  it('claims an idle slot and opens the panel', () => {
    const result = openRoundTimer(1);
    expect(result.blocked).toBe(false);
    expect(stores.roundTimer.get().roundNumber).toBe(1);
    expect(stores.roundTimer.get().phase).toBe('idle');
    expect(timerPanelOpen.get()).toBe(true);
  });

  it('reopens the same round in whatever phase it is in, without resetting it', () => {
    openRoundTimer(1);
    startTimer();
    closeRoundTimerPanel();

    const result = openRoundTimer(1);

    expect(result.blocked).toBe(false);
    expect(stores.roundTimer.get().phase).toBe('running');
    expect(timerPanelOpen.get()).toBe(true);
  });

  it('lets a different round claim the slot while the current one is idle', () => {
    openRoundTimer(1);

    const result = openRoundTimer(2);

    expect(result.blocked).toBe(false);
    expect(stores.roundTimer.get().roundNumber).toBe(2);
  });

  it('blocks a different round while the current one is running', () => {
    openRoundTimer(1);
    startTimer();

    const result = openRoundTimer(2);

    expect(result.blocked).toBe(true);
    expect(result.blockedByRound).toBe(1);
    expect(stores.roundTimer.get().roundNumber).toBe(1);
  });

  it('blocks a different round while the current one is paused', () => {
    openRoundTimer(1);
    startTimer();
    stopTimer();

    const result = openRoundTimer(2);

    expect(result.blocked).toBe(true);
    expect(result.blockedByRound).toBe(1);
  });
});

describe('start, stop, resume, reset', () => {
  it('starts at the full configured minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    openRoundTimer(1);
    setMinutes(5);

    startTimer();

    expect(stores.roundTimer.get().endsAt).toBe(1_000_000 + 5 * 60_000);
    vi.useRealTimers();
  });

  it('stop freezes the remaining time; the next start resumes from there, not from the top', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    openRoundTimer(1);
    setMinutes(5);
    startTimer();

    vi.setSystemTime(60_000); // one minute gone
    stopTimer();
    const paused = stores.roundTimer.get();
    expect(paused.phase).toBe('paused');
    expect(paused.remainingMs).toBe(4 * 60_000);
    expect(alarmSounds.stopAlarmLoop).toHaveBeenCalled();

    vi.setSystemTime(200_000);
    startTimer();
    expect(stores.roundTimer.get().endsAt).toBe(200_000 + 4 * 60_000);
    vi.useRealTimers();
  });

  it('reset snaps back to the full configured minutes and stops', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    openRoundTimer(1);
    setMinutes(5);
    startTimer();
    vi.setSystemTime(60_000);

    resetTimer();

    const state = stores.roundTimer.get();
    expect(state.phase).toBe('idle');
    expect(state.endsAt).toBeNull();
    expect(state.remainingMs).toBe(5 * 60_000);
    vi.useRealTimers();
  });

  it('setMinutes only changes the countdown while idle', () => {
    openRoundTimer(1);
    setMinutes(5);
    startTimer();

    setMinutes(9);

    const state = stores.roundTimer.get();
    expect(state.minutes).toBe(9);
    expect(state.remainingMs).toBe(5 * 60_000);
  });
});

describe('stopAndResetIfRound', () => {
  it('releases the timer when it belongs to the given round and is not idle', () => {
    openRoundTimer(1);
    startTimer();

    stopAndResetIfRound(1);

    const state = stores.roundTimer.get();
    expect(state.roundNumber).toBeNull();
    expect(state.phase).toBe('idle');
    expect(timerPanelOpen.get()).toBe(false);
    expect(alarmSounds.stopAlarmLoop).toHaveBeenCalled();
  });

  it('does nothing for a different round', () => {
    openRoundTimer(1);
    startTimer();

    stopAndResetIfRound(2);

    expect(stores.roundTimer.get().roundNumber).toBe(1);
    expect(stores.roundTimer.get().phase).toBe('running');
  });

  it('does nothing when the round is already idle', () => {
    openRoundTimer(1);

    stopAndResetIfRound(1);

    expect(stores.roundTimer.get().roundNumber).toBe(1);
  });

  it('keeps the settings standing as defaults for the next round', () => {
    openRoundTimer(1);
    setMinutes(20);
    startTimer();

    stopAndResetIfRound(1);

    expect(stores.roundTimer.get().minutes).toBe(20);
  });
});

describe('clearRoundTimerForNewSchedule', () => {
  it('releases whatever round it was pinned to', () => {
    openRoundTimer(3);
    startTimer();

    clearRoundTimerForNewSchedule();

    expect(stores.roundTimer.get().roundNumber).toBeNull();
    expect(timerPanelOpen.get()).toBe(false);
  });

  it('does nothing when nothing has ever been opened', () => {
    clearRoundTimerForNewSchedule();
    expect(stores.roundTimer.get().roundNumber).toBeNull();
  });
});

describe('liveRemainingMs', () => {
  it('counts down from endsAt while running', () => {
    const state = { ...stores.roundTimer.get(), phase: 'running' as const, endsAt: 10_000 };
    expect(liveRemainingMs(state, 4_000)).toBe(6_000);
  });

  it('never goes negative once the deadline has passed', () => {
    const state = { ...stores.roundTimer.get(), phase: 'running' as const, endsAt: 10_000 };
    expect(liveRemainingMs(state, 20_000)).toBe(0);
  });

  it('is zero while alarming', () => {
    const state = { ...stores.roundTimer.get(), phase: 'alarming' as const, endsAt: null };
    expect(liveRemainingMs(state, 4_000)).toBe(0);
  });
});

describe('the watchdog', () => {
  it('flips a running timer past its deadline to alarming, and starts the sound if wanted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    openRoundTimer(1);
    setMinutes(1);
    startTimer();

    vi.setSystemTime(61_000);
    __testing.recompute();

    expect(stores.roundTimer.get().phase).toBe('alarming');
    expect(alarmSounds.startAlarmLoop).toHaveBeenCalledWith(DEFAULT_ROUND_TIMER_STATE.alarmTone);
    vi.useRealTimers();
  });

  it('leaves sound off when Play Sound was off', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    openRoundTimer(1);
    setMinutes(1);
    stores.roundTimer.set((s) => ({ ...s, soundOn: false }));
    startTimer();

    vi.setSystemTime(61_000);
    __testing.recompute();

    expect(stores.roundTimer.get().phase).toBe('alarming');
    expect(alarmSounds.startAlarmLoop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('restarts a dropped alarm loop after a reload lands mid-alarm', () => {
    openRoundTimer(1);
    stores.roundTimer.set((s) => ({ ...s, phase: 'alarming', endsAt: null, remainingMs: 0 }));
    vi.mocked(alarmSounds.isAlarmLoopActive).mockReturnValue(false);

    __testing.recompute();

    expect(alarmSounds.startAlarmLoop).toHaveBeenCalledWith(DEFAULT_ROUND_TIMER_STATE.alarmTone);
  });

  it('releases a timer pinned to a round the schedule no longer has', () => {
    stores.schedule.set(scheduleWithRounds(1, 2));
    openRoundTimer(3);

    __testing.recompute();

    expect(stores.roundTimer.get().roundNumber).toBeNull();
  });

  it('leaves a timer alone when its round still exists', () => {
    stores.schedule.set(scheduleWithRounds(1, 2));
    openRoundTimer(2);

    __testing.recompute();

    expect(stores.roundTimer.get().roundNumber).toBe(2);
  });
});

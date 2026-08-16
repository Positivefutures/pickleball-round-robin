/**
 * The round timer's store survives being reached from the timer's own side.
 *
 * This looks like a test of nothing until you know what it caught. The defaults
 * used to live in roundTimer.ts, which imports stores.ts, which imported the
 * defaults back out of roundTimer.ts. A cycle like that resolves whichever way
 * the graph happens to be walked: reach stores first and everything works;
 * reach the timer first and stores.roundTimer is created with `undefined` for
 * its initial value, and every page carrying a round timer dies on the first
 * read of it.
 *
 * Nothing about that is visible in either file, and it stayed hidden for a
 * release because every path into the app happened to touch stores first.
 * Removing one unrelated import from SchedulePage was enough to flip it.
 *
 * So the import below is the test. It must stay first, and it must stay a
 * side-effect import of the timer rather than of the store.
 */
import '../lib/roundTimer';
import { describe, it, expect } from 'vitest';
import * as stores from './stores';
import { DEFAULT_ROUND_TIMER_STATE } from './roundTimerState';

describe('the round timer store, reached through the timer first', () => {
  it('holds a real state rather than undefined', () => {
    const state = stores.roundTimer.get();

    expect(state).toBeDefined();
    expect(state.phase).toBe('idle');
    expect(state.roundNumber).toBeNull();
    expect(state.minutes).toBe(DEFAULT_ROUND_TIMER_STATE.minutes);
  });

  it('gives the defaults a length somebody could actually play a round in', () => {
    expect(DEFAULT_ROUND_TIMER_STATE.remainingMs).toBe(
      DEFAULT_ROUND_TIMER_STATE.minutes * 60_000
    );
  });
});

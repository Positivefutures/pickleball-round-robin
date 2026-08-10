/**
 * Naming the courts.
 *
 * The rule the host was promised: a change is made at a round and runs from
 * there to the end of the schedule. It never reaches back, and it never touches
 * a round already played, wherever that round happens to sit. Change round 5
 * and rounds 5 to 8 follow. Change round 3 afterwards and rounds 3 to 8 follow,
 * including the ones round 5 had already named.
 */
import { describe, it, expect } from 'vitest';
import type { Player, Round } from '../types';
import { MAX_COURT_NUMBER, carryCourtNumbers, parseCourtNumber, renumberFrom } from './courtNumbers';

const players: Player[] = ['Ava', 'Ben', 'Cara', 'Dan'].map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 3.5,
  gender: i % 2 === 0 ? 'M' : 'F',
  rosterIds: ['g1'],
}));

/** A schedule of `count` rounds, each with `courts` courts numbered from 1. */
function schedule(count: number, courts = 2): Round[] {
  return Array.from({ length: count }, (_, r) => ({
    roundNumber: r + 1,
    courts: Array.from({ length: courts }, (_, c) => ({
      courtNumber: c + 1,
      team1: [players[0], players[1]],
      team2: [players[2], players[3]],
      ratingDiff: 0,
    })),
    sitOuts: [],
  }));
}

/** What each round calls the court at `courtIdx`. */
function numbers(rounds: Round[], courtIdx = 0): number[] {
  return rounds.map((r) => r.courts[courtIdx].courtNumber);
}

describe('renaming a court', () => {
  it('names the round it was done at, and every round after it', () => {
    const after = renumberFrom(schedule(6), 4, 0, 7, []);
    expect(numbers(after)).toEqual([1, 1, 1, 1, 7, 7]);
  });

  it('leaves the rounds already behind it alone', () => {
    // Rounds 1 to 4 were called out as court 1 and played as court 1.
    const after = renumberFrom(schedule(6), 4, 0, 7, []);
    expect(numbers(after).slice(0, 4)).toEqual([1, 1, 1, 1]);
  });

  it('steps over a completed round further down the schedule', () => {
    // Rounds can be ticked off in any order, so a finished one can sit ahead of
    // an unfinished one. A finished round is a record of what was played.
    const after = renumberFrom(schedule(6), 2, 0, 7, [5]);
    expect(numbers(after)).toEqual([1, 1, 7, 7, 1, 7]);
  });

  it('lets a change made at an earlier round paint through a later one', () => {
    // Jeff's case. Courts move at round 5, then it turns out they moved at
    // round 3, and the second answer is the one that stands from there on.
    const atFive = renumberFrom(schedule(6), 4, 0, 7, []);
    const atThree = renumberFrom(atFive, 2, 0, 9, []);
    expect(numbers(atThree)).toEqual([1, 1, 9, 9, 9, 9]);
  });

  it('leaves the other courts in the round where they are', () => {
    const after = renumberFrom(schedule(3), 0, 0, 7, []);
    expect(numbers(after, 1)).toEqual([2, 2, 2]);
  });

  it('does not invent a court that is not there', () => {
    // Fewer courts in play than the index asked for, which is what a removal
    // leaves behind.
    const after = renumberFrom(schedule(3, 2), 0, 5, 7, []);
    expect(after.every((r) => r.courts.length === 2)).toBe(true);
    expect(numbers(after)).toEqual([1, 1, 1]);
  });
});

describe('what may be typed in the box', () => {
  it('takes a plain court number', () => {
    expect(parseCourtNumber('7')).toBe(7);
    expect(parseCourtNumber(' 12 ')).toBe(12);
  });

  it('refuses anything that is not a whole number of courts', () => {
    // Silently reading "7a" as 7 would rename a court to something nobody asked
    // for, and an empty box is a half-finished edit rather than a value.
    for (const bad of ['', '  ', '7a', 'a7', '-3', '3.5', '+7']) {
      expect(parseCourtNumber(bad)).toBeNull();
    }
  });

  it('refuses a number no court could have', () => {
    expect(parseCourtNumber('0')).toBeNull();
    expect(parseCourtNumber(String(MAX_COURT_NUMBER + 1))).toBeNull();
    expect(parseCourtNumber(String(MAX_COURT_NUMBER))).toBe(MAX_COURT_NUMBER);
  });
});

describe('a rebuild of the remaining rounds', () => {
  it('keeps the names the host gave the courts', () => {
    // Reshuffle and Remove Player both throw the unplayed rounds away and build
    // them again, numbered from 1. The court itself has not moved.
    const named = renumberFrom(schedule(4), 0, 0, 7, []);
    const rebuilt = schedule(4); // as the generator hands it back
    expect(numbers(carryCourtNumbers(named, rebuilt))).toEqual([7, 7, 7, 7]);
  });

  it('leaves a court that had no counterpart with the number it was given', () => {
    // A player coming back can widen a round from two courts to three. There is
    // nothing behind the third one to copy.
    const named = renumberFrom(schedule(2, 2), 0, 0, 7, []);
    const wider = carryCourtNumbers(named, schedule(2, 3));
    expect(wider.map((r) => r.courts.map((c) => c.courtNumber))).toEqual([
      [7, 2, 3],
      [7, 2, 3],
    ]);
  });

  it('copes with a rebuild that is longer than what came before', () => {
    expect(numbers(carryCourtNumbers(schedule(1), schedule(3)))).toEqual([1, 1, 1]);
  });
});

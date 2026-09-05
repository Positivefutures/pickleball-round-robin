/**
 * Dealing the courts out, after the groups are chosen.
 *
 * The first test is the one that matters most: this returns the same games in a
 * different order and nothing else. That is the whole argument for doing it here
 * rather than as a term in the cost function — court variety cannot be bought
 * with a worse match, because there is no match this could change.
 */
import { describe, it, expect } from 'vitest';
import { rotateCourts } from './courtRotation';
import type { CourtAssignment, PairingHistory, Player } from '../types';

function player(id: string): Player {
  return { id, name: id, rating: 3.5, gender: 'F', rosterIds: ['g1'] };
}

/** A court of four, named by its players so a permutation is readable. */
function court(courtNumber: number, ids: string[]): CourtAssignment {
  return {
    courtNumber,
    team1: [player(ids[0]), player(ids[1])],
    team2: [player(ids[2]), player(ids[3])],
    ratingDiff: 0,
  };
}

function emptyHistory(): PairingHistory {
  return {
    partnerCounts: {},
    opponentCounts: {},
    sitOutCounts: {},
    sitOutOrder: [],
    roundsRecorded: 0,
    lastPartneredRound: {},
    gamesPlayed: {},
    shortGameCounts: {},
    courtCounts: {},
    specialMissCounts: { gendered: {}, mixed: {}, skill: {} },
    teamMatchCounts: {},
    serveCounts: {},
  };
}

/** `courtCounts` as if these players had already played that many games there. */
function history(counts: Record<string, Record<number, number>>): PairingHistory {
  return { ...emptyHistory(), courtCounts: counts };
}

/** Who is on each court, in order, so a reordering is easy to state. */
const lineup = (courts: CourtAssignment[]) =>
  courts.map((c) => [...c.team1, ...c.team2].map((p) => p.id).join(''));

describe('rotateCourts', () => {
  it('returns the same games, only in a different order', () => {
    // The invariant the whole design rests on. Whatever this does to the order,
    // every group of four that went in comes out together and unchanged.
    const courts = [court(1, ['a', 'b', 'c', 'd']), court(2, ['e', 'f', 'g', 'h'])];
    const rotated = rotateCourts(
      courts,
      history({ a: { 0: 3 }, b: { 0: 3 }, c: { 0: 3 }, d: { 0: 3 } })
    );

    expect(lineup(rotated).sort()).toEqual(lineup(courts).sort());
    for (const c of rotated) {
      const same = courts.find((o) => lineup([o])[0] === lineup([c])[0])!;
      expect(c.team1.map((p) => p.id)).toEqual(same.team1.map((p) => p.id));
      expect(c.team2.map((p) => p.id)).toEqual(same.team2.map((p) => p.id));
      expect(c.ratingDiff).toBe(same.ratingDiff);
    }
  });

  it('moves a group off the court it has been living on', () => {
    // The reported bug in one round: abcd have played court one three times and
    // efgh have never been there.
    const courts = [court(1, ['a', 'b', 'c', 'd']), court(2, ['e', 'f', 'g', 'h'])];
    const rotated = rotateCourts(
      courts,
      history({ a: { 0: 3 }, b: { 0: 3 }, c: { 0: 3 }, d: { 0: 3 } })
    );

    expect(lineup(rotated)).toEqual(['efgh', 'abcd']);
  });

  it('numbers the courts by where they end up', () => {
    const rotated = rotateCourts(
      [court(1, ['a', 'b', 'c', 'd']), court(2, ['e', 'f', 'g', 'h'])],
      history({ a: { 0: 3 }, b: { 0: 3 }, c: { 0: 3 }, d: { 0: 3 } })
    );
    expect(rotated.map((c) => c.courtNumber)).toEqual([1, 2]);
    // The group that moved took the number of the position, not its own.
    expect(lineup(rotated)[0]).toBe('efgh');
  });

  it('leaves the order alone when nothing has been played yet', () => {
    // Round one. Every arrangement costs the same, and a tie keeps what came
    // in, so the first round of a schedule is exactly what the solver built.
    const courts = [
      court(1, ['a', 'b', 'c', 'd']),
      court(2, ['e', 'f', 'g', 'h']),
      court(3, ['i', 'j', 'k', 'l']),
    ];
    expect(lineup(rotateCourts(courts, emptyHistory()))).toEqual(lineup(courts));
  });

  it('keeps the short court last', () => {
    // planCourtSizes puts the 2v1 on the last court and addCourtToRemaining
    // appends after it. Who gets a short game is rotated by shortGameCounts,
    // not by this.
    const short: CourtAssignment = {
      courtNumber: 3,
      team1: [player('y'), player('z')],
      team2: [player('x')],
      ratingDiff: 0,
    };
    const courts = [court(1, ['a', 'b', 'c', 'd']), court(2, ['e', 'f', 'g', 'h']), short];
    const rotated = rotateCourts(
      courts,
      history({ a: { 0: 3 }, b: { 0: 3 }, c: { 0: 3 }, d: { 0: 3 } })
    );

    expect(lineup(rotated)).toEqual(['efgh', 'abcd', 'yzx']);
    expect(rotated[2].courtNumber).toBe(3);
  });

  it('leaves a padlocked round exactly as the host pinned it', () => {
    // A lock names a court by position. Moving it afterwards would quietly undo
    // the one thing the host did by hand.
    const courts = [court(1, ['a', 'b', 'c', 'd']), court(2, ['e', 'f', 'g', 'h'])];
    const rotated = rotateCourts(
      courts,
      history({ a: { 0: 3 }, b: { 0: 3 }, c: { 0: 3 }, d: { 0: 3 } }),
      { pinned: true }
    );
    expect(lineup(rotated)).toEqual(lineup(courts));
  });

  it('weighs how often somebody has been there, not how many of them have', () => {
    // Squares, not a repeat count, and this is where the two disagree. On court
    // one: `a` has played there five times and nobody else on that group has;
    // on the other group, `e` and `f` have played there once each.
    //
    // Counting repeats makes the first group look cheaper — one player repeats
    // rather than two — and leaves `a` there for a sixth game. Summing squares
    // says a sixth game for one person costs more than a second game for two,
    // which is the thing that actually reads as unfair on the night.
    const courts = [court(1, ['a', 'b', 'c', 'd']), court(2, ['e', 'f', 'g', 'h'])];
    const rotated = rotateCourts(
      courts,
      history({ a: { 0: 5 }, e: { 0: 1 }, f: { 0: 1 } })
    );

    expect(lineup(rotated)[0]).toBe('efgh');
    expect(lineup(rotated)[1]).toBe('abcd');
  });

  it('keeps the courts a special round could not fill at the end', () => {
    // Fifteen on a gendered night make three gendered courts and one that could
    // not be. combine() puts the ones that could not be last, and the card
    // under them reads "Unable to make last game gendered" — so last is where
    // they stay. Who misses the format is rotated by specialMissCounts.
    const courts = [
      court(1, ['a', 'b', 'c', 'd']),
      court(2, ['e', 'f', 'g', 'h']),
      court(3, ['i', 'j', 'k', 'l']),
    ];
    // ijkl are the ones stuck on court three, so they are exactly the group
    // this would move if it were allowed to — which is what makes the pin
    // worth asserting rather than something that happened not to come up.
    const stuck = { 2: 4 };
    const counts = {
      i: stuck, j: stuck, k: stuck, l: stuck,
      a: { 0: 2 }, b: { 0: 2 }, c: { 0: 2 }, d: { 0: 2 },
    };

    expect(lineup(rotateCourts(courts, history(counts), { keepFrom: 2 })))
      .toEqual(['efgh', 'abcd', 'ijkl']);

    // Unpinned, the same history moves them off it.
    expect(lineup(rotateCourts(courts, history(counts)))[2]).not.toBe('ijkl');
  });

  it('has nothing to do with one court', () => {
    const courts = [court(1, ['a', 'b', 'c', 'd'])];
    expect(rotateCourts(courts, history({ a: { 0: 9 } }))).toEqual(courts);
  });
});

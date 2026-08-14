import { describe, it, expect } from 'vitest';
import { partnerRepeatCost, scoreCourt } from './scoring';
import { partnerKey } from './partnerships';
import type { CourtAssignment, PairingHistory, Player } from '../types';

function player(id: string, gender: Player['gender'], rating = 3.5): Player {
  return { id, name: id, rating, gender };
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
    specialMissCounts: { gendered: {}, mixed: {}, skill: {} },
    teamMatchCounts: {},
  };
}

function court(team1: Player[], team2: Player[]): CourtAssignment {
  return { courtNumber: 1, team1, team2, ratingDiff: 0 };
}

describe('the gender shape of a court', () => {
  // Everybody rated the same and nobody has met, so the only difference
  // between these courts is their shape. Three men and a woman is the least
  // liked game, three women and a man is next, and a gendered or mixed court
  // costs nothing either way.
  it('fines three men and a woman hardest, and even shapes not at all', () => {
    const h = emptyHistory();
    const m = [player('m1', 'M'), player('m2', 'M'), player('m3', 'M'), player('m4', 'M')];
    const w = [player('w1', 'F'), player('w2', 'F'), player('w3', 'F'), player('w4', 'F')];

    const allMen = scoreCourt(court([m[0], m[1]], [m[2], m[3]]), h);
    const allWomen = scoreCourt(court([w[0], w[1]], [w[2], w[3]]), h);
    const twoAndTwo = scoreCourt(court([m[0], w[0]], [m[1], w[1]]), h);
    const threeMen = scoreCourt(court([m[0], m[1]], [m[2], w[0]]), h);
    const threeWomen = scoreCourt(court([w[0], w[1]], [w[2], m[0]]), h);

    expect(allMen).toBe(allWomen);
    expect(allMen).toBe(twoAndTwo);
    expect(threeWomen).toBeGreaterThan(twoAndTwo);
    expect(threeMen).toBeGreaterThan(threeWomen);
  });
});

describe('the price of a repeat partnership', () => {
  // The whole reason lastPartneredRound exists: a cumulative count cannot
  // tell rounds 8 and 9 from rounds 1 and 9. The cost function can, and the
  // court score moves with it.
  it('fines a recent repeat harder than an old one', () => {
    const recent = emptyHistory();
    recent.roundsRecorded = 8;
    recent.partnerCounts = { a: { b: 1 }, b: { a: 1 } };
    recent.lastPartneredRound[partnerKey('a', 'b')] = 8; // last round

    const old = emptyHistory();
    old.roundsRecorded = 8;
    old.partnerCounts = { a: { b: 1 }, b: { a: 1 } };
    old.lastPartneredRound[partnerKey('a', 'b')] = 1; // seven rounds back

    expect(partnerRepeatCost(recent, 'a', 'b')).toBeGreaterThan(partnerRepeatCost(old, 'a', 'b'));

    const four = [player('a', 'M'), player('b', 'F'), player('c', 'M'), player('d', 'F')];
    const pairAB = court([four[0], four[1]], [four[2], four[3]]);
    expect(scoreCourt(pairAB, recent)).toBeGreaterThan(scoreCourt(pairAB, old));
  });

  it('costs nothing for a pair that has never partnered', () => {
    expect(partnerRepeatCost(emptyHistory(), 'a', 'b')).toBe(0);
  });
});

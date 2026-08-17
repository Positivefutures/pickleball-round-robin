/**
 * Courts the roster cannot fill.
 *
 * The app used to refuse: sixteen players or no fourth court. Fifteen people who
 * had all turned up were told to go away and think about it, which is not a
 * thing a host wants to explain at a court. Now the last court plays whoever is
 * left — three of them as a 2v1, two as a game of singles — and only a court
 * with one person on it is still refused, because that is not a game.
 *
 * The generator is random, so anything about who lands where is measured across
 * a run of schedules rather than asserted off one. See `pairing.test.ts` for the
 * same rule applied to partner variety.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule, regenerateRemaining } from './pairing';
import {
  chooseShortCourtPlayers,
  minPlayersForCourts,
  pickShortSplit,
  planCourtSizes,
} from './assign';
import { courtMatchesType } from './roundTypes';
import { PLAN_SLOTS } from './roundPlan';
import { partnerKey } from './partnerships';
import { courtRatingDiff } from '../utils/helpers';
import type { PairingHistory, Player, Round, RoundPlan, RoundType } from '../types';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    rating: 3.0 + (i % 5) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  }));
}

const sizesOf = (round: Round) =>
  round.courts.map((c) => c.team1.length + c.team2.length);

const onCourt = (round: Round) => round.courts.flatMap((c) => [...c.team1, ...c.team2]);

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

describe('planCourtSizes', () => {
  it('gives the last court whatever is left, down to two', () => {
    expect(planCourtSizes(16, 4)).toEqual([4, 4, 4, 4]);
    expect(planCourtSizes(15, 4)).toEqual([4, 4, 4, 3]);
    expect(planCourtSizes(14, 4)).toEqual([4, 4, 4, 2]);
  });

  it('will not put one person on a court alone', () => {
    // The thirteenth would be standing there by themselves, so the fourth court
    // goes unused and they sit out with everyone else who is spare.
    expect(planCourtSizes(13, 4)).toEqual([4, 4, 4]);
  });

  it('sits the spare players down once every court is full', () => {
    // 17 over 4 courts is not two short of five courts, it is one over four.
    expect(planCourtSizes(17, 4)).toEqual([4, 4, 4, 4]);
    expect(planCourtSizes(23, 4)).toEqual([4, 4, 4, 4]);
  });
});

describe('minPlayersForCourts', () => {
  it('asks for two fewer than a full set', () => {
    expect(minPlayersForCourts(2)).toBe(6);
    expect(minPlayersForCourts(3)).toBe(10);
    expect(minPlayersForCourts(4)).toBe(14);
  });

  it('still wants a full four on one court', () => {
    // Dropping the floor here would let the app build ten rounds for two people.
    expect(minPlayersForCourts(1)).toBe(4);
  });

  it('is exactly the point at which every court gets a game', () => {
    // From two courts up, where the floor is the geometry rather than the
    // product decision above.
    for (let courts = 2; courts <= 8; courts++) {
      const min = minPlayersForCourts(courts);
      expect(planCourtSizes(min, courts)).toHaveLength(courts);
      expect(planCourtSizes(min - 1, courts).length).toBeLessThan(courts);
    }
  });
});

describe('pickShortSplit', () => {
  const strong = { id: 'a', name: 'A', rating: 5.0, gender: 'M', rosterIds: [] } as Player;
  const mid = { id: 'b', name: 'B', rating: 3.5, gender: 'F', rosterIds: [] } as Player;
  const weak = { id: 'c', name: 'C', rating: 3.0, gender: 'M', rosterIds: [] } as Player;

  it('puts the strongest player on their own against the other two', () => {
    const court = pickShortSplit([mid, strong, weak], 4);
    expect(court.team2.map((p) => p.id)).toEqual(['a']);
    expect(court.team1.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('keeps a couple together even when the ratings say otherwise', () => {
    // Set Partners outranks the rating: strong and mid are a couple, so they
    // take the pair side and the third player goes alone despite being weakest.
    const keys = new Set([partnerKey('a', 'b')]);
    const court = pickShortSplit([strong, mid, weak], 4, keys);
    expect(court.team1.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(court.team2.map((p) => p.id)).toEqual(['c']);
  });

  it('makes two players a game of singles, one a side', () => {
    const court = pickShortSplit([strong, weak], 4);
    expect(court.team1).toHaveLength(1);
    expect(court.team2).toHaveLength(1);
  });
});

describe('courtRatingDiff', () => {
  const at = (...ratings: number[]) => ratings.map((rating) => ({ rating }));

  it('adds up each side when the sides are even', () => {
    // 2v2 and 1v1 both work this way, and always have.
    expect(courtRatingDiff(at(3.5, 4.0), at(3.5, 3.5))).toBeCloseTo(0.5);
    expect(courtRatingDiff(at(3.5), at(4.0))).toBeCloseTo(0.5);
  });

  it('averages a 2v1, so it reads on the same scale as every other court', () => {
    // Ben 3.8 and Cara 4.0 average 3.9, against Dan on 4.3.
    expect(courtRatingDiff(at(3.8, 4.0), at(4.3))).toBeCloseTo(0.4);
  });

  it('does not report a close 2v1 as a chasm', () => {
    // Added up this is 3.5, which is not a measure of anything: it is just what
    // two ratings do next to one. It also blew straight through the solver's
    // 0.5 cap, fining every short court hundreds of points.
    const summed = Math.abs(3.8 + 4.0 - 4.3);
    expect(summed).toBeGreaterThan(3);
    expect(courtRatingDiff(at(3.8, 4.0), at(4.3))).toBeLessThan(0.5);
  });
});

describe('generateSchedule with a roster that will not divide by four', () => {
  it('plays fifteen over four courts, with nobody sitting out', () => {
    const s = generateSchedule(makePlayers(15), 4, 6);
    for (const r of s.rounds) {
      expect(sizesOf(r)).toEqual([4, 4, 4, 3]);
      expect(r.sitOuts).toHaveLength(0);
      expect(onCourt(r)).toHaveLength(15);
    }
  });

  it('plays fourteen over four courts, the last as singles', () => {
    const s = generateSchedule(makePlayers(14), 4, 6);
    for (const r of s.rounds) {
      expect(sizesOf(r)).toEqual([4, 4, 4, 2]);
      expect(r.sitOuts).toHaveLength(0);
    }
  });

  it('never repeats a player inside a round', () => {
    const s = generateSchedule(makePlayers(15), 4, 6);
    for (const r of s.rounds) {
      const ids = [...onCourt(r), ...r.sitOuts].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('gives the short court the last number, so it reads last on the sheet', () => {
    const s = generateSchedule(makePlayers(15), 4, 4);
    for (const r of s.rounds) {
      expect(r.courts[3].courtNumber).toBe(4);
      expect(r.courts[3].team1.length + r.courts[3].team2.length).toBe(3);
    }
  });

  it('keeps the short court to a 2v1 with a single on the receiving side', () => {
    const s = generateSchedule(makePlayers(15), 4, 6);
    for (const r of s.rounds) {
      const short = r.courts[3];
      expect(short.team1).toHaveLength(2);
      expect(short.team2).toHaveLength(1);
    }
  });
});

/**
 * Fifteen players over four courts means three of them play a 2v1 every round.
 * Over nine rounds that is 27 turns across 15 people, so one or two each is a
 * perfect share and the spread between the busiest and the idlest should be 1.
 *
 * Measured before it was asserted: across 165 schedules at five different roster
 * and court combinations the spread was 1 every single time, never higher. The
 * bound is set at 2 to leave the random tie-breaks room. Take the rotation out
 * and this runs at 4 and up, which is what it is here to catch.
 */
describe('the short game rotates', () => {
  it('spreads the 2v1 around instead of parking it on the same three', () => {
    let worst = 0;
    for (let run = 0; run < 12; run++) {
      const players = makePlayers(15);
      const s = generateSchedule(players, 4, 9);
      const counts = new Map(players.map((p) => [p.id, 0]));
      for (const r of s.rounds) {
        for (const c of r.courts) {
          const size = c.team1.length + c.team2.length;
          if (size === 4) continue;
          for (const p of [...c.team1, ...c.team2]) {
            counts.set(p.id, counts.get(p.id)! + 1);
          }
        }
      }
      const vals = [...counts.values()];
      worst = Math.max(worst, Math.max(...vals) - Math.min(...vals));
    }
    expect(worst).toBeLessThanOrEqual(2);
  }, 20000); // twelve full schedules of the heaviest config outgrow the 5s default

  it('carries the count across a reshuffle rather than starting over', () => {
    // Rounds 1 to 4 are played, then the rest are rebuilt. The rebuild replays
    // the completed rounds, so whoever already had their 2v1 is not first in
    // line for another one.
    const players = makePlayers(15);
    let worst = 0;
    for (let run = 0; run < 8; run++) {
      const original = generateSchedule(players, 4, 9);
      const regen = regenerateRemaining(players, 4, original.rounds, [1, 2, 3, 4]);
      const counts = new Map(players.map((p) => [p.id, 0]));
      for (const r of regen.rounds) {
        for (const c of r.courts) {
          if (c.team1.length + c.team2.length === 4) continue;
          for (const p of [...c.team1, ...c.team2]) {
            counts.set(p.id, counts.get(p.id)! + 1);
          }
        }
      }
      const vals = [...counts.values()];
      worst = Math.max(worst, Math.max(...vals) - Math.min(...vals));
    }
    expect(worst).toBeLessThanOrEqual(2);
  }, 20000); // eight generate-and-reshuffle passes of the same heavy config
});

describe('a short court on a special round', () => {
  const everyRound = (type: RoundType): RoundPlan =>
    Array<RoundType | null>(PLAN_SLOTS).fill(type);

  it('plays an ordinary game and is marked as one', () => {
    for (const type of ['gendered', 'mixed', 'skill'] as const) {
      const s = generateSchedule(makePlayers(15), 4, 4, everyRound(type));
      for (const r of s.rounds) {
        const short = r.courts.find((c) => c.team1.length + c.team2.length < 4);
        expect(short).toBeDefined();
        // What drives the "Normal game" badge on the schedule, the printed sheet
        // and the PDF alike. A 2v1 is not the format whatever its makeup.
        expect(courtMatchesType(short!, type)).toBe(false);
      }
    }
  });

  it('still fills the full courts with the format', () => {
    const s = generateSchedule(makePlayers(15), 4, 4, everyRound('mixed'));
    for (const r of s.rounds) {
      const full = r.courts.filter((c) => c.team1.length + c.team2.length === 4);
      expect(full).toHaveLength(3);
      expect(full.every((c) => courtMatchesType(c, 'mixed'))).toBe(true);
    }
  });
});

describe('chooseShortCourtPlayers', () => {
  it('takes whoever has had fewest short games', () => {
    const players = makePlayers(6);
    const history = emptyHistory();
    // Everyone has had one except the last two.
    for (const p of players.slice(0, 4)) history.shortGameCounts[p.id] = 1;
    const chosen = chooseShortCourtPlayers(players, 2, history);
    expect(chosen.map((p) => p.id).sort()).toEqual(['p4', 'p5']);
  });

  it('moves a couple onto a 2v1 as one, so they get the pair side', () => {
    const players = makePlayers(6);
    const history = emptyHistory();
    for (const p of players.slice(0, 3)) history.shortGameCounts[p.id] = 5;
    const chosen = chooseShortCourtPlayers(players, 3, history, [
      { player1Id: 'p3', player2Id: 'p4' },
    ]);
    const ids = chosen.map((p) => p.id).sort();
    expect(ids).toContain('p3');
    expect(ids).toContain('p4');
    expect(chosen).toHaveLength(3);
  });

  it('leaves couples out of a game of singles, which would face them off', () => {
    const players = makePlayers(4);
    const history = emptyHistory();
    // p0 and p1 are a couple and have had fewest, but a court of two has no
    // team to keep them on, so the two singles go instead.
    history.shortGameCounts.p2 = 3;
    history.shortGameCounts.p3 = 3;
    const chosen = chooseShortCourtPlayers(players, 2, history, [
      { player1Id: 'p0', player2Id: 'p1' },
    ]);
    expect(chosen.map((p) => p.id).sort()).toEqual(['p2', 'p3']);
  });
});

describe('partnerships alongside a short court', () => {
  it('keeps every couple on the same team', () => {
    const players = makePlayers(15);
    const partnerships = [
      { player1Id: 'p0', player2Id: 'p1' },
      { player1Id: 'p2', player2Id: 'p3' },
    ];
    const s = generateSchedule(players, 4, 6, [], partnerships);
    for (const r of s.rounds) {
      for (const pr of partnerships) {
        const together = r.courts.some((c) =>
          [c.team1, c.team2].some(
            (t) =>
              t.some((p) => p.id === pr.player1Id) && t.some((p) => p.id === pr.player2Id)
          )
        );
        const bothOut = [pr.player1Id, pr.player2Id].every((id) =>
          r.sitOuts.some((p) => p.id === id)
        );
        expect(together || bothOut).toBe(true);
      }
    }
  });
});

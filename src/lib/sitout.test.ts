import { describe, it, expect } from 'vitest';
import { addToRemainingRounds } from './sitout';
import type { Player, Round } from '../types';

function player(name: string): Player {
  return { id: `id-${name}`, name, rating: 4, gender: 'M', rosterIds: ['r1'] };
}

function round(roundNumber: number, sitOutNames: string[]): Round {
  return {
    roundNumber,
    courts: [
      {
        courtNumber: 1,
        team1: [player('A'), player('B')],
        team2: [player('C'), player('D')],
        ratingDiff: 0,
      },
    ],
    sitOuts: sitOutNames.map(player),
  };
}

/**
 * A round whose last court is short: one name on `alone` is a 2v1 with a single
 * place spare, none at all is a game of singles with two.
 */
function shortRound(roundNumber: number, alone: string[], sitOutNames: string[] = []): Round {
  return {
    roundNumber,
    courts: [
      {
        courtNumber: 1,
        team1: [player('A'), player('B')],
        team2: [player('C'), player('D')],
        ratingDiff: 0,
      },
      {
        courtNumber: 2,
        team1: [player('E'), player('F')],
        team2: alone.map(player),
        ratingDiff: 0,
      },
    ],
    sitOuts: sitOutNames.map(player),
  };
}

const sizes = (r: Round) => r.courts.map((c) => c.team1.length + c.team2.length);

describe('addToRemainingRounds', () => {
  const latecomer = player('Zoe');

  it('appends the player to the sit-outs of every unplayed round', () => {
    const rounds = [round(1, ['E']), round(2, ['F'])];
    const next = addToRemainingRounds(rounds, [], latecomer);
    expect(next.map((r) => r.sitOuts.map((p) => p.name))).toEqual([
      ['E', 'Zoe'],
      ['F', 'Zoe'],
    ]);
  });

  it('leaves completed rounds untouched, by reference', () => {
    const rounds = [round(1, ['E']), round(2, ['F']), round(3, ['G'])];
    const next = addToRemainingRounds(rounds, [1, 2], latecomer);
    expect(next[0]).toBe(rounds[0]);
    expect(next[1]).toBe(rounds[1]);
    expect(next[2].sitOuts.map((p) => p.name)).toEqual(['G', 'Zoe']);
  });

  it('honours an out-of-order completed set, not a prefix', () => {
    const rounds = [round(1, []), round(2, []), round(3, [])];
    const next = addToRemainingRounds(rounds, [2], latecomer);
    expect(next.map((r) => r.sitOuts.length)).toEqual([1, 0, 1]);
  });

  it('starts a sit-out list for a round where nobody was sitting out', () => {
    const next = addToRemainingRounds([round(1, [])], [], latecomer);
    expect(next[0].sitOuts.map((p) => p.name)).toEqual(['Zoe']);
  });

  it('leaves courts and round numbers alone', () => {
    const rounds = [round(1, ['E'])];
    const next = addToRemainingRounds(rounds, [], latecomer);
    expect(next[0].courts).toEqual(rounds[0].courts);
    expect(next[0].roundNumber).toBe(1);
  });

  it('does not mutate the rounds it was given', () => {
    const rounds = [round(1, ['E'])];
    addToRemainingRounds(rounds, [], latecomer);
    expect(rounds[0].sitOuts.map((p) => p.name)).toEqual(['E']);
  });

  describe('a court the roster could not fill', () => {
    it('stands them in the one place going spare, in every unplayed round', () => {
      const rounds = [shortRound(1, ['G']), shortRound(2, ['G'])];
      const next = addToRemainingRounds(rounds, [], latecomer);

      for (const r of next) {
        expect(sizes(r)).toEqual([4, 4]);
        expect(r.courts[1].team2.map((p) => p.name)).toEqual(['G', 'Zoe']);
        expect(r.sitOuts).toEqual([]);
      }
    });

    it('benches them when two places are spare, because that is a choice', () => {
      const next = addToRemainingRounds([shortRound(1, [])], [], latecomer);

      expect(sizes(next[0])).toEqual([4, 2]);
      expect(next[0].sitOuts.map((p) => p.name)).toEqual(['Zoe']);
    });

    it('benches the next one too, with the same two places still spare', () => {
      const once = addToRemainingRounds([shortRound(1, [])], [], latecomer);
      const twice = addToRemainingRounds(once, [], player('Yan'));

      expect(sizes(twice[0])).toEqual([4, 2]);
      expect(twice[0].sitOuts.map((p) => p.name)).toEqual(['Zoe', 'Yan']);
    });

    it('counts the places across the whole round, not one court at a time', () => {
      // Two courts a player short is two choices, not one gap twice over.
      const twoShort: Round = {
        roundNumber: 1,
        courts: [
          { courtNumber: 1, team1: [player('A'), player('B')], team2: [player('C')], ratingDiff: 0 },
          { courtNumber: 2, team1: [player('E'), player('F')], team2: [player('G')], ratingDiff: 0 },
        ],
        sitOuts: [],
      };
      const next = addToRemainingRounds([twoShort], [], latecomer);

      expect(sizes(next[0])).toEqual([3, 3]);
      expect(next[0].sitOuts.map((p) => p.name)).toEqual(['Zoe']);
    });

    it('leaves a played round short rather than filling it', () => {
      const rounds = [shortRound(1, ['G']), shortRound(2, ['G'])];
      const next = addToRemainingRounds(rounds, [1], latecomer);

      expect(next[0]).toBe(rounds[0]);
      expect(sizes(next[1])).toEqual([4, 4]);
    });

    it('rescores the court it filled, and no other', () => {
      const rounds = [shortRound(1, ['G'])];
      const next = addToRemainingRounds(rounds, [], { ...latecomer, rating: 2 });

      // 4 + 4 against 4 + 2, compared by totals now both sides are even.
      expect(next[0].courts[1].ratingDiff).toBeCloseTo(2);
      expect(next[0].courts[0]).toBe(rounds[0].courts[0]);
    });

    it('does not mutate the round it filled', () => {
      const rounds = [shortRound(1, ['G'])];
      addToRemainingRounds(rounds, [], latecomer);
      expect(sizes(rounds[0])).toEqual([4, 3]);
    });
  });
});

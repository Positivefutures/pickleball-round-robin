import { describe, it, expect } from 'vitest';
import { addToRemainingSitOuts } from './sitout';
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

describe('addToRemainingSitOuts', () => {
  const latecomer = player('Zoe');

  it('appends the player to the sit-outs of every unplayed round', () => {
    const rounds = [round(1, ['E']), round(2, ['F'])];
    const next = addToRemainingSitOuts(rounds, [], latecomer);
    expect(next.map((r) => r.sitOuts.map((p) => p.name))).toEqual([
      ['E', 'Zoe'],
      ['F', 'Zoe'],
    ]);
  });

  it('leaves completed rounds untouched, by reference', () => {
    const rounds = [round(1, ['E']), round(2, ['F']), round(3, ['G'])];
    const next = addToRemainingSitOuts(rounds, [1, 2], latecomer);
    expect(next[0]).toBe(rounds[0]);
    expect(next[1]).toBe(rounds[1]);
    expect(next[2].sitOuts.map((p) => p.name)).toEqual(['G', 'Zoe']);
  });

  it('honours an out-of-order completed set, not a prefix', () => {
    const rounds = [round(1, []), round(2, []), round(3, [])];
    const next = addToRemainingSitOuts(rounds, [2], latecomer);
    expect(next.map((r) => r.sitOuts.length)).toEqual([1, 0, 1]);
  });

  it('starts a sit-out list for a round where nobody was sitting out', () => {
    const next = addToRemainingSitOuts([round(1, [])], [], latecomer);
    expect(next[0].sitOuts.map((p) => p.name)).toEqual(['Zoe']);
  });

  it('leaves courts and round numbers alone', () => {
    const rounds = [round(1, ['E'])];
    const next = addToRemainingSitOuts(rounds, [], latecomer);
    expect(next[0].courts).toEqual(rounds[0].courts);
    expect(next[0].roundNumber).toBe(1);
  });

  it('does not mutate the rounds it was given', () => {
    const rounds = [round(1, ['E'])];
    addToRemainingSitOuts(rounds, [], latecomer);
    expect(rounds[0].sitOuts.map((p) => p.name)).toEqual(['E']);
  });
});

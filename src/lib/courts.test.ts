import { describe, it, expect } from 'vitest';
import { addCourtToRemaining, removeCourtFromRemaining } from './courts';
import type { CourtAssignment, Player, Round } from '../types';

function player(name: string, rating = 4): Player {
  return { id: `id-${name}`, name, rating, gender: 'M', rosterIds: ['r1'] };
}

function court(courtNumber: number, t1: string[], t2: string[]): CourtAssignment {
  return {
    courtNumber,
    team1: t1.map((n) => player(n)),
    team2: t2.map((n) => player(n)),
    ratingDiff: 0,
  };
}

/** Two full courts and whoever is named on the bench. */
function round(roundNumber: number, bench: string[], courts = [court(1, ['A', 'B'], ['C', 'D']), court(2, ['E', 'F'], ['G', 'H'])]): Round {
  return { roundNumber, courts, sitOuts: bench.map((n) => player(n)) };
}

const names = (c: CourtAssignment) => [...c.team1, ...c.team2].map((p) => p.name).sort();
const benchNames = (r: Round) => r.sitOuts.map((p) => p.name).sort();

describe('addCourtToRemaining', () => {
  it('adds the court to every round still to be played and seats the bench on it', () => {
    const rounds = [round(1, ['I', 'J', 'K', 'L']), round(2, ['I', 'J', 'K', 'L'])];
    const next = addCourtToRemaining(rounds, []);

    for (const r of next) {
      expect(r.courts).toHaveLength(3);
      expect(names(r.courts[2])).toEqual(['I', 'J', 'K', 'L']);
      expect(r.courts[2].team1).toHaveLength(2);
      expect(r.courts[2].team2).toHaveLength(2);
      expect(r.sitOuts).toEqual([]);
    }
  });

  it('leaves rounds already played exactly as they were, by reference', () => {
    const rounds = [round(1, ['I', 'J', 'K', 'L']), round(2, ['I', 'J', 'K', 'L'])];
    const next = addCourtToRemaining(rounds, [1]);

    expect(next[0]).toBe(rounds[0]);
    expect(next[1].courts).toHaveLength(3);
  });

  it('numbers the new court one past the highest, not one past the count', () => {
    // A centre that gave out courts 7 and 8 has just given out court 9.
    const renamed = [court(7, ['A', 'B'], ['C', 'D']), court(8, ['E', 'F'], ['G', 'H'])];
    const next = addCourtToRemaining([round(1, ['I', 'J'], renamed)], []);
    expect(next[0].courts.map((c) => c.courtNumber)).toEqual([7, 8, 9]);
  });

  it('takes the players who have had fewest games, not the first ones waiting', () => {
    // K and L have played a round. I, J and M have played nothing, and a bench
    // of five over four places means one of K and L stays standing.
    const played = round(1, ['I', 'J', 'M'], [court(1, ['K', 'L'], ['G', 'H'])]);
    const open = round(2, ['I', 'J', 'K', 'L', 'M'], [court(1, ['A', 'B'], ['C', 'D'])]);

    const seated = addCourtToRemaining([played, open], [1])[1];

    const on = names(seated.courts[1]);
    expect(on).toContain('I');
    expect(on).toContain('J');
    expect(on).toContain('M');
    expect(seated.sitOuts).toHaveLength(1);
    expect(['K', 'L']).toContain(seated.sitOuts[0].name);
  });

  it('plays a bench of three as a 2v1 and a bench of two as singles', () => {
    const three = addCourtToRemaining([round(1, ['I', 'J', 'K'])], [])[0];
    expect(names(three.courts[2])).toEqual(['I', 'J', 'K']);
    expect(three.sitOuts).toEqual([]);

    const two = addCourtToRemaining([round(1, ['I', 'J'])], [])[0];
    expect(two.courts[2].team1).toHaveLength(1);
    expect(two.courts[2].team2).toHaveLength(1);
  });

  it('leaves the court empty rather than standing one person on it alone', () => {
    const one = addCourtToRemaining([round(1, ['I'])], [])[0];
    expect(one.courts[2]).toEqual({ courtNumber: 3, team1: [], team2: [], ratingDiff: 0 });
    expect(benchNames(one)).toEqual(['I']);

    const none = addCourtToRemaining([round(1, [])], [])[0];
    expect(none.courts[2].team1).toEqual([]);
    expect(none.courts[2].team2).toEqual([]);
  });

  it('keeps a couple on the same side of the new court', () => {
    const next = addCourtToRemaining(
      [round(1, ['I', 'J', 'K', 'L'])],
      [],
      [{ player1Id: 'id-J', player2Id: 'id-L' }]
    )[0];
    const side = next.courts[2].team1.map((p) => p.name).sort();
    expect(side).toEqual(['J', 'L']);
  });

  it('splits for balance and recomputes the diff of the court it builds', () => {
    const open: Round = {
      roundNumber: 1,
      courts: [court(1, ['A', 'B'], ['C', 'D'])],
      sitOuts: [player('W', 5), player('X', 4.5), player('Y', 3.5), player('Z', 3)],
    };
    const built = addCourtToRemaining([open], [])[0].courts[1];

    // Strongest with weakest against the middle pair: 5+3 against 4.5+3.5.
    expect(built.team1.map((p) => p.name).sort()).toEqual(['W', 'Z']);
    expect(built.team2.map((p) => p.name).sort()).toEqual(['X', 'Y']);
    expect(built.ratingDiff).toBe(0);
  });
});

describe('removeCourtFromRemaining', () => {
  it('takes the court out of the rounds still to be played and benches everyone on it', () => {
    const rounds = [round(1, ['I']), round(2, ['I'])];
    const next = removeCourtFromRemaining(rounds, [], 2);

    for (const r of next) {
      expect(r.courts.map((c) => c.courtNumber)).toEqual([1]);
      expect(benchNames(r)).toEqual(['E', 'F', 'G', 'H', 'I']);
    }
  });

  it('leaves rounds already played holding the court, by reference', () => {
    const rounds = [round(1, []), round(2, [])];
    const next = removeCourtFromRemaining(rounds, [1], 2);

    expect(next[0]).toBe(rounds[0]);
    expect(next[0].courts).toHaveLength(2);
    expect(next[1].courts).toHaveLength(1);
  });

  it('goes by the number on the court, and leaves the others theirs', () => {
    // Losing court 8 does not turn court 9 into court 8.
    const renamed = [
      court(7, ['A', 'B'], ['C', 'D']),
      court(8, ['E', 'F'], ['G', 'H']),
      court(9, ['I', 'J'], ['K', 'L']),
    ];
    const next = removeCourtFromRemaining([round(1, [], renamed)], [], 8)[0];
    expect(next.courts.map((c) => c.courtNumber)).toEqual([7, 9]);
    expect(benchNames(next)).toEqual(['E', 'F', 'G', 'H']);
  });

  it('does nothing to a round that has no such court', () => {
    const rounds = [round(1, [])];
    expect(removeCourtFromRemaining(rounds, [], 99)[0]).toBe(rounds[0]);
  });
});

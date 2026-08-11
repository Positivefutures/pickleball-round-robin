import { describe, it, expect } from 'vitest';
import { standings, winnerOfScore, winnerOf, isScored, hasAnyScore } from './standings';
import type { CourtAssignment, CourtScore, Player, Round, Schedule } from '../types';

function player(name: string): Player {
  return { id: `id-${name}`, name, rating: 4, gender: 'M', rosterIds: ['r1'] };
}

function court(
  courtNumber: number,
  t1: string[],
  t2: string[],
  score?: CourtScore
): CourtAssignment {
  const c: CourtAssignment = {
    courtNumber,
    team1: t1.map(player),
    team2: t2.map(player),
    ratingDiff: 0,
  };
  if (score) c.score = score;
  return c;
}

function schedule(rounds: Round[]): Schedule {
  return { rounds };
}

function round(roundNumber: number, courts: CourtAssignment[], bench: string[] = []): Round {
  return { roundNumber, courts, sitOuts: bench.map(player) };
}

/** The row for one name, by name rather than by rank. */
function rowFor(rows: ReturnType<typeof standings>, name: string) {
  const row = rows.find((r) => r.player.name === name);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const order = (rows: ReturnType<typeof standings>) => rows.map((r) => r.player.name);

describe('winnerOfScore', () => {
  it('names the higher side', () => {
    expect(winnerOfScore({ team1: 11, team2: 7 })).toBe('team1');
    expect(winnerOfScore({ team1: 7, team2: 11 })).toBe('team2');
  });

  it('gives a level game to neither side', () => {
    expect(winnerOfScore({ team1: 11, team2: 11 })).toBeNull();
    expect(winnerOfScore({ team1: 0, team2: 0 })).toBeNull();
  });
});

describe('isScored and winnerOf', () => {
  it('is false for a court nobody has scored', () => {
    expect(isScored(court(1, ['A', 'B'], ['C', 'D']))).toBe(false);
    expect(winnerOf(court(1, ['A', 'B'], ['C', 'D']))).toBeNull();
  });

  it('is false for a court with nobody on one side, score or not', () => {
    // An added court waiting for players. A score on it describes no game.
    expect(isScored(court(3, [], [], { team1: 11, team2: 7 }))).toBe(false);
    expect(isScored(court(3, ['A', 'B'], [], { team1: 11, team2: 7 }))).toBe(false);
  });

  it('is true once a real game has a score', () => {
    expect(isScored(court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 7 }))).toBe(true);
  });
});

describe('hasAnyScore', () => {
  it('is false on a session nobody has scored', () => {
    expect(hasAnyScore(schedule([round(1, [court(1, ['A', 'B'], ['C', 'D'])])]))).toBe(false);
  });

  it('is true once one court has a score', () => {
    const s = schedule([
      round(1, [court(1, ['A', 'B'], ['C', 'D']), court(2, ['E', 'F'], ['G', 'H'], { team1: 11, team2: 9 })]),
    ]);
    expect(hasAnyScore(s)).toBe(true);
  });
});

describe('standings', () => {
  it('gives the winners a win and the losers the difference', () => {
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 7 })])]),
      ['A', 'B', 'C', 'D'].map(player)
    );

    for (const name of ['A', 'B']) {
      expect(rowFor(rows, name)).toMatchObject({
        wins: 1, losses: 0, played: 1, pointsFor: 11, pointsAgainst: 7, differential: 4,
      });
    }
    for (const name of ['C', 'D']) {
      expect(rowFor(rows, name)).toMatchObject({
        wins: 0, losses: 1, played: 1, pointsFor: 7, pointsAgainst: 11, differential: -4,
      });
    }
  });

  it('gives a level game to nobody, and still counts it as played', () => {
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 11 })])]),
      ['A', 'B', 'C', 'D'].map(player)
    );

    for (const name of ['A', 'B', 'C', 'D']) {
      expect(rowFor(rows, name)).toMatchObject({
        wins: 0, losses: 0, played: 1, pointsFor: 11, differential: 0,
      });
    }
  });

  it('counts nothing from a court nobody has scored', () => {
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C', 'D'])])]),
      ['A', 'B', 'C', 'D'].map(player)
    );
    for (const name of ['A', 'B', 'C', 'D']) {
      expect(rowFor(rows, name)).toMatchObject({ played: 0, wins: 0, pointsFor: 0 });
    }
  });

  it('counts only what has been scored in a half-scored session', () => {
    const rows = standings(
      schedule([
        round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 5 })]),
        round(2, [court(1, ['A', 'C'], ['B', 'D'])]),
      ]),
      ['A', 'B', 'C', 'D'].map(player)
    );
    expect(rowFor(rows, 'A')).toMatchObject({ played: 1, wins: 1, pointsFor: 11 });
    expect(rowFor(rows, 'D')).toMatchObject({ played: 1, losses: 1, pointsFor: 5 });
  });

  it('ranks on wins before differential', () => {
    // A takes two narrow games; C wins one by a mile and loses two.
    const rows = standings(
      schedule([
        round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 9 })]),
        round(2, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 9 })]),
        round(3, [court(1, ['A', 'B'], ['C', 'D'], { team1: 0, team2: 21 })]),
      ]),
      ['A', 'B', 'C', 'D'].map(player)
    );
    expect(rowFor(rows, 'A')).toMatchObject({ wins: 2, differential: -17 });
    expect(rowFor(rows, 'C')).toMatchObject({ wins: 1, differential: 17 });
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ranks on differential when wins are level', () => {
    const rows = standings(
      schedule([
        round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 1 })]),
        round(2, [court(1, ['C', 'D'], ['A', 'B'], { team1: 11, team2: 9 })]),
      ]),
      ['A', 'B', 'C', 'D'].map(player)
    );
    expect(rowFor(rows, 'A')).toMatchObject({ wins: 1, differential: 8 });
    expect(rowFor(rows, 'C')).toMatchObject({ wins: 1, differential: -8 });
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ranks on points when wins and differential are level', () => {
    // Both pairs win one and lose one by the same margin. E and F did it in
    // higher-scoring games, so they go first.
    const rows = standings(
      schedule([
        round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 6, team2: 4 })]),
        round(2, [court(1, ['C', 'D'], ['A', 'B'], { team1: 6, team2: 4 })]),
        round(3, [court(1, ['E', 'F'], ['G', 'H'], { team1: 21, team2: 19 })]),
        round(4, [court(1, ['G', 'H'], ['E', 'F'], { team1: 21, team2: 19 })]),
      ]),
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(player)
    );
    expect(rowFor(rows, 'E')).toMatchObject({ wins: 1, differential: 0, pointsFor: 40 });
    expect(rowFor(rows, 'A')).toMatchObject({ wins: 1, differential: 0, pointsFor: 10 });
    expect(order(rows)).toEqual(['E', 'F', 'G', 'H', 'A', 'B', 'C', 'D']);
  });

  it('falls back to name, so equal players do not swap places between renders', () => {
    const players = ['Dee', 'Cal', 'Bea', 'Al'].map(player);
    const s = schedule([round(1, [], ['Dee', 'Cal', 'Bea', 'Al'])]);

    expect(order(standings(s, players))).toEqual(['Al', 'Bea', 'Cal', 'Dee']);
    // Same players, different order in: a substitution moves the incoming
    // player to the end of the list, and the table must not notice.
    expect(order(standings(s, [...players].reverse()))).toEqual(['Al', 'Bea', 'Cal', 'Dee']);
  });

  it('gives the lone player on a 2v1 the whole win, same as each of the pair', () => {
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C'], { team1: 11, team2: 8 })])]),
      ['A', 'B', 'C'].map(player)
    );
    expect(rowFor(rows, 'A')).toMatchObject({ wins: 1, pointsFor: 11, differential: 3 });
    expect(rowFor(rows, 'B')).toMatchObject({ wins: 1, pointsFor: 11, differential: 3 });
    expect(rowFor(rows, 'C')).toMatchObject({ losses: 1, pointsFor: 8, differential: -3 });
  });

  it('gives the lone player the whole win when it is theirs', () => {
    // The other way round from the case above, and the one the module actually
    // promises: one player beating two takes a full win, not half of one.
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C'], { team1: 8, team2: 11 })])]),
      ['A', 'B', 'C'].map(player)
    );
    expect(rowFor(rows, 'C')).toMatchObject({ wins: 1, losses: 0, pointsFor: 11, differential: 3 });
    expect(order(rows)[0]).toBe('C');
  });

  it('scores a game of singles', () => {
    const rows = standings(
      schedule([round(1, [court(1, ['A'], ['B'], { team1: 11, team2: 4 })])]),
      ['A', 'B'].map(player)
    );
    expect(rowFor(rows, 'A')).toMatchObject({ wins: 1, losses: 0 });
    expect(rowFor(rows, 'B')).toMatchObject({ wins: 0, losses: 1 });
  });

  it('gives somebody who sat out a row of zeros, at the bottom', () => {
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 7 })], ['Zoe'])]),
      ['A', 'B', 'C', 'D', 'Zoe'].map(player)
    );
    expect(rowFor(rows, 'Zoe')).toMatchObject({ wins: 0, losses: 0, played: 0, pointsFor: 0 });
    // Below the losers: they are level on wins, but 0 beats their negative diff…
    expect(order(rows).indexOf('Zoe')).toBeGreaterThan(order(rows).indexOf('A'));
    expect(rows).toHaveLength(5);
  });

  it('keeps a guest in the table', () => {
    const guest: Player = { ...player('Sam'), guest: true };
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 7 })])]),
      [...['A', 'B', 'C', 'D'].map(player), guest]
    );
    expect(rowFor(rows, 'Sam').player.guest).toBe(true);
  });

  it('keeps the games of somebody who has gone home', () => {
    // handleRemovePlayer takes them out of the session, but the rounds they
    // played still hold them. Their wins happened.
    const rows = standings(
      schedule([round(1, [court(1, ['A', 'Gone'], ['C', 'D'], { team1: 11, team2: 7 })])]),
      ['A', 'C', 'D'].map(player)
    );
    expect(rowFor(rows, 'Gone')).toMatchObject({ wins: 1, pointsFor: 11 });
  });

  it('ignores a score on a court with nobody on one side', () => {
    const rows = standings(
      schedule([
        round(1, [
          court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 7 }),
          court(2, [], [], { team1: 11, team2: 0 }),
        ]),
      ]),
      ['A', 'B', 'C', 'D'].map(player)
    );
    expect(rows).toHaveLength(4);
    expect(rowFor(rows, 'A')).toMatchObject({ played: 1 });
  });

  it('adds a player up across rounds', () => {
    const rows = standings(
      schedule([
        round(1, [court(1, ['A', 'B'], ['C', 'D'], { team1: 11, team2: 7 })]),
        round(2, [court(1, ['A', 'C'], ['B', 'D'], { team1: 5, team2: 11 })]),
      ]),
      ['A', 'B', 'C', 'D'].map(player)
    );
    expect(rowFor(rows, 'A')).toMatchObject({
      wins: 1, losses: 1, played: 2, pointsFor: 16, pointsAgainst: 18, differential: -2,
    });
  });
});

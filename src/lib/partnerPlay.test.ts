import { describe, it, expect } from 'vitest';
import { generateSchedule, regenerateRemaining, extendSchedule } from './pairing';
import { fixtureList, matchKey, partnerPlayTeams } from './partnerPlay';
import type { Player, Partnership, Round, Schedule } from '../types';

/**
 * A night of partner play. Everybody has a partner, the teams stay together all
 * evening, and every team must meet every other team before it meets any of them
 * twice. These tests are about the fixture list, not about variety heuristics:
 * unlike the rest of the pairing suite there is nothing probabilistic here, so
 * they assert on exact sequences rather than on measured distributions.
 */

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(2, '0')}`,
    name: `P${i}`,
    rating: 3.0 + (i % 5) * 0.25,
    gender: (i % 2 === 0 ? 'M' : 'F') as 'M' | 'F',
    rosterIds: ['r1'],
  }));
}

/** Pairs (0,1), (2,3), … across the whole roster; the odd one out is left spare. */
function pairEveryone(players: Player[]): Partnership[] {
  const out: Partnership[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    out.push({ player1Id: players[i].id, player2Id: players[i + 1].id });
  }
  return out;
}

/** "P0+P1 v P4+P5", with the two sides in a fixed order so it can be compared. */
function fixtureOf(court: { team1: Player[]; team2: Player[] }): string {
  const side = (t: Player[]) => t.map((p) => p.id).sort().join('+');
  return matchKey(side(court.team1), side(court.team2));
}

function fixturesIn(rounds: Round[]): string[] {
  return rounds.flatMap((r) => r.courts.map(fixtureOf));
}

/** Every court in every round, as a comparable string, round by round. */
function shapeOf(rounds: Round[]): string[] {
  return rounds.map((r) => r.courts.map(fixtureOf).join(' | '));
}

describe('fixtureList', () => {
  it('pairs every team with every other exactly once', () => {
    for (const teams of [2, 3, 4, 5, 6, 8, 9, 10]) {
      const list = fixtureList(teams);
      expect(list).toHaveLength((teams * (teams - 1)) / 2);
      const keys = new Set(list.map((m) => `${m.a}-${m.b}`));
      expect(keys.size).toBe(list.length);
      for (const m of list) expect(m.a).toBeLessThan(m.b);
    }
  });

  it('gives every team the same number of games per turn of the circle', () => {
    // Six teams, three courts: each turn of the circle is one full round, and
    // nobody should appear twice in it.
    const list = fixtureList(6);
    for (let turn = 0; turn < 5; turn++) {
      const inTurn = list.slice(turn * 3, turn * 3 + 3);
      const seen = inTurn.flatMap((m) => [m.a, m.b]);
      expect(new Set(seen).size).toBe(6);
    }
  });
});

describe('partnerPlayTeams', () => {
  it('recognises a fully partnered roster', () => {
    const players = makePlayers(16);
    const found = partnerPlayTeams(players, pairEveryone(players));
    expect(found?.teams).toHaveLength(8);
    expect(found?.spares).toHaveLength(0);
  });

  it('allows the one player an odd roster cannot pair', () => {
    const players = makePlayers(13);
    const found = partnerPlayTeams(players, pairEveryone(players));
    expect(found?.teams).toHaveLength(6);
    expect(found?.spares.map((p) => p.id)).toEqual(['p12']);
  });

  it('is not partner play when two players are left unpartnered', () => {
    const players = makePlayers(16);
    // Drop the last couple, leaving p14 and p15 loose.
    const partial = pairEveryone(players).slice(0, 7);
    expect(partnerPlayTeams(players, partial)).toBeNull();
  });

  it('orders teams the same way whatever order the couples were made in', () => {
    const players = makePlayers(12);
    const forwards = pairEveryone(players);
    const backwards = [...forwards].reverse();
    const a = partnerPlayTeams(players, forwards)!.teams.map((t) => t.key);
    const b = partnerPlayTeams(players, backwards)!.teams.map((t) => t.key);
    expect(a).toEqual(b);
  });
});

describe('a night of partner play', () => {
  it('plays every team against every other before any rematch', () => {
    // 8 teams on 4 courts: 28 fixtures, 4 a round, so 7 rounds is exactly one
    // complete round robin.
    const players = makePlayers(16);
    const s = generateSchedule(players, 4, 7, undefined, pairEveryone(players));

    const played = fixturesIn(s.rounds);
    expect(played).toHaveLength(28);
    expect(new Set(played).size).toBe(28);
  });

  it('never splits a team, all session', () => {
    const players = makePlayers(16);
    const partnerships = pairEveryone(players);
    const s = generateSchedule(players, 3, 12, undefined, partnerships);

    const partnerOf = new Map<string, string>();
    for (const pr of partnerships) {
      partnerOf.set(pr.player1Id, pr.player2Id);
      partnerOf.set(pr.player2Id, pr.player1Id);
    }
    for (const r of s.rounds) {
      for (const c of r.courts) {
        for (const team of [c.team1, c.team2]) {
          expect(team).toHaveLength(2);
          expect(partnerOf.get(team[0].id)).toBe(team[1].id);
        }
      }
    }
  });

  it('repeats the first pass in the same order once the fixtures run out', () => {
    // 4 teams on 2 courts: 6 fixtures, 2 a round, so a pass is 3 rounds.
    const players = makePlayers(8);
    const s = generateSchedule(players, 2, 9, undefined, pairEveryone(players));

    const shape = shapeOf(s.rounds);
    expect(shape.slice(3, 6)).toEqual(shape.slice(0, 3));
    expect(shape.slice(6, 9)).toEqual(shape.slice(0, 3));
  });

  it('opens the next pass early rather than leave a court empty', () => {
    // 8 teams on 3 courts: 28 fixtures is not a multiple of 3, so the round that
    // plays the 28th has two courts spare. They are filled from the top of the
    // next pass — two teams start their second meeting while two others are
    // still waiting on their first, which is the price of not idling a court.
    const players = makePlayers(16);
    const s = generateSchedule(players, 3, 10, undefined, pairEveryone(players));

    for (const r of s.rounds) expect(r.courts).toHaveLength(3);

    // All 28 still get played, and nothing is played three times in ten rounds.
    const played = fixturesIn(s.rounds);
    expect(new Set(played).size).toBe(28);
    const counts = new Map<string, number>();
    for (const f of played) counts.set(f, (counts.get(f) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBe(2);
    expect([...counts.values()].filter((n) => n === 2)).toHaveLength(2);
  });

  it('still fills every pass exactly when the courts divide the fixtures', () => {
    // 8 teams on 4 courts: 28 fixtures, 4 a round. No round is ever mixed, so
    // the early-start rule never comes into it.
    const players = makePlayers(16);
    const s = generateSchedule(players, 4, 14, undefined, pairEveryone(players));

    const first = fixturesIn(s.rounds.slice(0, 7));
    const second = fixturesIn(s.rounds.slice(7, 14));
    expect(new Set(first).size).toBe(28);
    expect(second).toEqual(first);
  });

  it('shares the sit-outs out evenly over a full pass', () => {
    // 8 teams, 2 courts: 4 of 16 players are on court each round, and 14 rounds
    // is one complete pass.
    const players = makePlayers(16);
    const s = generateSchedule(players, 2, 14, undefined, pairEveryone(players));

    const sat = new Map<string, number>();
    for (const r of s.rounds) {
      for (const p of r.sitOuts) sat.set(p.id, (sat.get(p.id) ?? 0) + 1);
    }
    expect(new Set(sat.values())).toEqual(new Set([7]));
  });

  it('gives an odd roster its round robin, and the spare no game', () => {
    const players = makePlayers(13);
    const s = generateSchedule(players, 3, 5, undefined, pairEveryone(players));

    // 6 teams: 15 fixtures, 3 a round, so 5 rounds is one complete pass.
    const played = fixturesIn(s.rounds);
    expect(new Set(played).size).toBe(15);

    for (const r of s.rounds) {
      expect(r.sitOuts.map((p) => p.id)).toEqual(['p12']);
    }
  });

  it('copes with the smallest partner-play night there is', () => {
    // Two couples and one court: there is only one fixture, so every round is
    // that fixture. Nothing to round robin, and nothing to fall over on.
    const players = makePlayers(4);
    const s = generateSchedule(players, 2, 4, undefined, pairEveryone(players));

    expect(s.rounds).toHaveLength(4);
    for (const r of s.rounds) {
      expect(r.courts).toHaveLength(1);
      expect(r.sitOuts).toHaveLength(0);
    }
    expect(new Set(fixturesIn(s.rounds)).size).toBe(1);
  });

  it('rotates the bye when there is an odd number of teams', () => {
    // 5 teams on 2 courts: every round one team is left over.
    const players = makePlayers(10);
    const s = generateSchedule(players, 2, 10, undefined, pairEveryone(players));

    const played = fixturesIn(s.rounds);
    expect(new Set(played).size).toBe(10);

    const sat = new Map<string, number>();
    for (const r of s.rounds) {
      for (const p of r.sitOuts) sat.set(p.id, (sat.get(p.id) ?? 0) + 1);
    }
    expect(new Set(sat.values())).toEqual(new Set([2]));
  });
});

describe('rebuilding a partner-play session', () => {
  it('carries on down the fixture list rather than starting again', () => {
    const players = makePlayers(16);
    const partnerships = pairEveryone(players);
    const s = generateSchedule(players, 4, 7, undefined, partnerships);

    // The host plays the first three rounds, then reshuffles the rest.
    const done = [1, 2, 3];
    const again = regenerateRemaining(
      players, 4, s.rounds, done, undefined, partnerships
    );

    const played = fixturesIn(again.rounds);
    expect(played).toHaveLength(28);
    expect(new Set(played).size).toBe(28);
  });

  it('keeps going down the list when rounds are added', () => {
    const players = makePlayers(16);
    const partnerships = pairEveryone(players);
    const s = generateSchedule(players, 4, 4, undefined, partnerships);
    const longer = extendSchedule(players, 4, s.rounds, 3, undefined, partnerships);

    expect(longer.rounds).toHaveLength(7);
    const played = fixturesIn(longer.rounds);
    expect(new Set(played).size).toBe(28);
    // The rounds already on the sheet did not move.
    expect(shapeOf(longer.rounds).slice(0, 4)).toEqual(shapeOf(s.rounds));
  });
});

describe('what partner play stands down for', () => {
  it('lets a special game type overrule it, without spending a fixture', () => {
    const players = makePlayers(16);
    const partnerships = pairEveryone(players);

    // Every couple here is a man and a woman, so a gendered round has to split
    // all of them. That round is outside the round robin: it spends no fixture,
    // so the seven ordinary rounds still hold a complete one.
    const s = generateSchedule(
      players,
      4,
      8,
      {
        gendered: { enabled: true, frequency: 8, order: 0 },
        mixed: { enabled: false, frequency: 2, order: 1 },
        skill: { enabled: false, frequency: 2, order: 2 },
      },
      partnerships
    );

    const special = s.rounds.filter((r) => r.roundType);
    expect(special).toHaveLength(1);

    const ordinary = s.rounds.filter((r) => !r.roundType);
    expect(ordinary).toHaveLength(7);
    const played = fixturesIn(ordinary);
    expect(played).toHaveLength(28);
    expect(new Set(played).size).toBe(28);
  });

  it('falls back to the ordinary solver when a couple is broken for a round', () => {
    const players = makePlayers(16);
    const partnerships = pairEveryone(players);
    const s = generateSchedule(players, 4, 7, undefined, partnerships);

    // Breaking one couple in round 2 leaves two players unpartnered, which is
    // not partner play any more, so that round is built the old way. The other
    // seven couples are still couples, and the two freed players are no longer
    // held together — the solver may still put them on the same team, so what is
    // asserted here is that everybody else stayed put.
    const broken = { 1: [`${players[0].id}|${players[1].id}`] };
    const again: Schedule = regenerateRemaining(
      players, 4, s.rounds, [], undefined, partnerships, {}, broken
    );

    const round2 = again.rounds[1];
    const sitting = new Set(round2.sitOuts.map((p) => p.id));
    for (const pr of partnerships.slice(1)) {
      if (sitting.has(pr.player1Id) && sitting.has(pr.player2Id)) continue;
      const together = round2.courts.some((c) =>
        [c.team1, c.team2].some((t) => {
          const ids = t.map((p) => p.id);
          return ids.includes(pr.player1Id) && ids.includes(pr.player2Id);
        })
      );
      expect(together).toBe(true);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { generateSchedule, regenerateRemaining } from './pairing';
import { replacePlayerInRounds, sitOutSeats } from './sitout';
import { remapSession } from './syncMerge';
import { minPlayersForCourts } from './assign';
import type { Partnership, Player, Round, RoundPlan } from '../types';

// Locked sit-outs: the host benches somebody for a round on Choose Sit-Outs, or
// with the padlock under their name on the schedule, and every build of that
// round keeps them there while the rotation stays fair around them.

function roster(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    rating: 3 + ((i * 7) % 20) / 10,
    gender: i % 2 === 0 ? 'F' : 'M',
    rosterIds: ['r'],
  }));
}

const sat = (round: Round) => round.sitOuts.map((p) => p.id);
const playing = (round: Round) =>
  round.courts.flatMap((c) => [...c.team1, ...c.team2]).map((p) => p.id);

/** How many times each player has sat, over the given rounds. */
function sitCounts(rounds: Round[], players: Player[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  for (const r of rounds) for (const id of sat(r)) counts[id] += 1;
  return counts;
}

/** Everyone is somewhere, once: on a court or on the bench, never both. */
function expectWhole(round: Round, players: Player[]) {
  const ids = [...playing(round), ...sat(round)];
  expect(ids.sort()).toEqual(players.map((p) => p.id).sort());
}

// Repeated because the rotation draws a random tie-break. Every claim below has
// to hold whatever it draws.
const RUNS = 25;

describe('a sit-out locked to a round', { timeout: 60_000 }, () => {
  it('stays on the bench in that round, and the round says it is locked', () => {
    for (let run = 0; run < RUNS; run++) {
      const players = roster(10);
      const s = generateSchedule(players, 2, 8, [], [], { 1: ['p3'], 4: ['p3', 'p7'] });
      expect(sat(s.rounds[0])).toContain('p3');
      expect(s.rounds[0].lockedSitOutIds).toEqual(['p3']);
      expect(sat(s.rounds[3]).sort()).toEqual(['p3', 'p7']);
      expect(s.rounds[3].lockedSitOutIds).toEqual(['p3', 'p7']);
      for (const r of s.rounds) {
        expectWhole(r, players);
        expect(r.sitOuts).toHaveLength(2);
      }
      // Rounds without one carry nothing, not an empty list.
      expect(s.rounds[1]).not.toHaveProperty('lockedSitOutIds');
    }
  });

  it('leaves a schedule with no locks carrying no lock field at all', () => {
    const s = generateSchedule(roster(13), 3, 6);
    for (const r of s.rounds) expect(r).not.toHaveProperty('lockedSitOutIds');
  });
});

describe('the rotation around a locked sit-out (Jeff, 2026-10-02)', { timeout: 60_000 }, () => {
  // Nine players on two courts: one sits each round, so the cycle is nine
  // rounds long.
  it('benches a late arrival from round 1 again only when the cycle comes back round', () => {
    for (let run = 0; run < RUNS; run++) {
      const players = roster(9);
      const s = generateSchedule(players, 2, 12, [], [], { 1: ['p4'] });
      const roundsSat = s.rounds.filter((r) => sat(r).includes('p4')).map((r) => r.roundNumber);
      // Everybody else sits once in rounds 2 to 9, and then it is their turn.
      expect(roundsSat).toEqual([1, 10]);
    }
  });

  it('does not bench somebody locked out twice until everyone else has sat twice', () => {
    for (let run = 0; run < RUNS; run++) {
      const players = roster(9);
      const s = generateSchedule(players, 2, 16, [], [], { 1: ['p4'], 2: ['p4'] });
      for (const r of s.rounds) {
        if (r.roundNumber <= 2 || !sat(r).includes('p4')) continue;
        const before = sitCounts(s.rounds.filter((x) => x.roundNumber < r.roundNumber), players);
        for (const p of players) {
          if (p.id !== 'p4') expect(before[p.id]).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('counts a lock later in the session as a rest already owed', () => {
    // Leaving early, so benched for the last-but-two round. The rotation must
    // not also bench them on the way there.
    for (let run = 0; run < RUNS; run++) {
      const players = roster(9);
      const s = generateSchedule(players, 2, 12, [], [], { 10: ['p4'] });
      const roundsSat = s.rounds.filter((r) => sat(r).includes('p4')).map((r) => r.roundNumber);
      expect(roundsSat.filter((n) => n < 10)).toEqual([]);
      const counts = Object.values(sitCounts(s.rounds, players));
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps everybody else within one sit-out of each other', () => {
    for (let run = 0; run < RUNS; run++) {
      const players = roster(14);
      const pins = { 1: ['p0', 'p1'], 3: ['p5'], 7: ['p0'] };
      const s = generateSchedule(players, 3, 14, [], [], pins);
      const counts = sitCounts(s.rounds, players);
      const others = players.filter((p) => !['p0', 'p1', 'p5'].includes(p.id)).map((p) => counts[p.id]);
      expect(Math.max(...others) - Math.min(...others)).toBeLessThanOrEqual(1);
    }
  });
});

describe('a locked sit-out alongside everything else a round can be', { timeout: 60_000 }, () => {
  // Nine on two courts is a bench one seat wide, so with the lock in it the
  // partner has nowhere to go but a court.
  it('breaks their couple for that round only, and the partner plays', () => {
    const couples: Partnership[] = [
      { player1Id: 'p0', player2Id: 'p1' },
      { player1Id: 'p2', player2Id: 'p3' },
    ];
    for (let run = 0; run < RUNS; run++) {
      const players = roster(9);
      const s = generateSchedule(players, 2, 6, [], couples, { 2: ['p0'] });
      expect(sat(s.rounds[1])).toContain('p0');
      expect(playing(s.rounds[1])).toContain('p1');
      // The other couple is still a couple. Only while both are on a court: a
      // bench one seat wide already takes a couple in turns, one at a time.
      const both = ['p2', 'p3'].every((id) => playing(s.rounds[1]).includes(id));
      if (both) {
        const team = s.rounds[1].courts
          .flatMap((c) => [c.team1, c.team2])
          .find((t) => t.some((p) => p.id === 'p2'))!;
        expect(team.map((p) => p.id).sort()).toEqual(['p2', 'p3']);
      }
      for (const r of s.rounds) expectWhole(r, players);
    }
  });

  it('holds on a night where everybody has a partner', () => {
    const players = roster(10);
    const couples: Partnership[] = [0, 2, 4, 6, 8].map((i) => ({
      player1Id: `p${i}`, player2Id: `p${i + 1}`,
    }));
    for (let run = 0; run < RUNS; run++) {
      const s = generateSchedule(players, 2, 8, [], couples, { 3: ['p4'] });
      expect(sat(s.rounds[2])).toContain('p4');
      expect(s.rounds[2].sitOuts).toHaveLength(2);
      for (const r of s.rounds) expectWhole(r, players);
    }
  });

  it('puts the partner on a court on a partner night with one seat on the bench', () => {
    // Four couples and a spare: the spare is the bench every other round.
    const players = roster(9);
    const couples: Partnership[] = [0, 2, 4, 6].map((i) => ({
      player1Id: `p${i}`, player2Id: `p${i + 1}`,
    }));
    for (let run = 0; run < RUNS; run++) {
      const s = generateSchedule(players, 2, 6, [], couples, { 3: ['p4'] });
      expect(sat(s.rounds[2])).toEqual(['p4']);
      expect(playing(s.rounds[2])).toContain('p5');
      for (const r of s.rounds) expectWhole(r, players);
    }
  });

  it('holds on a special round, which stays special', () => {
    const plan: RoundPlan = [null, 'gendered', 'mixed', 'skill'];
    for (let run = 0; run < RUNS; run++) {
      const players = roster(14);
      const s = generateSchedule(players, 3, 4, plan, [], { 2: ['p0'], 3: ['p1'], 4: ['p2'] });
      expect(sat(s.rounds[1])).toContain('p0');
      expect(sat(s.rounds[2])).toContain('p1');
      expect(sat(s.rounds[3])).toContain('p2');
      expect(s.rounds.map((r) => r.roundType ?? null)).toEqual(plan);
      for (const r of s.rounds) expectWhole(r, players);
    }
  });

  it('holds beside a padlocked pair in the same round', () => {
    for (let run = 0; run < RUNS; run++) {
      const players = roster(10);
      const base = generateSchedule(players, 2, 6, [], [], { 4: ['p9'] });
      const c0 = base.rounds[3].courts[0];
      const lock = { player1Id: c0.team1[0].id, player2Id: c0.team1[1].id, courtIdx: 0, team: 'team1' as const };
      const s = regenerateRemaining(players, 2, base.rounds, [], [], [], { 3: [lock] });
      expect(sat(s.rounds[3])).toContain('p9');
      const team = s.rounds[3].courts[0].team1.map((p) => p.id).sort();
      expect(team).toEqual([lock.player1Id, lock.player2Id].sort());
    }
  });
});

describe('rebuilding a schedule with locked sit-outs', { timeout: 60_000 }, () => {
  it('keeps every lock through a reshuffle', () => {
    for (let run = 0; run < RUNS; run++) {
      const players = roster(11);
      const base = generateSchedule(players, 2, 8, [], [], { 2: ['p1'], 6: ['p1', 'p2', 'p3'] });
      const s = regenerateRemaining(players, 2, base.rounds, [1]);
      expect(s.rounds[1].lockedSitOutIds).toEqual(['p1']);
      expect(sat(s.rounds[1])).toContain('p1');
      expect(sat(s.rounds[5]).sort()).toEqual(['p1', 'p2', 'p3']);
    }
  });

  it('lets a lock go with the player who went home', () => {
    const players = roster(10);
    const base = generateSchedule(players, 2, 6, [], [], { 3: ['p4', 'p6'] });
    const remaining = players.filter((p) => p.id !== 'p6');
    const s = regenerateRemaining(remaining, 2, base.rounds, []);
    expect(s.rounds[2].lockedSitOutIds).toEqual(['p4']);
    expect(sat(s.rounds[2])).toEqual(['p4']);
  });

  it('keeps whoever was chosen first when the bench narrows under the locks', () => {
    const players = roster(10);
    const base = generateSchedule(players, 2, 6, [], [], { 3: ['p4', 'p2'] });
    // One fewer player: one seat on the bench where there were two.
    const remaining = players.filter((p) => p.id !== 'p0');
    const s = regenerateRemaining(remaining, 2, base.rounds, []);
    expect(s.rounds[2].lockedSitOutIds).toEqual(['p4']);
    expect(sat(s.rounds[2])).toEqual(['p4']);
    expect(playing(s.rounds[2])).toContain('p2');
  });

  it('lets every lock go when a court is added and nobody needs to sit', () => {
    const players = roster(10);
    const base = generateSchedule(players, 2, 6, [], [], { 3: ['p4'] });
    const s = regenerateRemaining(players, 3, base.rounds, []);
    expect(s.rounds[2]).not.toHaveProperty('lockedSitOutIds');
    expect(sat(s.rounds[2])).toEqual([]);
  });

  it('leaves a completed round exactly as it was played', () => {
    const players = roster(10);
    const base = generateSchedule(players, 2, 6, [], [], { 1: ['p4'] });
    const s = regenerateRemaining(players, 2, base.rounds, [1]);
    expect(s.rounds[0]).toBe(base.rounds[0]);
  });
});

describe('a lock follows the player it names', { timeout: 60_000 }, () => {
  it('passes to a substitute', () => {
    const players = roster(10);
    const s = generateSchedule(players, 2, 4, [], [], { 2: ['p4'] });
    const sub: Player = { id: 'sub', name: 'Sub', rating: 4, gender: 'F', rosterIds: [] };
    const next = replacePlayerInRounds(s.rounds, 'p4', sub);
    expect(next[1].lockedSitOutIds).toEqual(['sub']);
    expect(sat(next[1])).toContain('sub');
  });

  it('is rewritten when the account adopts new ids', () => {
    const players = roster(10);
    const schedule = generateSchedule(players, 2, 4, [], [], { 2: ['p4'] });
    const out = remapSession(
      {
        activeRosterId: 'r', scheduleRosterId: 'r', schedule,
        selectedIds: [], removedIds: [], partnerships: [],
      },
      { rosters: {}, players: { p4: 'acct-4' } }
    );
    expect(out.schedule!.rounds[1].lockedSitOutIds).toEqual(['acct-4']);
    expect(out.schedule!.rounds[0]).not.toHaveProperty('lockedSitOutIds');
  });
});

describe('sitOutSeats', { timeout: 60_000 }, () => {
  // Every roster Setup will generate for. Below that floor a lone fifth player
  // is benched rather than given a court to themselves, but Generate refuses
  // those rosters, so the line over the list is never asked about them.
  it('is how many the scheduler benches, on every roster Setup will generate', () => {
    for (let n = 5; n <= 21; n++) {
      for (let courts = 1; courts <= 4; courts++) {
        if (n < minPlayersForCourts(courts)) continue;
        const s = generateSchedule(roster(n), courts, 2);
        expect(s.rounds[0].sitOuts.length, `${n} players, ${courts} courts`).toBe(
          sitOutSeats(n, courts)
        );
      }
    }
  });
});
